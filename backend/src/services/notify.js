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

function getResendFrom() {
  const email = process.env.RESEND_FROM_EMAIL;
  const name = process.env.RESEND_FROM_NAME;
  if (email) return name ? `"${name}" <${email}>` : email;
  return process.env.MAIL_FROM || process.env.SMTP_USER || 'onboarding@resend.dev';
}

// --- Branded email wrapper (logo, address, auto-generated disclaimer) ---
// The footer logo is served from a hosted URL (a small 120x120 JPEG on the app
// domain). Base64 data-URI images are stripped by Gmail/Outlook, so a real
// hosted URL is the most reliable way to make the logo render in email clients.
const LOGO_SRC = process.env.TRUST_LOGO_URL || 'https://crmsaidharmasamrakshanapremakuteeram.dpdns.org/logo-footer.jpg';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'xx@gmail.com';
const CONTACT_PHONE = process.env.CONTACT_PHONE || '+91 XXXXXXXXXX';

// Provide at least a plain-text version for deliverability/spam reasons.
// Strips all tags from the HTML content so text clients get readable text.
function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildBrandedHtml(contentHtml, fromEmail) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333;line-height:1.6;">
                ${contentHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px 32px;">
                <hr style="border:0;border-top:1px solid #e0e0e0;margin:30px 0;">
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#555;text-align:center;line-height:1.7;">
                  <img src="${LOGO_SRC}" alt="Sri Sai Dharma Samrakshana Prema Kuteeram" width="120" style="margin-bottom:12px;">
                  <h3 style="margin:0;color:#0b3c6d;font-size:20px;">Sri Sai Dharma Samrakshana Prema Kuteeram</h3>
                  <div style="font-size:14px;color:#666;">Public Charitable Trust</div>
                  <p style="margin:12px 0;font-style:italic;color:#8a6d1d;">&quot;Serving Humanity with Selfless Love and Selfless Service.&quot;</p>
                  <p style="margin:16px 0;color:#777;">This is an automatically generated email. Please do not reply to this email.</p>
                  ${fromEmail ? `<p style="margin:8px 0;"><strong>From:</strong> ${fromEmail}</p>` : ''}
                  <p style="margin:8px 0;"><strong>Contact Email:</strong> <a href="mailto:${CONTACT_EMAIL}" style="color:#0b3c6d;">${CONTACT_EMAIL}</a></p>
                  <p style="margin:8px 0;"><strong>Phone:</strong> ${CONTACT_PHONE}</p>
                  <p style="margin:12px 0;"><strong>Registered Office</strong><br>No.104, Mettu Street,<br>Karur &#8211; 639001,<br>Tamil Nadu, India.</p>
                  <p style="margin-top:18px;font-size:12px;color:#999;">&copy; ${new Date().getFullYear()} Sri Sai Dharma Samrakshana Prema Kuteeram. All Rights Reserved.</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function buildBrandedText(contentText, fromEmail) {
  return `${contentText}\n\n---\nSri Sai Dharma Samrakshana Prema Kuteeram\nPublic Charitable Trust\n"Serving Humanity with Selfless Love and Selfless Service."\n\nThis is an automatically generated email. Please do not reply to this email.\n${fromEmail ? `From: ${fromEmail}\n` : ''}Contact Email: ${CONTACT_EMAIL}\nPhone: ${CONTACT_PHONE}\n\nRegistered Office:\nNo.104, Mettu Street,\nKarur - 639001,\nTamil Nadu, India.\n\n\u00a9 ${new Date().getFullYear()} Sri Sai Dharma Samrakshana Prema Kuteeram. All Rights Reserved.`;
}

async function sendViaResend({ to, subject, html, text, attachments, from }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null; // signal "not configured"
  const resolvedFrom = from || getResendFrom();
  const payload = {
    from: resolvedFrom,
    to: Array.isArray(to) ? to : String(to).split(',').map((s) => s.trim()),
    subject,
    html,
  };
  if (text) payload.text = text;
  if (attachments && attachments.length > 0) {
    payload.attachments = attachments.map((a) => {
      const out = { filename: a.filename || 'attachment' };
      if (a.path) out.path = a.path;
      if (a.content !== undefined) out.content = Buffer.isBuffer(a.content) ? a.content.toString('base64') : String(a.content);
      if (a.cid || a.contentId) out.content_id = a.cid || a.contentId;
      return out;
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

async function sendEmail({ to, subject, html, text, attachments }) {
  // Wrap in the branded template (logo, address, auto-generated disclaimer). The
  // footer logo is referenced from a hosted URL so it renders in email clients.
  const contentHtml = String(html || '');
  const from = getResendFrom();
  const brandedHtml = buildBrandedHtml(contentHtml, from);
  const brandedText = text || buildBrandedText(htmlToText(contentHtml), from);
  const allAttachments = Array.isArray(attachments) ? [...attachments] : [];

  // Prefer Resend (HTTPS/443) — works on hosts that block outbound SMTP (e.g. Render).
  const resendResult = await sendViaResend({ to, subject, from, html: brandedHtml, text: brandedText, attachments: allAttachments });
  if (resendResult) return resendResult; // configured (success or hard fail)

  // Fallback to Gmail SMTP (works locally / on SMTP-allowed hosts).
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('Email send skipped: neither RESEND_API_KEY nor SMTP configured');
    return { ok: false, reason: 'email-not-configured' };
  }
  const t = getTransporter();
  if (!t || !to) return { ok: false, reason: 'no-transporter-or-recipient' };
  try {
    const mailOptions = { from: `"Trust CRM" <${process.env.SMTP_USER}>`, to, subject, html: brandedHtml, text: brandedText };
    if (allAttachments.length > 0) mailOptions.attachments = allAttachments;
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

module.exports = { sendEmail, sendTelegram, notifyContactsOfTransaction, fmt, getTransporter, buildBrandedHtml, buildBrandedText };
