const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { runDailyBackup, getBackupLogs } = require('@/services/backup');
const { safeErrorMessage } = require('@/lib/security');

const MAX_RESTORE_ROWS = 10000;

router.use(requireAuth);

// GET /api/backup/logs — list backup logs
router.get('/logs', requireRole('admin'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const offset = parseInt(req.query.offset) || 0;
    const logs = await getBackupLogs(limit, offset);
    res.json({ success: true, result: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch backup logs' });
  }
});

// POST /api/backup/run-now — trigger manual backup
router.post('/run-now', requireRole('admin'), async (req, res) => {
  try {
    const result = await runDailyBackup('manual');
    res.json({ success: true, result });
  } catch (err) {
    console.error('Backup run-now error:', safeErrorMessage(err));
    res.status(500).json({ success: false, message: 'Backup failed' });
  }
});

// POST /api/backup/restore — restore transactions from uploaded Excel
router.post('/restore', requireRole('admin'), async (req, res) => {
  try {
    const { transactions } = req.body;
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ success: false, message: 'No transaction data provided' });
    }
    if (transactions.length > MAX_RESTORE_ROWS) {
      return res.status(400).json({ success: false, message: `Too many rows (max ${MAX_RESTORE_ROWS})` });
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
          errors.push({ row: txn, error: 'Insert failed' });
          skipped++;
        } else {
          inserted++;
        }
      } catch (err) {
        errors.push({ row: txn, error: 'Insert failed' });
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
    res.status(500).json({ success: false, message: 'Restore failed' });
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
        if (error) { errors.push({ error: 'Insert failed' }); skipped++; }
        else { inserted++; }
      } catch (err) {
        errors.push({ error: 'Insert failed' });
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
    res.status(500).json({ success: false, message: 'Excel restore failed' });
  }
});

// GET /api/backup/version-log — row-level diff between morning and evening backups
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
      return res.json({ success: true, result: { backups: [], diffs: [], summary: null } });
    }

    const snapshots = dayLogs.map((l) => ({
      id: l.id,
      time: l.created_at,
      trigger: l.trigger_type,
      total_rows: l.total_rows,
      file_name: l.file_name,
    }));

    const DATA_TABLES = ['transactions', 'contacts', 'categories', 'contact_groups'];
    const entityLabels = {
      transactions: 'Transactions',
      contacts: 'Contacts',
      categories: 'Categories',
      contact_groups: 'Groups',
    };

    const diffs = [];
    let totalNew = 0;
    let totalModified = 0;
    let totalDeleted = 0;

    if (dayLogs.length >= 2) {
      const fromSnap = dayLogs[0].snapshot || {};
      const toSnap = dayLogs[dayLogs.length - 1].snapshot || {};

      for (const tableName of DATA_TABLES) {
        const morningRows = Array.isArray(fromSnap[tableName]) ? fromSnap[tableName] : [];
        const eveningRows = Array.isArray(toSnap[tableName]) ? toSnap[tableName] : [];

        const morningMap = {};
        morningRows.forEach((r) => { if (r && r.id) morningMap[r.id] = r; });
        const eveningMap = {};
        eveningRows.forEach((r) => { if (r && r.id) eveningMap[r.id] = r; });

        const morningIds = new Set(Object.keys(morningMap));
        const eveningIds = new Set(Object.keys(eveningMap));

        const newRows = [];
        eveningIds.forEach((id) => {
          if (!morningIds.has(id)) newRows.push(eveningMap[id]);
        });

        const deletedRows = [];
        morningIds.forEach((id) => {
          if (!eveningIds.has(id)) deletedRows.push(morningMap[id]);
        });

        const modifiedRows = [];
        morningIds.forEach((id) => {
          if (!eveningIds.has(id)) return;
          const before = morningMap[id];
          const after = eveningMap[id];
          const changedFields = [];
          const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
          for (const key of allKeys) {
            if (key === 'created_at' || key === 'updated_at') continue;
            const bv = JSON.stringify(before[key]);
            const av = JSON.stringify(after[key]);
            if (bv !== av) {
              changedFields.push({ field: key, from: before[key], to: after[key] });
            }
          }
          if (changedFields.length > 0) {
            modifiedRows.push({ id, before, after, changedFields });
          }
        });

        if (newRows.length > 0 || deletedRows.length > 0 || modifiedRows.length > 0) {
          diffs.push({
            entity: tableName,
            label: entityLabels[tableName] || tableName,
            morning_count: morningRows.length,
            evening_count: eveningRows.length,
            new_rows: newRows,
            modified_rows: modifiedRows,
            deleted_rows: deletedRows,
          });
          totalNew += newRows.length;
          totalModified += modifiedRows.length;
          totalDeleted += deletedRows.length;
        }
      }

      return res.json({
        success: true,
        result: {
          backups: snapshots,
          diffs,
          summary: {
            period: { from: dayLogs[0].created_at, to: dayLogs[dayLogs.length - 1].created_at },
            total_changes: totalNew + totalModified + totalDeleted,
            new_count: totalNew,
            modified_count: totalModified,
            deleted_count: totalDeleted,
          },
        },
      });
    }

    res.json({ success: true, result: { backups: snapshots, diffs: [], summary: null } });
  } catch (err) {
    console.error('Version log error:', safeErrorMessage(err));
    res.status(500).json({ success: false, message: 'Failed to fetch version log' });
  }
});

module.exports = router;
