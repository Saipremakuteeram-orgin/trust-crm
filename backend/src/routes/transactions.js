const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { notifyContactsOfTransaction } = require('@/services/notify');
const { logActivity } = require('@/lib/logger');

router.use(requireAuth);

const VALID_TYPES = ['credit', 'debit'];
const VALID_MODES = ['cash', 'digital'];
const MAX_AMOUNT = 100000000;
const MAX_FIELD_LEN = 2000;

function validateTxnBody(body, isUpdate) {
  if (!isUpdate) {
    if (!body.amount || typeof body.amount !== 'number' || body.amount <= 0 || body.amount > MAX_AMOUNT) {
      return 'Amount must be a positive number up to 10 crore';
    }
    if (!body.type || !VALID_TYPES.includes(body.type)) return 'Invalid or missing type';
    if (!body.mode || !VALID_MODES.includes(body.mode)) return 'Invalid or missing mode';
  } else {
    if (body.amount !== undefined && (typeof body.amount !== 'number' || body.amount <= 0 || body.amount > MAX_AMOUNT)) {
      return 'Amount must be a positive number up to 10 crore';
    }
    if (body.type !== undefined && !VALID_TYPES.includes(body.type)) return 'Invalid type';
    if (body.mode !== undefined && !VALID_MODES.includes(body.mode)) return 'Invalid mode';
  }
  for (const key of ['party', 'description', 'reference_no', 'digital_method']) {
    if (body[key] !== undefined && body[key] !== null && String(body[key]).length > MAX_FIELD_LEN) {
      return `${key} is too long (max ${MAX_FIELD_LEN} characters)`;
    }
  }
  if (body.txn_date && !/^\d{4}-\d{2}-\d{2}/.test(body.txn_date)) return 'Invalid date format';
  return null;
}

// LIST
router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('id, type, mode, amount, party, description, txn_date, category_id, reference_no, digital_method, notify_contact_ids, notify_group_ids, voucher_filed, notification_status, is_recurring, recurring_id, created_by, created_at, categories(name)')
    .order('txn_date', { ascending: false });
  if (error) return res.status(400).json({ success: false, message: 'Failed to fetch transactions' });
  res.set('Cache-Control', 'private, max-age=10');
  res.json({ success: true, result: data });
});

// CREATE
router.post('/', requireRole('admin', 'accountant'), async (req, res) => {
  const body = req.body;
  const validationErr = validateTxnBody(body, false);
  if (validationErr) return res.status(400).json({ success: false, message: validationErr });

  if (body.mode === 'cash' && body.voucher_filed === undefined) {
    return res.status(400).json({ success: false, message: 'Voucher filed status is required for cash transactions' });
  }

  const insertData = {
    type: body.type,
    mode: body.mode,
    amount: body.amount,
    party: String(body.party || '').slice(0, MAX_FIELD_LEN),
    description: String(body.description || '').slice(0, MAX_FIELD_LEN),
    txn_date: body.txn_date,
    category_id: body.category_id,
    reference_no: String(body.reference_no || '').slice(0, MAX_FIELD_LEN),
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

  if (error) return res.status(400).json({ success: false, message: 'Failed to create transaction' });

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    entity: 'transaction',
    entityId: txn.id,
    details: { type: txn.type, mode: txn.mode, amount: txn.amount, party: txn.party },
    ipAddress: req.ip,
  });

  // Respond immediately, send notifications in background
  res.json({ success: true, result: { ...txn, notification_status: 'sending' } });

  // Fire-and-forget: resolve contacts and send notifications
  setImmediate(async () => {
    let notificationStatus = 'sent';
    const notifyIds = body.notify_contact_ids || [];
    const notifyGroupIds = body.notify_group_ids || [];
    const allNotifyIds = [...new Set([...notifyIds])];

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
  });
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

  const validationErr = validateTxnBody(updates, true);
  if (validationErr) return res.status(400).json({ success: false, message: validationErr });

  if (updates.mode === 'digital' && updates.voucher_filed !== undefined) {
    delete updates.voucher_filed;
  }

  const editReason = (req.body.edit_reason || '').trim();
  if (!editReason) {
    return res.status(400).json({ success: false, message: 'Please provide a reason for this edit' });
  }

  if (updates.party !== undefined) updates.party = String(updates.party || '').slice(0, MAX_FIELD_LEN);
  if (updates.description !== undefined) updates.description = String(updates.description || '').slice(0, MAX_FIELD_LEN);
  if (updates.reference_no !== undefined) updates.reference_no = String(updates.reference_no || '').slice(0, MAX_FIELD_LEN);

  const { data, error } = await supabaseAdmin
    .from('transactions')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ success: false, message: 'Failed to update transaction' });

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
  if (error) return res.status(400).json({ success: false, message: 'Failed to delete transaction' });
  res.json({ success: true });
});

module.exports = router;
