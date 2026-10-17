const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { notifyContactsOfTransaction } = require('@/services/notify');
const storage = require('@/services/storage');
const { safeErrorMessage, sanitizeFileName } = require('@/lib/security');

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_ITEMS = 200;
const MAX_TEXT_LENGTH = 100000;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) return cb(null, true);
    return cb(new Error('Only JPEG, PNG, and WebP images are supported'));
  },
});

router.use(requireAuth);

function uploadExpenseImage(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'The expense image must be smaller than 10 MB' });
    }

    console.error('Expense scan upload parsing error:', error.message);
    return res.status(400).json({
      success: false,
      message: error.message || 'The expense image upload is invalid',
    });
  });
}

function parseJsonField(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  return String(value);
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_ITEMS).map((item, index) => {
    const amount = item?.amount === null || item?.amount === '' || item?.amount === undefined
      ? null
      : Number(item.amount);
    const quantity = Number(item?.quantity || 1);
    const confidence = item?.confidence === null || item?.confidence === undefined
      ? null
      : Math.max(0, Math.min(1, Number(item.confidence)));

    return {
      line_number: Number.isInteger(Number(item?.line_number)) ? Number(item.line_number) : index + 1,
      item_name: String(item?.item_name || '').trim().slice(0, 500),
      source_text: String(item?.source_text || '').trim().slice(0, 2000),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      amount: amount !== null && Number.isFinite(amount) && amount > 0 ? amount : null,
      category_id: item?.category_id || null,
      confidence: confidence !== null && Number.isFinite(confidence) ? confidence : null,
      bounding_box: item?.bounding_box && typeof item.bounding_box === 'object' ? item.bounding_box : null,
    };
  }).filter((item) => item.item_name || item.amount !== null || item.source_text);
}

function canAccessScan(req, scan) {
  return scan && (scan.uploaded_by === req.user.id || req.profile?.role === 'admin');
}

async function getScanWithItems(id) {
  const [{ data: scan, error: scanError }, { data: items, error: itemsError }] = await Promise.all([
    supabaseAdmin.from('expense_scans').select('*').eq('id', id).single(),
    supabaseAdmin.from('expense_scan_items').select('*').eq('scan_id', id).order('line_number', { ascending: true }),
  ]);
  if (scanError) return { scan: null, items: [], error: scanError };
  if (itemsError) return { scan, items: [], error: itemsError };
  return { scan, items: items || [], error: null };
}

async function signedImageUrl(scan) {
  if (!scan?.storage_path) return null;
  try {
    const result = await storage.getSignedUrl(scan.storage_path, 3600);
    return result;
  } catch (err) {
    console.error('Expense scan signed URL error:', err.message);
    return null;
  }
}

// Create an OCR review draft. OCR happens in the browser; the backend stores
// the original image and treats all extracted fields as untrusted user input.
router.post('/', requireRole('admin', 'accountant'), uploadExpenseImage, async (req, res) => {
  let storagePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'An expense image is required' });
    }
    if (!ALLOWED_MIMES.has(req.file.mimetype)) {
      return res.status(400).json({ success: false, message: 'Only JPEG, PNG, and WebP images are supported' });
    }

    const items = normalizeItems(parseJsonField(req.body.items, []));
    if (items.length > MAX_ITEMS) {
      return res.status(400).json({ success: false, message: `A scan can contain at most ${MAX_ITEMS} items` });
    }

    const rawText = String(req.body.raw_text || '').slice(0, MAX_TEXT_LENGTH);
    const ocrPayload = parseJsonField(req.body.ocr_payload, {});
    const detectedTotal = req.body.detected_total === '' || req.body.detected_total === undefined
      ? null
      : Number(req.body.detected_total);
    const safeDetectedTotal = detectedTotal !== null && Number.isFinite(detectedTotal) && detectedTotal > 0
      ? detectedTotal
      : null;

    const fileName = sanitizeFileName(req.file.originalname || 'expense-image');
    storagePath = `expense-scans/${req.user.id}/${crypto.randomUUID()}-${fileName}`;
    await storage.uploadFile(storagePath, req.file.buffer, req.file.mimetype);

    const { data: scan, error: scanError } = await supabaseAdmin
      .from('expense_scans')
      .insert({
        uploaded_by: req.user.id,
        storage_path: storagePath,
        original_filename: fileName,
        mime_type: req.file.mimetype,
        status: 'ready',
        raw_text: rawText,
        ocr_payload: ocrPayload && typeof ocrPayload === 'object' ? ocrPayload : {},
        detected_party: String(req.body.detected_party || '').trim().slice(0, 500) || null,
        detected_date: normalizeDate(req.body.detected_date),
        detected_total: safeDetectedTotal,
      })
      .select()
      .single();

    if (scanError || !scan) throw scanError || new Error('Failed to create expense scan');

    if (items.length > 0) {
      const { error: itemError } = await supabaseAdmin.from('expense_scan_items').insert(
        items.map((item) => ({ ...item, scan_id: scan.id }))
      );
      if (itemError) throw itemError;
    }

    const imageUrl = await signedImageUrl(scan);
    res.status(201).json({
      success: true,
      result: { ...scan, items, image_url: imageUrl },
    });
  } catch (err) {
    if (storagePath) {
      try { await storage.deleteFile(storagePath); } catch (cleanupErr) {
        console.error('Expense scan cleanup error:', cleanupErr.message);
      }
    }
    console.error('Expense scan create error:', err.message);
    res.status(500).json({ success: false, message: safeErrorMessage(err, 'Failed to save expense scan') });
  }
});

// Load a review draft and a short-lived signed image URL.
router.get('/:id', async (req, res) => {
  try {
    const { scan, items, error } = await getScanWithItems(req.params.id);
    if (error || !scan) return res.status(404).json({ success: false, message: 'Expense scan not found' });
    if (!canAccessScan(req, scan)) return res.status(403).json({ success: false, message: 'You cannot access this expense scan' });

    res.json({ success: true, result: { ...scan, items, image_url: await signedImageUrl(scan) } });
  } catch (err) {
    console.error('Expense scan read error:', err.message);
    res.status(500).json({ success: false, message: safeErrorMessage(err, 'Failed to load expense scan') });
  }
});

// Save reviewer corrections before approval.
router.patch('/:id', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { scan, error } = await getScanWithItems(req.params.id);
    if (error || !scan) return res.status(404).json({ success: false, message: 'Expense scan not found' });
    if (!canAccessScan(req, scan)) return res.status(403).json({ success: false, message: 'You cannot edit this expense scan' });
    if (scan.status !== 'ready') return res.status(409).json({ success: false, message: 'Only a ready scan can be edited' });

    const updates = {};
    if (req.body.detected_party !== undefined) {
      updates.detected_party = String(req.body.detected_party || '').trim().slice(0, 500) || null;
    }
    if (req.body.detected_date !== undefined) {
      const date = normalizeDate(req.body.detected_date);
      if (req.body.detected_date && !date) return res.status(400).json({ success: false, message: 'Invalid date format' });
      updates.detected_date = date;
    }
    if (req.body.detected_total !== undefined) {
      const total = req.body.detected_total === '' || req.body.detected_total === null
        ? null
        : Number(req.body.detected_total);
      if (total !== null && (!Number.isFinite(total) || total <= 0)) {
        return res.status(400).json({ success: false, message: 'Detected total must be positive' });
      }
      updates.detected_total = total;
    }

    const hasItems = Object.prototype.hasOwnProperty.call(req.body, 'items');
    const items = hasItems ? normalizeItems(parseJsonField(req.body.items, null)) : null;
    if (hasItems && !Array.isArray(parseJsonField(req.body.items, null))) {
      return res.status(400).json({ success: false, message: 'Items must be an array' });
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('expense_scans')
        .update(updates)
        .eq('id', scan.id);
      if (updateError) throw updateError;
    }

    if (hasItems) {
      const { error: deleteError } = await supabaseAdmin
        .from('expense_scan_items')
        .delete()
        .eq('scan_id', scan.id);
      if (deleteError) throw deleteError;
      if (items.length > 0) {
        const { error: itemError } = await supabaseAdmin.from('expense_scan_items').insert(
          items.map((item) => ({ ...item, scan_id: scan.id }))
        );
        if (itemError) throw itemError;
      }
    }

    const result = await getScanWithItems(scan.id);
    res.json({
      success: true,
      result: { ...result.scan, items: result.items, image_url: await signedImageUrl(result.scan) },
    });
  } catch (err) {
    console.error('Expense scan update error:', err.message);
    res.status(500).json({ success: false, message: safeErrorMessage(err, 'Failed to update expense scan') });
  }
});

function normalizeApprovalBody(body, scan) {
  const mode = body.mode || 'cash';
  const digitalMethod = body.digital_method || 'upi';
  const allowedModes = new Set(['cash', 'digital']);
  const allowedDigitalMethods = new Set(['upi', 'bank_transfer', 'card', 'cheque', 'other']);
  if (!allowedModes.has(mode)) throw new Error('Invalid payment mode');
  if (mode === 'digital' && !allowedDigitalMethods.has(digitalMethod)) throw new Error('Invalid digital method');

  const txnDate = body.txn_date === undefined || body.txn_date === ''
    ? scan.detected_date || null
    : normalizeDate(body.txn_date);
  if (body.txn_date && !txnDate) throw new Error('Invalid transaction date');

  const notifyContactIds = Array.isArray(body.notify_contact_ids)
    ? body.notify_contact_ids.filter((id) => typeof id === 'string' && id.length <= 80)
    : [];

  return {
    party: String(body.party ?? scan.detected_party ?? '').trim().slice(0, 500) || null,
    txnDate,
    mode,
    digitalMethod: mode === 'digital' ? digitalMethod : null,
    voucherFiled: mode === 'cash' ? body.voucher_filed : false,
    functionId: body.function_id || null,
    functionCategoryId: body.function_category_id || null,
    categoryId: body.category_id || null,
    notifyContactIds,
  };
}

async function sendScanNotifications(transactionIds) {
  if (!transactionIds.length) return;
  const { data: transactions, error } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .in('id', transactionIds);
  if (error) throw error;

  await Promise.all((transactions || []).map(async (transaction) => {
    const notifyIds = Array.isArray(transaction.notify_contact_ids) ? transaction.notify_contact_ids : [];
    if (notifyIds.length === 0) {
      await supabaseAdmin.from('transactions').update({ notification_status: 'sent' }).eq('id', transaction.id);
      return;
    }

    try {
      const { data: contacts } = await supabaseAdmin
        .from('contacts')
        .select('*')
        .in('id', notifyIds)
        .eq('enabled', true);
      const results = await notifyContactsOfTransaction(transaction, contacts || []);
      const partial = results.some((result) => result.emailRes?.ok === false || result.tgRes?.ok === false);
      await supabaseAdmin.from('transactions').update({ notification_status: partial ? 'partial' : 'sent' }).eq('id', transaction.id);
    } catch (err) {
      console.error('Expense scan notification error:', err.message);
      await supabaseAdmin.from('transactions').update({ notification_status: 'failed' }).eq('id', transaction.id);
    }
  }));
}

// Approve the reviewed scan. The SQL function creates every item transaction
// in one database transaction and returns their IDs for notification delivery.
router.post('/:id/approve', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { scan, items, error } = await getScanWithItems(req.params.id);
    if (error || !scan) return res.status(404).json({ success: false, message: 'Expense scan not found' });
    if (!canAccessScan(req, scan)) return res.status(403).json({ success: false, message: 'You cannot approve this expense scan' });
    if (scan.status !== 'ready') return res.status(409).json({ success: false, message: 'Only a ready scan can be approved' });
    if (!items.length || items.some((item) => !item.amount || Number(item.amount) <= 0)) {
      return res.status(400).json({ success: false, message: 'Every expense item needs a positive amount' });
    }

    const approval = normalizeApprovalBody(req.body, scan);
    if (approval.mode === 'cash' && typeof approval.voucherFiled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Voucher filed status is required for cash expenses' });
    }

    const { data: created, error: approvalError } = await supabaseAdmin.rpc('approve_expense_scan', {
      p_scan_id: scan.id,
      p_user_id: req.user.id,
      p_party: approval.party,
      p_txn_date: approval.txnDate,
      p_mode: approval.mode,
      p_digital_method: approval.digitalMethod,
      p_voucher_filed: approval.voucherFiled,
      p_function_id: approval.functionId,
      p_function_category_id: approval.functionCategoryId,
      p_category_id: approval.categoryId,
      p_notify_contact_ids: approval.notifyContactIds,
    });

    if (approvalError) {
      return res.status(400).json({ success: false, message: safeErrorMessage(approvalError, 'Failed to approve expense scan') });
    }

    const transactionIds = (created || []).map((row) => row.transaction_id).filter(Boolean);
    const { data: transactions } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .in('id', transactionIds);

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'approve',
      entity: 'expense_scan',
      entityId: scan.id,
      details: { transaction_count: transactionIds.length, function_id: approval.functionId },
      ipAddress: req.ip,
    });

    setImmediate(() => sendScanNotifications(transactionIds).catch((err) => {
      console.error('Expense scan notification batch error:', err.message);
    }));

    res.json({
      success: true,
      result: { scan_id: scan.id, transaction_ids: transactionIds, transactions: transactions || [] },
    });
  } catch (err) {
    console.error('Expense scan approval error:', err.message);
    res.status(500).json({ success: false, message: safeErrorMessage(err, 'Failed to approve expense scan') });
  }
});

router.delete('/:id', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { scan, error } = await getScanWithItems(req.params.id);
    if (error || !scan) return res.status(404).json({ success: false, message: 'Expense scan not found' });
    if (!canAccessScan(req, scan)) return res.status(403).json({ success: false, message: 'You cannot discard this expense scan' });
    if (scan.status === 'approved') return res.status(409).json({ success: false, message: 'Approved scans cannot be discarded' });

    await supabaseAdmin.from('expense_scans').update({ status: 'discarded' }).eq('id', scan.id);
    try { await storage.deleteFile(scan.storage_path); } catch (err) {
      console.error('Expense scan image delete error:', err.message);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Expense scan discard error:', err.message);
    res.status(500).json({ success: false, message: safeErrorMessage(err, 'Failed to discard expense scan') });
  }
});

module.exports = router;
