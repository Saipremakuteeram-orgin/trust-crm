const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { runDailyBackup, getBackupLogs } = require('@/services/backup');

router.use(requireAuth);

// GET /api/backup/logs — list backup logs
router.get('/logs', requireRole('admin'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const offset = parseInt(req.query.offset) || 0;
    const logs = await getBackupLogs(limit, offset);
    res.json({ success: true, result: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/backup/run-now — trigger manual backup
router.post('/run-now', requireRole('admin'), async (req, res) => {
  try {
    const result = await runDailyBackup('manual');
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/backup/restore — restore transactions from uploaded Excel
router.post('/restore', requireRole('admin'), async (req, res) => {
  try {
    const { transactions } = req.body;
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ success: false, message: 'No transaction data provided' });
    }

    let inserted = 0;
    let skipped = 0;
    const errors = [];

    for (const txn of transactions) {
      try {
        const row = {
          type: txn.type || 'debit',
          mode: txn.mode || 'cash',
          amount: parseFloat(txn.amount) || 0,
          party: txn.party || null,
          description: txn.description || null,
          txn_date: txn.txn_date || new Date().toISOString().slice(0, 10),
          category_id: txn.category_id || null,
          reference_no: txn.reference_no || null,
          digital_method: txn.digital_method || null,
          notification_status: 'pending',
          created_by: req.user.id,
        };

        if (row.amount <= 0) {
          skipped++;
          continue;
        }

        const { error } = await supabaseAdmin.from('transactions').insert(row);
        if (error) {
          errors.push({ row: txn, error: error.message });
          skipped++;
        } else {
          inserted++;
        }
      } catch (err) {
        errors.push({ row: txn, error: err.message });
        skipped++;
      }
    }

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'restore',
      entity: 'transaction',
      details: { inserted, skipped, total: transactions.length, errors: errors.length },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      result: { inserted, skipped, total: transactions.length, errors: errors.slice(0, 5) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/backup/restore-excel — upload Excel to restore transactions
router.post('/restore-excel', requireRole('admin'), async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { fileBuffer, fileName } = req.body;

    if (!fileBuffer) {
      return res.status(400).json({ success: false, message: 'No file data provided' });
    }

    const buffer = Buffer.from(fileBuffer.data || fileBuffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheetName = workbook.worksheets[0]?.name;
    if (!sheetName) {
      return res.status(400).json({ success: false, message: 'No sheets found in the file' });
    }

    const sheet = workbook.getWorksheet(sheetName);
    const headers = [];
    sheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value || '').trim();
    });

    const transactions = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 1) return;

      const record = {};
      row.eachCell((cell, colNumber) => {
        const key = headers[colNumber];
        if (key) record[key] = cell.value;
      });

      if (record.amount || record.Amount) {
        transactions.push({
          type: String(record.type || record.Type || 'debit').toLowerCase(),
          mode: String(record.mode || record.Mode || 'cash').toLowerCase(),
          amount: parseFloat(record.amount || record.Amount) || 0,
          party: record.party || record.Party || null,
          description: record.description || record.Description || null,
          txn_date: record.txn_date || record.Date || record.date || new Date().toISOString().slice(0, 10),
          reference_no: record.reference_no || record.Reference || null,
          digital_method: record.digital_method || record.Method || null,
        });
      }
    });

    if (transactions.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid transactions found in the file' });
    }

    let inserted = 0;
    let skipped = 0;
    const errors = [];

    for (const txn of transactions) {
      try {
        if (txn.amount <= 0) { skipped++; continue; }

        const row = {
          type: txn.type === 'credit' ? 'credit' : 'debit',
          mode: txn.mode === 'digital' ? 'digital' : 'cash',
          amount: txn.amount,
          party: txn.party,
          description: txn.description,
          txn_date: txn.txn_date,
          reference_no: txn.reference_no,
          digital_method: txn.mode === 'digital' ? (txn.digital_method || 'other') : null,
          notification_status: 'pending',
          created_by: req.user.id,
        };

        const { error } = await supabaseAdmin.from('transactions').insert(row);
        if (error) { errors.push({ error: error.message }); skipped++; }
        else { inserted++; }
      } catch (err) {
        errors.push({ error: err.message });
        skipped++;
      }
    }

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'restore',
      entity: 'transaction',
      details: { source: fileName || 'uploaded_excel', inserted, skipped, total: transactions.length },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      result: { inserted, skipped, total: transactions.length, errors: errors.slice(0, 5) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/backup/version-log — show changes between morning and evening backups
router.get('/version-log', requireRole('admin'), async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const { data: dayLogs } = await supabaseAdmin
      .from('backup_logs')
      .select('*')
      .eq('backup_date', date)
      .eq('status', 'success')
      .order('created_at', { ascending: true });

    if (!dayLogs || dayLogs.length === 0) {
      return res.json({
        success: true,
        result: { backups: [], changes: [], snapshots: [], summary: null },
      });
    }

    const snapshots = dayLogs.map((l) => ({
      id: l.id,
      time: l.created_at,
      trigger: l.trigger_type,
      snapshot: l.snapshot,
      total_rows: l.total_rows,
    }));

    const changes = [];
    if (dayLogs.length >= 2) {
      const fromTime = dayLogs[0].created_at;
      const toTime = dayLogs[dayLogs.length - 1].created_at;

      const { data: logs } = await supabaseAdmin
        .from('activity_logs')
        .select('*')
        .gte('created_at', fromTime)
        .lte('created_at', toTime)
        .order('created_at', { ascending: true });

      const grouped = {};
      (logs || []).forEach((log) => {
        const key = log.entity;
        if (!grouped[key]) grouped[key] = { create: [], update: [], delete: [] };
        if (grouped[key][log.action]) {
          grouped[key][log.action].push({
            id: log.id,
            user_email: log.user_email,
            entity_id: log.entity_id,
            details: log.details,
            created_at: log.created_at,
          });
        }
      });

      const fromSnap = dayLogs[0].snapshot || {};
      const toSnap = dayLogs[dayLogs.length - 1].snapshot || {};

      const entityLabels = {
        transaction: 'Transactions',
        contact: 'Contacts',
        category: 'Categories',
        contact_group: 'Groups',
        settings: 'Settings',
        activity_log: 'Activity Logs',
      };

      for (const [entity, logs] of Object.entries(grouped)) {
        const before = fromSnap[entity + 's'] ?? fromSnap[entity] ?? null;
        const after = toSnap[entity + 's'] ?? toSnap[entity] ?? null;
        changes.push({
          entity,
          label: entityLabels[entity] || entity,
          counts: { before, after, delta: before !== null && after !== null ? after - before : null },
          creates: logs.create,
          updates: logs.update,
          deletes: logs.delete,
          total_changes: logs.create.length + logs.update.length + logs.delete.length,
        });
      }

      const totalCreates = Object.values(grouped).reduce((s, g) => s + g.create.length, 0);
      const totalUpdates = Object.values(grouped).reduce((s, g) => s + g.update.length, 0);
      const totalDeletes = Object.values(grouped).reduce((s, g) => s + g.delete.length, 0);

      return res.json({
        success: true,
        result: {
          backups: snapshots,
          changes,
          snapshots,
          summary: {
            period: { from: fromTime, to: toTime },
            total_changes: totalCreates + totalUpdates + totalDeletes,
            creates: totalCreates,
            updates: totalUpdates,
            deletes: totalDeletes,
          },
        },
      });
    }

    res.json({
      success: true,
      result: { backups: snapshots, changes: [], snapshots, summary: null },
    });
  } catch (err) {
    console.error('Version log error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
