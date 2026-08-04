const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const storage = require('@/services/storage');
const { sendEmail, sendTelegram } = require('@/services/notify');
const { sanitizeHtml, safeErrorMessage } = require('@/lib/security');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const STORAGE_CHAT_ID = process.env.TELEGRAM_STORAGE_CHAT_ID;
const LOG_CHANNEL_ID = process.env.TELEGRAM_LOG_CHANNEL_ID || STORAGE_CHAT_ID;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 10 } });

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
function appendJsonLog(entry) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFile(path.join(LOG_DIR, 'mail.jsonl'), JSON.stringify(entry) + '\n', () => {});
  } catch (err) {
    console.error('[mail] failed to append json log:', err.message);
  }
}

// POST /api/mail/send — Gmail-style compose: to, subject, body, attachments
router.post('/send', requireAuth, requireRole('admin', 'accountant'), upload.array('attachments', 10), async (req, res) => {
  const rawTo = req.body.to;
  const toList = Array.isArray(rawTo)
    ? rawTo
    : (rawTo ? String(rawTo).split(',').map((s) => s.trim()) : []);
  const subject = (req.body.subject || '').trim();
  const body = req.body.body || '';

  if (!toList.length) return res.status(400).json({ success: false, message: 'At least one recipient is required' });

  const validRecipients = toList
    .map((e) => String(e).trim())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));

  if (!validRecipients.length) return res.status(400).json({ success: false, message: 'No valid recipient emails' });

  const files = req.files || [];
  const attachmentNames = files.map((f) => f.originalname);

  try {
    // Upload attachments to Telegram storage to obtain file_ids (streamed later, no disk)
    const telegramFileIds = [];
    for (const f of files) {
      try {
        const storagePath = `mail/${Date.now()}-${f.originalname}`;
        await storage.uploadFile(storagePath, f.buffer, f.mimetype);
        const tg = await storage.sendFileToTelegram(storagePath, f.originalname, `📎 ${subject || 'Mail attachment'}`);
        if (tg?.document?.file_id) telegramFileIds.push({ name: f.originalname, fileId: tg.document.file_id });
      } catch (err) {
        console.error('[mail] attachment upload failed:', err.message);
      }
    }

    // Build nodemailer attachments, streamed from Telegram file_id when available
    const attachments = [];
    for (const f of files) {
      const ref = telegramFileIds.find((t) => t.name === f.originalname);
      if (ref) {
        const fetched = await storage.getTelegramFileStream(ref.fileId);
        if (fetched) attachments.push({ filename: f.originalname, content: fetched.stream });
      }
      if (!attachments.find((a) => a.filename === f.originalname)) {
        attachments.push({ filename: f.originalname, content: f.buffer });
      }
    }

    const mailRes = await sendEmail({
      to: validRecipients.join(','),
      subject: subject || '(no subject)',
      html: sanitizeHtml(body) || '<p></p>',
      attachments,
    });

    const status = mailRes.ok ? 'sent' : 'failed';
    const errorMessage = mailRes.ok ? null : (mailRes.reason || 'Email delivery failed');

    // Mirror to Telegram log channel
    try {
      await sendTelegram({
        chatId: LOG_CHANNEL_ID,
        text:
          `📧 <b>Mail Sent</b>\n` +
          `📌 <b>Subject:</b> ${subject || '(no subject)'}\n` +
          `👤 From: ${req.user.email}\n` +
          `📨 To: ${validRecipients.join(', ')}\n` +
          `📎 Attachments: ${attachmentNames.length || 0}\n` +
          `✅ Status: ${status}\n` +
          `🕒 ${new Date().toLocaleString('en-IN')}`,
      });
    } catch (err) {
      console.error('[mail] log channel mirror failed:', err.message);
    }

    const { data: logRow, error: logErr } = await supabaseAdmin
      .from('mail_logs')
      .insert({
        subject: subject || '(no subject)',
        sender_id: req.user.id,
        sender_email: req.user.email,
        recipients: validRecipients.map((email) => ({ email, status: status === 'sent' ? 'sent' : 'failed' })),
        body_text: (body || '').replace(/<[^>]+>/g, ' ').slice(0, 2000),
        attachment_names: attachmentNames,
        status,
        error_message: errorMessage,
      })
      .select()
      .single();

    if (logErr) console.error('[mail] log insert failed:', logErr.message);

    appendJsonLog({
      id: logRow?.id,
      subject: subject || '(no subject)',
      sender_email: req.user.email,
      recipients: validRecipients,
      attachment_names: attachmentNames,
      status,
      error_message: errorMessage,
      created_at: new Date().toISOString(),
    });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'send_mail',
      entity: 'mail',
      details: {
        subject: subject || '(no subject)',
        recipients: validRecipients,
        attachments: attachmentNames,
        body_text: (body || '').replace(/<[^>]+>/g, ' ').slice(0, 2000),
        status,
      },
      ipAddress: req.ip,
    });

    if (!mailRes.ok) {
      return res.status(502).json({
        success: false,
        message: errorMessage && errorMessage !== 'Email delivery failed'
          ? `Email delivery failed: ${errorMessage}`
          : 'Email delivery failed. Please try again later.',
      });
    }
    return res.json({ success: true, result: { subject, recipients: validRecipients, status, attachments: attachmentNames.length } });
  } catch (err) {
    console.error('[mail] send failed:', safeErrorMessage(err));
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

// GET /api/mail/logs — visible to all authenticated roles (metadata only)
// Reads from the dedicated mail_logs table when present, otherwise falls back
// to activity_logs (entity = 'mail') so the Sent folder always works.
router.get('/logs', requireAuth, async (req, res) => {
  try {
    const { data: direct, error: directErr } = await supabaseAdmin
      .from('mail_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (!directErr && direct) {
      return res.json({ success: true, result: direct });
    }

    // Fallback: derive sent mail from activity_logs
    const { data, error } = await supabaseAdmin
      .from('activity_logs')
      .select('*')
      .eq('entity', 'mail')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return res.status(400).json({ success: false, message: 'Failed to fetch mail logs' });

    const result = (data || []).map((row) => {
      const d = row.details || {};
      return {
        id: row.id,
        subject: d.subject || '(no subject)',
        sender_email: row.user_email,
        recipients: Array.isArray(d.recipients) ? d.recipients.map((e) => ({ email: e, status: 'sent' })) : [],
        body_text: d.body_text || '',
        attachment_names: d.attachments || [],
        status: d.status || 'sent',
        error_message: null,
        created_at: row.created_at,
      };
    });
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch mail logs' });
  }
});

module.exports = router;
