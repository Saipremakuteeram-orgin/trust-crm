// backend/src/routes/webhookWebsiteDonation.js
// ─────────────────────────────────────────────────────────────────────────────
// Webhook called by the TRUST WEBSITE (api/razorpay.js webhook) when a donation
// is captured. It records the donation in the CRM as a DIGITAL CREDIT (income)
// transaction, so the trust's ledger reflects website seva automatically.
//
// Auth: shared secret in X-Trust-Webhook-Key (never exposed to the browser).
// Idempotent: dedupes by source_payment_id so retries never duplicate.
//
// NOTE on type: a donation is INCOME, not an expense. Per trust accounting it is
// recorded as type='credit', mode='digital'. It is NOT linked to a function's
// "spent" figure. (Linking to a specific event budget is a later enhancement
// when the website sends event_id.)
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

router.post('/website-donation', async (req, res) => {
  // 1) Authenticate
  if (!WEBHOOK_SECRET) {
    console.error('[webhook/website-donation] WEBHOOK_SECRET is not configured');
    return res.status(500).json({ success: false, message: 'Webhook secret not configured' });
  }
  const provided = req.headers['x-trust-webhook-key'] || '';
  if (!safeEqual(provided, WEBHOOK_SECRET)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // 2) Validate payload
  const d = req.body && req.body.donation;
  if (!d || !d.payment_id) {
    return res.status(400).json({ success: false, message: 'donation.payment_id is required' });
  }
  const amount = Number(d.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'donation.amount must be a positive number' });
  }

  // 3) Idempotency — skip if this Razorpay payment already recorded
  const { data: existing } = await supabaseAdmin
    .from('transactions')
    .select('id')
    .eq('source_payment_id', String(d.payment_id))
    .maybeSingle();

  if (existing) {
    return res.json({ success: true, alreadyExists: true, transactionId: existing.id });
  }

  // 4) Build the credit (income) transaction row
  const party = (d.donor_name || '').trim() || (d.donor_email || '').trim() || 'Website Donor';
  const purpose = (d.purpose || 'Seva').toString().trim();
  const description = 'Website seva: ' + purpose;
  const txnDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const insertData = {
    type: 'credit',                 // income, not expense
    mode: 'digital',               // online donation
    amount: amount,
    party: party,
    description: description,
    txn_date: txnDate,
    reference_no: String(d.payment_id),
    digital_method: d.method === 'auto' ? 'razorpay_autopay' : 'razorpay',
    source: 'website_donation',
    source_payment_id: String(d.payment_id),
    created_by: null,
  };

  // Optional future link: if the website sends event_id, attach to the Function.
  if (d.event_id) {
    const { data: fn } = await supabaseAdmin
      .from('functions')
      .select('id')
      .eq('source', 'website_event')
      .eq('source_event_id', String(d.event_id))
      .maybeSingle();
    if (fn) insertData.function_id = fn.id;
  }

  const { data, error } = await supabaseAdmin
    .from('transactions')
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
          'transactions table or source/source_payment_id column missing. Run migration 013_webhook_transaction_link.sql in the Supabase SQL editor first.',
      });
    }
    return res.status(400).json({ success: false, message: error.message });
  }

  await logActivity({
    userId: null,
    userEmail: 'website-automation@saidharmasamrakshanapremakuteeram.qzz.io',
    action: 'create',
    entity: 'transaction',
    entityId: data.id,
    details: { type: 'credit', mode: 'digital', amount: amount, source: 'website_donation', source_payment_id: String(d.payment_id) },
    ipAddress: req.ip,
  });

  return res.json({ success: true, transactionId: data.id });
});

module.exports = router;
