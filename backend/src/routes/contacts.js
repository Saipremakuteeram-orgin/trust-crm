const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { safeErrorMessage } = require('@/lib/security');

const CONTACT_FIELDS = ['name', 'email', 'phone', 'telegram_chat_id', 'enabled', 'subscribe_monthly_report', 'notes'];
const CSV_UPLOAD = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('contacts').select('id, name, email, phone, telegram_chat_id, enabled, subscribe_monthly_report, notes, created_by, created_at').order('name');
  if (error) return res.status(400).json({ success: false, message: 'Failed to fetch contacts' });
  res.set('Cache-Control', 'private, max-age=30');
  res.json({ success: true, result: data });
});

function pickAllowedFields(body) {
  const out = {};
  for (const key of CONTACT_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

router.post('/', requireRole('admin', 'accountant'), async (req, res) => {
  const fields = pickAllowedFields(req.body);
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .insert({ ...fields, created_by: req.user.id })
    .select('id, name, email, phone, telegram_chat_id, enabled, subscribe_monthly_report, notes, created_by, created_at')
    .single();
  if (error) return res.status(400).json({ success: false, message: 'Failed to create contact' });

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    entity: 'contact',
    entityId: data.id,
    details: { name: data.name, email: data.email },
    ipAddress: req.ip,
  });

  res.json({ success: true, result: data });
});

router.patch('/:id', requireRole('admin', 'accountant'), async (req, res) => {
  const fields = pickAllowedFields(req.body);
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ success: false, message: 'No valid fields to update' });
  }
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .update(fields)
    .eq('id', req.params.id)
    .select('id, name, email, phone, telegram_chat_id, enabled, subscribe_monthly_report, notes, created_by, created_at')
    .single();
  if (error) return res.status(400).json({ success: false, message: 'Failed to update contact' });

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    entity: 'contact',
    entityId: req.params.id,
    details: fields,
    ipAddress: req.ip,
  });

  res.json({ success: true, result: data });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'delete',
    entity: 'contact',
    entityId: req.params.id,
    details: {},
    ipAddress: req.ip,
  });

  const { error } = await supabaseAdmin.from('contacts').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ success: false, message: 'Failed to delete contact' });
  res.json({ success: true });
});

async function parseCsvBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.csv.load(buffer);
  const sheet = workbook.getWorksheet(1);
  if (!sheet || sheet.rowCount < 2) return [];
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const vals = (i) => {
      const v = row.getCell(i).value;
      return v != null ? String(v).trim() : '';
    };
    const name = vals(1);
    if (!name) return;
    rows.push({
      row: rowNumber,
      name,
      email: vals(2),
      phone: vals(3),
      telegram_chat_id: vals(4),
      subscribe_monthly_report: ['true', '1', 'yes'].includes(vals(5).toLowerCase()),
      notes: vals(6),
    });
  });
  return rows;
}

router.post('/bulk/preview', requireRole('admin', 'accountant'), CSV_UPLOAD.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const rows = await parseCsvBuffer(req.file.buffer);
    if (rows.length === 0) return res.status(400).json({ success: false, message: 'CSV is empty or has no valid rows' });

    const emails = rows.map((r) => r.email).filter(Boolean);
    let existingContacts = [];
    if (emails.length > 0) {
      const { data } = await supabaseAdmin.from('contacts').select('id, email').in('email', emails);
      existingContacts = data || [];
    }
    const emailMap = {};
    for (const c of existingContacts) {
      if (c.email) emailMap[c.email.toLowerCase()] = c.id;
    }

    const result = rows.map((r) => ({
      ...r,
      isDuplicate: r.email ? !!emailMap[r.email.toLowerCase()] : false,
      existingId: r.email ? emailMap[r.email.toLowerCase()] || null : null,
    }));

    res.json({ success: true, result: { rows: result, totalRows: result.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to parse CSV: ' + (err.message || 'Unknown error') });
  }
});

router.post('/bulk/confirm', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ success: false, message: 'No rows provided' });

    let imported = 0, updated = 0, skipped = 0;
    const errors = [];

    for (const r of rows) {
      if (r.action === 'skip') { skipped++; continue; }

      const fields = {
        name: r.name,
        email: r.email || null,
        phone: r.phone || null,
        telegram_chat_id: r.telegram_chat_id || null,
        subscribe_monthly_report: !!r.subscribe_monthly_report,
        notes: r.notes || null,
      };

      if (r.action === 'overwrite' && r.existingId) {
        const { error } = await supabaseAdmin.from('contacts').update(fields).eq('id', r.existingId);
        if (error) { errors.push({ row: r.row, reason: error.message }); continue; }
        updated++;
      } else {
        const { error } = await supabaseAdmin.from('contacts').insert({ ...fields, created_by: req.user.id });
        if (error) { errors.push({ row: r.row, reason: error.message }); continue; }
        imported++;
      }
    }

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'bulk_create',
      entity: 'contact',
      details: { imported, updated, skipped, errors: errors.length },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: { imported, updated, skipped, errors } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Bulk import failed: ' + (err.message || 'Unknown error') });
  }
});

module.exports = router;
