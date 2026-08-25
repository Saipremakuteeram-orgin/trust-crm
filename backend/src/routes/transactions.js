const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { notifyContactsOfTransaction } = require('@/services/notify');
const { logActivity } = require('@/lib/logger');
const { uploadFileToTelegram, getTelegramFileUrl } = require('@/services/backup');

router.use(requireAuth);

const RECEIPT_UPLOAD = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 20 * 1024 * 1024, files: 1 } // 20MB limit
});

const VALID_TYPES = ['credit', 'debit'];
const VALID_MODES = ['cash', 'digital'];
const MAX_AMOUNT = 100000000;
const MAX_FIELD_LEN = 2000;

async function validateFunctionLink(functionId, functionCategoryId, type, mode, amount) {
  if (!functionId && !functionCategoryId) return null;
  if (functionCategoryId && !functionId) {
    return 'function_id is required when function_category_id is set';
  }
  if (type !== 'debit') return null;

  try {
    if (functionId) {
      const { data: fn, error } = await supabaseAdmin.from('functions').select('id, status').eq('id', functionId).single();
      if (error || !fn) return 'Linked function not found';
      if (fn.status !== 'active') return 'Cannot link transaction to a non-active function';
    }
    if (functionCategoryId) {
      const { data: fc, error } = await supabaseAdmin.from('function_categories').select('id, function_id').eq('id', functionCategoryId).single();
      if (error || !fc) return 'Linked function category not found';
      if (fc.function_id !== functionId) return 'Function category does not belong to the linked function';
    }
    return null;
  } catch (err) {
    console.error('Function link validation error:', err.message);
    return 'Failed to validate function link';
  }
}

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
  // Core columns that exist in every database version. Receipt and function
  // columns are appended only to the primary query so the page still works if
  // a newer migration hasn't been applied to the database yet.
  const coreSelect =
    'id, type, mode, amount, party, description, txn_date, category_id, reference_no, notification_status, is_recurring, created_by, created_at, voucher_filed, digital_method, notify_contact_ids, notify_group_ids, categories(name)';

  // Full query: includes receipt file columns and function columns/joins
  // (requires the functions + receipt migrations).
  const fullSelect =
    coreSelect +
    ', receipt_file_id, receipt_file_name, receipt_file_size, receipt_mime_type, function_id, function_category_id, functions(name)';

  async function run(select) {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select(select)
      .order('txn_date', { ascending: false });
    return { data, error };
  }

  let { data, error } = await run(fullSelect);
  // If the migrations haven't been applied (missing column/table/join),
  // fall back to the core query so the page still works.
  if (error) {
    if (
      (error.message && /function_id|function_categories|functions|receipt_file|42P01|42703/.test(error.message)) ||
      (error.code && ['42P01', '42703'].includes(error.code))
    ) {
      ({ data, error } = await run(coreSelect));
    }
  }
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

  const functionErr = await validateFunctionLink(body.function_id, body.function_category_id, body.type, body.mode, body.amount);
  if (functionErr) return res.status(400).json({ success: false, message: functionErr });

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
  if (body.function_id) insertData.function_id = body.function_id;
  if (body.function_category_id) insertData.function_category_id = body.function_category_id;
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
  const allowed = ['type', 'mode', 'amount', 'category_id', 'description', 'txn_date', 'party', 'notify_contact_ids', 'notify_group_ids', 'voucher_filed', 'function_id', 'function_category_id'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'No valid fields to update' });
  }

  const validationErr = validateTxnBody(updates, true);
  if (validationErr) return res.status(400).json({ success: false, message: validationErr });

  if (updates.function_id !== undefined || updates.function_category_id !== undefined) {
    const fnErr = await validateFunctionLink(
      updates.function_id !== undefined ? updates.function_id : null,
      updates.function_category_id !== undefined ? updates.function_category_id : null,
      updates.type || 'debit',
      updates.mode || 'cash',
      updates.amount
    );
    if (fnErr) return res.status(400).json({ success: false, message: fnErr });
  }

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

// UPLOAD RECEIPT
router.post('/:id/receipt', requireRole('admin', 'accountant'), RECEIPT_UPLOAD.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const { data: txn, error: txnError } = await supabaseAdmin
      .from('transactions')
      .select('id, type, mode, amount, party')
      .eq('id', req.params.id)
      .single();
    if (txnError || !txn) return res.status(404).json({ success: false, message: 'Transaction not found' });

    const telegramResult = await uploadFileToTelegram(req.file.buffer, req.file.originalname);
    if (!telegramResult) return res.status(500).json({ success: false, message: 'Failed to upload to Telegram' });

    const updates = {
      receipt_file_id: telegramResult.file_id,
      receipt_file_name: telegramResult.file_name || req.file.originalname,
      receipt_file_size: telegramResult.file_size || req.file.size,
      receipt_mime_type: req.file.mimetype,
    };

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ success: false, message: 'Failed to save receipt metadata' });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'upload',
      entity: 'receipt',
      entityId: req.params.id,
      details: { file_name: updates.receipt_file_name, file_size: updates.receipt_file_size },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: data });
  } catch (err) {
    console.error('Receipt upload error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Upload failed' });
  }
});

// DOWNLOAD RECEIPT
router.get('/:id/receipt', async (req, res) => {
  try {
    const { data: txn, error } = await supabaseAdmin
      .from('transactions')
      .select('id, receipt_file_id, receipt_file_name, receipt_mime_type, type, mode, amount, party')
      .eq('id', req.params.id)
      .single();
    if (error || !txn) return res.status(404).json({ success: false, message: 'Transaction not found' });
    if (!txn.receipt_file_id) return res.status(404).json({ success: false, message: 'No receipt attached' });

    const fileUrl = await getTelegramFileUrl(txn.receipt_file_id);
    const response = await fetch(fileUrl);
    if (!response.ok) return res.status(500).json({ success: false, message: 'Failed to fetch from Telegram' });

    res.setHeader('Content-Type', txn.receipt_mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${txn.receipt_file_name || 'receipt'}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    // Stream the file
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Receipt download error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Download failed' });
  }
});

// DELETE RECEIPT
router.delete('/:id/receipt', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { data: txn, error: fetchError } = await supabaseAdmin
      .from('transactions')
      .select('id, receipt_file_id, receipt_file_name')
      .eq('id', req.params.id)
      .single();
    if (fetchError || !txn) return res.status(404).json({ success: false, message: 'Transaction not found' });
    if (!txn.receipt_file_id) return res.status(404).json({ success: false, message: 'No receipt to remove' });

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .update({ receipt_file_id: null, receipt_file_name: null, receipt_file_size: null, receipt_mime_type: null })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ success: false, message: 'Failed to remove receipt' });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'delete',
      entity: 'receipt',
      entityId: req.params.id,
      details: { file_name: txn.receipt_file_name },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: data });
  } catch (err) {
    console.error('Receipt delete error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Delete failed' });
  }
});

module.exports = router;
