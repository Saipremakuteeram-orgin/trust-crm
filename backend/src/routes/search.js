const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth } = require('@/middlewares/auth');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ success: true, result: [] });
  const like = `%${q}%`;
  const results = [];
  try {
    const [contacts, transactions, receipts, compliance] = await Promise.all([
      supabaseAdmin.from('contacts').select('id, name, email, phone').ilike('name', like).limit(8),
      supabaseAdmin.from('transactions').select('id, description, amount, date').ilike('description', like).limit(8),
      supabaseAdmin.from('donation_receipts').select('id, receipt_number, amount, receipt_date').ilike('receipt_number', like).limit(8),
      supabaseAdmin.from('compliance_items').select('id, name, category, due_date').ilike('name', like).limit(8),
    ]);
    (contacts.data || []).forEach((c) => results.push({ type: 'contact', id: c.id, title: c.name, subtitle: c.email || c.phone, to: `/contacts` }));
    (transactions.data || []).forEach((t) => results.push({ type: 'transaction', id: t.id, title: t.description || 'Transaction', subtitle: `${t.amount} · ${t.date}`, to: `/transactions` }));
    (receipts.data || []).forEach((r) => results.push({ type: 'receipt', id: r.id, title: `Receipt ${r.receipt_number}`, subtitle: `${r.amount} · ${r.receipt_date}`, to: `/receipts` }));
    (compliance.data || []).forEach((c) => results.push({ type: 'compliance', id: c.id, title: c.name, subtitle: `${c.category} · due ${c.due_date}`, to: `/compliance` }));
    res.json({ success: true, result: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
