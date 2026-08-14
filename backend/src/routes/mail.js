const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
    // Persist attachments to Supabase storage + Telegram (for backup/records)
    for (const f of files) {
      try {
        const storagePath = `mail/${Date.now()}-${f.originalname}`;
        await storage.uploadFile(storagePath, f.buffer, f.mimetype);
        await storage.sendFileToTelegram(storagePath, f.originalname, `📎 ${subject || 'Mail attachment'}`);
      } catch (err) {
        console.error('[mail] attachment upload failed:', err.message);
      }
    }

    // Build attachment list from the in-memory multer buffers.
    // (Streams from Telegram are not used here: Resend requires base64 content
    // and nodemailer accepts Buffers, so the original upload buffer is simplest
    // and avoids a fragile re-download round-trip.)
    const attachments = files.map((f) => ({ filename: f.originalname, content: f.buffer }));

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
    return res.status(500).json({ success: false, message: `Failed to send email: ${safeErrorMessage(err)}` });
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

// GET /api/mail/inbox — fetch incoming messages
router.get('/inbox', requireAuth, async (req, res) => {
  try {
    const { status, limit = '100', offset = '0', search } = req.query;
    let query = supabaseAdmin
      .from('inbox_messages')
      .select('*', { count: 'exact' })
      .order('received_at', { ascending: false })
      .limit(parseInt(limit))
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (search) {
      query = query.or(`subject.ilike.%${search}%,from_email.ilike.%${search}%,from_name.ilike.%${search}%,body_text.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ success: false, message: 'Failed to fetch inbox' });

    return res.json({ success: true, result: data || [], total: count || 0 });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch inbox' });
  }
});

// PATCH /api/mail/inbox/:id — update message status (read, archived, deleted)
router.patch('/inbox/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, is_spam } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (status) {
      updates.status = status;
      if (status === 'read') updates.read_at = new Date().toISOString();
    }
    if (typeof is_spam === 'boolean') updates.is_spam = is_spam;

    const { data, error } = await supabaseAdmin
      .from('inbox_messages')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: 'Failed to update message' });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: `mail_inbox_${status || 'update'}`,
      entity: 'inbox',
      details: { messageId: id, status, is_spam },
      ipAddress: req.ip,
    });

    return res.json({ success: true, result: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update message' });
  }
});

// POST /api/mail/webhook — Resend webhook for incoming emails
// Configure in Resend Dashboard -> Webhooks -> Add endpoint: https://yourdomain.com/api/mail/webhook
// Events: email.received
router.post('/webhook', async (req, res) => {
  try {
    // Verify Resend webhook signature (optional but recommended)
    const signature = req.headers['resend-signature'];
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (webhookSecret && signature) {
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');
      if (signature !== expectedSig) {
        console.warn('[mail] Invalid webhook signature');
        return res.status(401).json({ success: false, message: 'Invalid signature' });
      }
    }

    const event = req.body;
    if (event.type !== 'email.received') {
      return res.json({ success: true, ignored: true });
    }

    const email = event.data;
    const { message_id, from, to, subject, text, html, attachments, headers } = email;

    // Check for duplicate (idempotency)
    const { data: existing } = await supabaseAdmin
      .from('inbox_messages')
      .select('id')
      .eq('message_id', message_id)
      .single();
    if (existing) {
      return res.json({ success: true, duplicate: true });
    }

    // Simple spam heuristic (basic — can be enhanced)
    const spamKeywords = ['viagra', 'casino', 'lottery', 'winner', 'claim your', 'urgent action'];
    const content = (subject + ' ' + (text || '')).toLowerCase();
    const isSpam = spamKeywords.some((kw) => content.includes(kw));
    const spamScore = isSpam ? 0.8 : 0.1;

    // Extract attachment info
    const attachmentList = Array.isArray(attachments)
      ? attachments.map((a) => ({
          filename: a.filename,
          content_type: a.content_type,
          size: a.size,
          url: a.url,
        }))
      : [];

    const { data, error } = await supabaseAdmin
      .from('inbox_messages')
      .insert({
        message_id,
        from_email: from?.email || from || '',
        from_name: from?.name || null,
        to_email: Array.isArray(to) ? to[0]?.email : (to?.email || ''),
        subject: subject || '(no subject)',
        body_text: text || '',
        body_html: html || '',
        attachments: attachmentList,
        headers: headers || null,
        status: 'unread',
        is_spam: isSpam,
        spam_score: spamScore,
        received_at: new Date(email.created_at || Date.now()).toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[mail] webhook insert failed:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to store message' });
    }

    // Mirror to Telegram log channel
    try {
      await sendTelegram({
        chatId: process.env.TELEGRAM_LOG_CHANNEL_ID || process.env.TELEGRAM_STORAGE_CHAT_ID,
        text:
          `���� <b>Incoming Mail</b>\n` +
          `���� <b>Subject:</b> ${subject || '(no subject)'}\n` +
          `���� From: ${from?.name ? `${from.name} ` : ''}<${from?.email || from}>\n` +
          `���� To: ${Array.isArray(to) ? to.map((t) => t.email).join(', ') : (to?.email || to)}\n` +
          `���� Attachments: ${attachmentList.length}\n` +
          `${isSpam ? '������ <b>Marked as Spam</b>' : '��� Inbox'}\n` +
          `���� ${new Date().toLocaleString('en-IN')}`,
      });
    } catch (err) {
      console.error('[mail] webhook telegram mirror failed:', err.message);
    }

    logActivity({
      userId: null,
      userEmail: 'system',
      action: 'mail_inbox_received',
      entity: 'inbox',
      details: { messageId: data.id, subject, from: from?.email, to: to?.email, isSpam },
      ipAddress: 'webhook',
    });

    return res.json({ success: true, result: data });
  } catch (err) {
    console.error('[mail] webhook error:', safeErrorMessage(err));
    return res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
});

module.exports = router;
