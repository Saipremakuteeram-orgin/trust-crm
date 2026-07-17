const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { notifyContactsOfTransaction } = require('@/services/notify');

router.use(requireAuth);

// LIST
router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('*, categories(name)')
    .order('txn_date', { ascending: false });
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data });
});

// CREATE
router.post('/', requireRole('admin', 'accountant'), async (req, res) => {
  const body = req.body;
  if (!body.amount || body.amount <= 0) {
    return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
  }
  if (!body.type || !['credit', 'debit'].includes(body.type)) {
    return res.status(400).json({ success: false, message: 'Invalid or missing type' });
  }
  if (!body.mode || !['cash', 'digital'].includes(body.mode)) {
    return res.status(400).json({ success: false, message: 'Invalid or missing mode' });
  }

  const { data: txn, error } = await supabaseAdmin
    .from('transactions')
    .insert({ ...body, created_by: req.user.id })
    .select()
    .single();

  if (error) return res.status(400).json({ success: false, message: error.message });

  // Fire notifications
  let notificationStatus = 'sent';
  const notifyIds = body.notify_contact_ids || [];
  if (notifyIds.length > 0) {
    try {
      const { data: contacts } = await supabaseAdmin
        .from('contacts')
        .select('*')
        .in('id', notifyIds)
        .eq('enabled', true);
      const results = await notifyContactsOfTransaction(txn, contacts || []);
      const anyFailed = results.some((r) => r.emailRes.ok === false || r.tgRes.ok === false);
      notificationStatus = anyFailed ? 'partial' : 'sent';
    } catch (err) {
      console.error('Notification error:', err.message);
      notificationStatus = 'failed';
    }
  }

  await supabaseAdmin.from('transactions').update({ notification_status: notificationStatus }).eq('id', txn.id);

  res.json({ success: true, result: { ...txn, notification_status: notificationStatus } });
});

// UPDATE
router.patch('/:id', requireRole('admin', 'accountant'), async (req, res) => {
  const allowed = ['type', 'mode', 'amount', 'category_id', 'description', 'txn_date', 'party_name', 'contact_id', 'notify_contact_ids'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'No valid fields to update' });
  }
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data });
});

// DELETE
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { error } = await supabaseAdmin.from('transactions').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

module.exports = router;
