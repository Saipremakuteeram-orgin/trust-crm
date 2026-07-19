const nodemailer = require('nodemailer');
const axios = require('axios');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('⚠️  SMTP_USER / SMTP_PASS not set — email notifications disabled');
    return null;
  }
  // Use explicit SMTP config on port 587 (STARTTLS) with a connection timeout.
  // Render's free tier blocks outbound 465 (implicit TLS) but usually allows 587.
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    pool: false,
    debug: false,
  });
  return transporter;
}

async function sendViaResend({ to, subject, html, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null; // signal "not configured"
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'onboarding@resend.dev';
  const payload = {
    from,
    to: Array.isArray(to) ? to : String(to).split(',').map((s) => s.trim()),
    subject,
    html,
  };
  if (attachments && attachments.length > 0) {
    payload.attachments = attachments.map((a) => {
      const content = a.content && typeof a.content === 'string'
        ? a.content
        : (a.content && a.content.toString ? Buffer.from(a.content).toString('base64') : '');
      // Resend needs base64 string for buffer content
      const isBase64 = typeof a.content !== 'string';
      return { filename: a.filename, content: isBase64 ? Buffer.from(a.content).toString('base64') : a.content };
    });
  }
  try {
    const resp = await axios.post('https://api.resend.com/emails', payload, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 20000,
    });
    return { ok: true, id: resp.data?.id };
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    console.error('[Resend] send failed:', detail);
    return { ok: false, reason: 'resend: ' + detail };
  }
}

async function sendEmail({ to, subject, html, attachments }) {
  // Prefer Resend (HTTPS/443) — works on hosts that block outbound SMTP (e.g. Render).
  const resendResult = await sendViaResend({ to, subject, html, attachments });
  if (resendResult) return resendResult; // configured (success or hard fail)

  // Fallback to Gmail SMTP (works locally / on SMTP-allowed hosts).
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('Email send skipped: neither RESEND_API_KEY nor SMTP configured');
    return { ok: false, reason: 'email-not-configured' };
  }
  const t = getTransporter();
  if (!t || !to) return { ok: false, reason: 'no-transporter-or-recipient' };
  try {
    const mailOptions = { from: `"Trust CRM" <${process.env.SMTP_USER}>`, to, subject, html };
    if (attachments && attachments.length > 0) mailOptions.attachments = attachments;
    await t.sendMail(mailOptions);
    return { ok: true };
  } catch (err) {
    console.error('Email send failed:', err.message);
    return { ok: false, reason: err.message };
  }
}

async function sendTelegram({ chatId, text }) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !chatId) return { ok: false, reason: 'no-token-or-chatid' };
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
    return { ok: true };
  } catch (err) {
    console.error('Telegram send failed:', err.response?.data || err.message);
    return { ok: false, reason: err.message };
  }
}

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

async function notifyContactsOfTransaction(txn, contacts) {
  const isCredit = txn.type === 'credit';
  const label = isCredit ? 'Credit (Money In)' : 'Debit (Money Out)';
  const emoji = isCredit ? '🟢' : '🔴';

  const subject = `${emoji} New ${label} — ${fmt(txn.amount)}`;
  const html = `
    <div style="font-family:sans-serif;font-size:14px;color:#333">
      <h3>${emoji} ${label} Recorded</h3>
      <p><b>Amount:</b> ${fmt(txn.amount)}</p>
      <p><b>Mode:</b> ${txn.mode}${txn.digital_method ? ' (' + txn.digital_method + ')' : ''}</p>
      <p><b>Party:</b> ${txn.party || '-'}</p>
      <p><b>Date:</b> ${new Date(txn.txn_date).toLocaleDateString('en-IN')}</p>
      <p><b>Notes:</b> ${txn.description || '-'}</p>
    </div>`;
  const telegramText =
    `${emoji} <b>${label}</b>\nAmount: <b>${fmt(txn.amount)}</b>\n` +
    `Mode: ${txn.mode}${txn.digital_method ? ' (' + txn.digital_method + ')' : ''}\n` +
    `Party: ${txn.party || '-'}\nDate: ${new Date(txn.txn_date).toLocaleDateString('en-IN')}`;

  return Promise.all(
    contacts.map(async (c) => {
      const [emailRes, tgRes] = await Promise.all([
        c.email ? sendEmail({ to: c.email, subject, html }) : Promise.resolve({ ok: null }),
        c.telegram_chat_id ? sendTelegram({ chatId: c.telegram_chat_id, text: telegramText }) : Promise.resolve({ ok: null }),
      ]);
      return { contact: c.name, emailRes, tgRes };
    })
  );
}

module.exports = { sendEmail, sendTelegram, notifyContactsOfTransaction, fmt, getTransporter };
