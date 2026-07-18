const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { notifyContactsOfTransaction } = require('@/services/notify');
const { logActivity } = require('@/lib/logger');

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
  if (body.mode === 'cash' && body.voucher_filed === undefined) {
    return res.status(400).json({ success: false, message: 'Voucher filed status is required for cash transactions' });
  }

  const insertData = {
    type: body.type,
    mode: body.mode,
    amount: body.amount,
    party: body.party,
    description: body.description,
    txn_date: body.txn_date,
    category_id: body.category_id,
    reference_no: body.reference_no,
    digital_method: body.digital_method,
    notify_contact_ids: body.notify_contact_ids,
    created_by: req.user.id,
  };
  if (body.mode === 'cash') {
    insertData.voucher_filed = !!body.voucher_filed;
  }

  const { data: txn, error } = await supabaseAdmin
    .from('transactions')
    .insert(insertData)
    .select()
    .single();

  if (error) return res.status(400).json({ success: false, message: error.message });

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    entity: 'transaction',
    entityId: txn.id,
    details: { type: txn.type, mode: txn.mode, amount: txn.amount, party: txn.party },
    ipAddress: req.ip,
  });

  // Fire notifications
  let notificationStatus = 'sent';
  const notifyIds = body.notify_contact_ids || [];
  const notifyGroupIds = body.notify_group_ids || [];
  const allNotifyIds = [...new Set([...notifyIds])];

  // Resolve group IDs to member contact IDs
  if (notifyGroupIds.length > 0) {
    try {
      const { data: groupMembers } = await supabaseAdmin
        .from('contact_group_members')
        .select('contact_id')
        .in('group_id', notifyGroupIds);
      (groupMembers || []).forEach((m) => {
        if (!allNotifyIds.includes(m.contact_id)) allNotifyIds.push(m.contact_id);
      });
    } catch (err) {
      console.error('Group resolution error:', err.message);
    }
  }

  if (allNotifyIds.length > 0) {
    try {
      const { data: contacts } = await supabaseAdmin
        .from('contacts')
        .select('*')
        .in('id', allNotifyIds)
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
  const allowed = ['type', 'mode', 'amount', 'category_id', 'description', 'txn_date', 'party', 'notify_contact_ids', 'notify_group_ids', 'voucher_filed'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'No valid fields to update' });
  }

  const editReason = (req.body.edit_reason || '').trim();
  if (!editReason) {
    return res.status(400).json({ success: false, message: 'Please provide a reason for this edit' });
  }

  const { data, error } = await supabaseAdmin
    .from('transactions')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ success: false, message: error.message });

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    entity: 'transaction',
    entityId: req.params.id,
    details: { ...updates, edit_reason: editReason },
    ipAddress: req.ip,
  });

  res.json({ success: true, result: data });
});

// DELETE
router.delete('/:id', requireRole('admin'), async (req, res) => {
  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'delete',
    entity: 'transaction',
    entityId: req.params.id,
    details: {},
    ipAddress: req.ip,
  });

  const { error } = await supabaseAdmin.from('transactions').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

module.exports = router;
