// backend/src/routes/webhookWebsiteEvent.js
// ─────────────────────────────────────────────────────────────────────────────
// Webhook called by the TRUST WEBSITE (api/notify-event) whenever a new event
// is created. It auto-creates a CRM "Function" (budget container) so the trust
// can track that event's expenses easily.
//
// Auth: a shared secret sent in the `X-Trust-Webhook-Key` header (never exposed
// to the browser). Configure WEBHOOK_SECRET in the CRM's environment.
// Idempotent: dedupes by source_event_id so retries never create duplicates.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { logActivity } = require('@/lib/logger');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Constant-time-ish string compare to avoid trivial timing leaks on the secret.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

router.post('/website-event', async (req, res) => {
  // 1) Authenticate
  if (!WEBHOOK_SECRET) {
    console.error('[webhook/website-event] WEBHOOK_SECRET is not configured on the server');
    return res.status(500).json({ success: false, message: 'Webhook secret not configured' });
  }
  const provided = req.headers['x-trust-webhook-key'] || '';
  if (!safeEqual(provided, WEBHOOK_SECRET)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // 2) Validate payload
  const event = req.body && req.body.event;
  if (!event || !event.id || !event.title) {
    return res.status(400).json({ success: false, message: 'event.id and event.title are required' });
  }

  // 3) Idempotency — skip if this website event already has a Function
  const { data: existing } = await supabaseAdmin
    .from('functions')
    .select('id, name')
    .eq('source_event_id', String(event.id))
    .maybeSingle();

  if (existing) {
    return res.json({ success: true, alreadyExists: true, functionId: existing.id });
  }

  // 4) Build a readable description that links back to the website event
  const eventDate = event.date
    ? new Date(event.date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
    : '';
  const notes = event.description ? event.description.replace(/\|\|\|/g, ' ').slice(0, 600) : '';

  const descriptionLines = [
    'Auto-created from a website event.',
    event.category ? `Category: ${event.category}` : '',
    eventDate ? `Event date: ${eventDate}` : '',
    event.venue ? `Venue: ${event.venue}` : '',
    event.location ? `Location: ${event.location}` : '',
    event.coordinator ? `Coordinator: ${event.coordinator}` : '',
    notes ? `Notes: ${notes}` : '',
  ].filter(Boolean).join('\n');

  const insertData = {
    name: `Event: ${event.title}`.slice(0, 200),
    description: descriptionLines,
    budget_total: 0,
    budget_cash: 0,
    budget_digital: 0,
    status: 'active',
    source: 'website_event',
    source_event_id: String(event.id),
    created_by: null,
  };

  const { data, error } = await supabaseAdmin
    .from('functions')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    const missingTable = error.code === '42P01' || /does not exist/.test(error.message || '');
    const missingCol = error.code === '42703' || /column/.test(error.message || '');
    if (missingTable || missingCol) {
      return res.status(500).json({
        success: false,
        message:
          'functions table or source_event_id/source column missing. Run migration 012_webhook_website_event.sql in the Supabase SQL editor first.',
      });
    }
    return res.status(400).json({ success: false, message: error.message });
  }

  // 5) Audit trail
  await logActivity({
    userId: null,
    userEmail: 'website-automation@saidharmasamrakshanapremakuteeram.qzz.io',
    action: 'create',
    entity: 'function',
    entityId: data.id,
    details: { name: data.name, source: 'website_event', source_event_id: String(event.id) },
    ipAddress: req.ip,
  });

  return res.json({ success: true, functionId: data.id });
});

module.exports = router;
