// backend/src/routes/webhookWebsiteContact.js
// ─────────────────────────────────────────────────────────────────────────────
// Webhook called by the TRUST WEBSITE (api/send-welcome.js) when a devotee
// registers / signs up. It creates or merges a CRM contact (dedupe by email),
// so the trust's donor/seva directory grows automatically.
//
// Auth: shared secret in X-Trust-Webhook-Key. Consent required (GDPR-friendly):
// the website must pass consent=true (explicit signup) or we refuse.
// Idempotent: upsert on email — re-sending the same email merges, no duplicate.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { logActivity } = require('@/lib/logger');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

router.post('/website-contact', async (req, res) => {
  // 1) Authenticate
  if (!WEBHOOK_SECRET) {
    console.error('[webhook/website-contact] WEBHOOK_SECRET is not configured');
    return res.status(500).json({ success: false, message: 'Webhook secret not configured' });
  }
  const provided = req.headers['x-trust-webhook-key'] || '';
  if (!safeEqual(provided, WEBHOOK_SECRET)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // 2) Validate payload + consent
  const c = req.body && req.body.contact;
  if (!c || !c.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) {
    return res.status(400).json({ success: false, message: 'contact.email is required and must be valid' });
  }
  if (c.consent !== true) {
    return res.status(400).json({ success: false, message: 'consent is required to store a contact' });
  }

  // 3) Upsert on email (merge name/phone/source if already present)
  const email = String(c.email).trim().toLowerCase();
  const row = {
    name: (c.name || '').toString().trim() || null,
    email: email,
    phone: (c.phone || '').toString().trim() || null,
    source: 'website_registration',
    enabled: true,
  };

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .upsert(row, { onConflict: 'email' })
    .select()
    .single();

  if (error) {
    const missingTable = error.code === '42P01' || /does not exist/.test(error.message || '');
    const missingCol = error.code === '42703' || /column/.test(error.message || '');
    if (missingTable || missingCol) {
      return res.status(500).json({
        success: false,
        message: 'contacts table missing. Ensure the CRM database is migrated (run backend migrations).',
      });
    }
    return res.status(400).json({ success: false, message: error.message });
  }

  await logActivity({
    userId: null,
    userEmail: 'website-automation@saidharmasamrakshanapremakuteeram.qzz.io',
    action: 'create',
    entity: 'contact',
    entityId: data.id,
    details: { email: data.email, source: 'website_registration' },
    ipAddress: req.ip,
  });

  return res.json({ success: true, contactId: data.id, merged: !!data.updated_at });
});

module.exports = router;
