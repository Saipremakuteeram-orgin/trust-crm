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
const { safeErrorMessage } = require('@/lib/security');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const STORAGE_CHAT_ID = process.env.TELEGRAM_STORAGE_CHAT_ID;
const LOG_CHANNEL_ID = process.env.TELEGRAM_LOG_CHANNEL_ID || STORAGE_CHAT_ID;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
function appendJsonLog(entry) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFile(path.join(LOG_DIR, 'file-send.jsonl'), JSON.stringify(entry) + '\n', () => {});
  } catch (err) {
    console.error('[fileSend] failed to append json log:', err.message);
  }
}

// POST /api/file-send/send — upload from device, send to Telegram, email as attachment
router.post('/send', requireAuth, requireRole('admin', 'accountant'), upload.single('file'), async (req, res) => {
  const file = req.file;
  let recipients = [];
  try {
    recipients = Array.isArray(req.body.recipients)
      ? req.body.recipients
      : (req.body.recipients ? JSON.parse(req.body.recipients) : []);
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid recipients data' });
  }

  if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  if (!recipients.length) return res.status(400).json({ success: false, message: 'No recipients selected' });

  const validRecipients = recipients
    .map((r) => (typeof r === 'string' ? r : r.email))
    .filter((e) => e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));

  if (!validRecipients.length) return res.status(400).json({ success: false, message: 'No valid recipient emails' });

  const docName = file.originalname;
  let telegramFileId = null;
  let channelMessageId = null;

  try {
    // 1) Upload to Supabase Storage (durable copy) + send to Telegram storage chat
    const storagePath = `file-send/${Date.now()}-${docName}`;
    await storage.uploadFile(storagePath, file.buffer, file.mimetype);
    const tgResult = await storage.sendFileToTelegram(storagePath, docName, `📤 File sent: ${docName}`);
    telegramFileId = tgResult?.document?.file_id || null;

    // 2) Email the file to each recipient as an attachment, streamed via Telegram file_id (no disk)
    const perRecipient = [];
    for (const email of validRecipients) {
      try {
        let attachments = null;

        if (telegramFileId) {
          const fetched = await storage.getTelegramFileStream(telegramFileId);
          if (fetched) attachments = [{ filename: docName, content: fetched.stream }];
        }
        if (!attachments) {
          // Fallback: attach from memory if Telegram stream unavailable
          attachments = [{ filename: docName, content: file.buffer }];
        }

        const mailRes = await sendEmail({
          to: email,
          subject: `📎 ${docName} — Shared via Trust CRM`,
          html: `<div style="font-family:sans-serif;font-size:14px;color:#333">
            <h3>📎 Document shared: ${docName}</h3>
            <p>Hello,</p>
            <p>A document has been shared with you by <b>${req.user.email}</b> via Trust CRM.</p>
            <p>Please find the attachment below.</p>
          </div>`,
          attachments,
        });

        perRecipient.push({ email, status: mailRes.ok ? 'sent' : 'failed', error: mailRes.ok ? null : mailRes.reason });
      } catch (err) {
        perRecipient.push({ email, status: 'failed', error: 'Delivery failed' });
      }
    }

    const succeeded = perRecipient.filter((r) => r.status === 'sent').length;
    const status = succeeded === validRecipients.length ? 'sent' : (succeeded > 0 ? 'partial' : 'failed');
    const errorMessage = perRecipient.find((r) => r.status === 'failed')?.error || null;

    // 3) Mirror to Telegram log channel
    try {
      const mirror = await sendTelegram({
        chatId: LOG_CHANNEL_ID,
        text:
          `📤 <b>File Sent</b>\n` +
          `📄 <b>${docName}</b>\n` +
          `👤 From: ${req.user.email}\n` +
          `📧 To: ${validRecipients.join(', ')}\n` +
          `✅ Status: ${status} (${succeeded}/${validRecipients.length})\n` +
          `🕒 ${new Date().toLocaleString('en-IN')}`,
      });
      channelMessageId = mirror?.ok ? 'posted' : null;
    } catch (err) {
      console.error('[fileSend] log channel mirror failed:', err.message);
    }

    // 4) Persist log (metadata only)
    const { data: logRow, error: logErr } = await supabaseAdmin
      .from('file_send_logs')
      .insert({
        doc_name: docName,
        sender_id: req.user.id,
        sender_email: req.user.email,
        recipients: perRecipient,
        telegram_file_id: telegramFileId,
        channel_message_id: channelMessageId,
        status,
        error_message: errorMessage,
      })
      .select()
      .single();

    if (logErr) console.error('[fileSend] log insert failed:', logErr.message);

    appendJsonLog({
      id: logRow?.id,
      doc_name: docName,
      sender_email: req.user.email,
      recipients: perRecipient,
      telegram_file_id: telegramFileId,
      status,
      error_message: errorMessage,
      created_at: new Date().toISOString(),
    });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'send_file',
      entity: 'file',
      details: { doc_name: docName, recipients: validRecipients, status, succeeded, total: validRecipients.length },
      ipAddress: req.ip,
    });

    return res.json({ success: true, result: { docName, status, recipients: perRecipient } });
  } catch (err) {
    console.error('[fileSend] send failed:', safeErrorMessage(err));
    return res.status(500).json({ success: false, message: 'Failed to send file' });
  }
});

// GET /api/file-send/logs — visible to all authenticated roles (metadata only)
router.get('/logs', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('file_send_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return res.status(400).json({ success: false, message: 'Failed to fetch file send logs' });
    return res.json({ success: true, result: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch file send logs' });
  }
});

module.exports = router;
