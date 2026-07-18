const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const storage = require('@/services/storage');

router.use(requireAuth);

async function getUserRole(userId) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role || 'accountant';
}

function buildWorkbook(txns, profile) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = profile?.full_name || 'Trust CRM';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Transactions', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Date', key: 'txn_date', width: 14 },
    { header: 'Type', key: 'type', width: 10 },
    { header: 'Mode', key: 'mode', width: 10 },
    { header: 'Amount (₹)', key: 'amount', width: 16 },
    { header: 'Party', key: 'party', width: 22 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Description', key: 'description', width: 30 },
    { header: 'Reference', key: 'reference_no', width: 16 },
    { header: 'Voucher', key: 'voucher_filed', width: 12 },
    { header: 'Notification', key: 'notification_status', width: 14 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 28;

  let totalCredit = 0;
  let totalDebit = 0;

  (txns || []).forEach((t) => {
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'credit') totalCredit += amt;
    else totalDebit += amt;

    const row = sheet.addRow({
      txn_date: t.txn_date,
      type: t.type?.toUpperCase(),
      mode: t.mode,
      amount: amt,
      party: t.party || '',
      category: t.categories?.name || '',
      description: t.description || '',
      reference_no: t.reference_no || '',
      voucher_filed: t.mode === 'cash' ? (t.voucher_filed ? 'Filed' : 'Not Filed') : '',
      notification_status: t.notification_status || '',
    });

    if (t.type === 'credit') {
      row.getCell('amount').font = { color: { argb: 'FF059669' } };
      row.getCell('type').font = { color: { argb: 'FF059669' }, bold: true };
    } else {
      row.getCell('amount').font = { color: { argb: 'FFE11D48' } };
      row.getCell('type').font = { color: { argb: 'FFE11D48' }, bold: true };
    }
  });

  sheet.addRow([]);
  const summaryRow = sheet.addRow({
    txn_date: 'TOTAL',
    type: '',
    mode: '',
    amount: totalCredit - totalDebit,
    party: `Credit: ₹${totalCredit.toLocaleString('en-IN')}  |  Debit: ₹${totalDebit.toLocaleString('en-IN')}`,
  });
  summaryRow.font = { bold: true, size: 11 };
  summaryRow.getCell('txn_date').font = { bold: true, size: 12 };
  sheet.autoFilter = { from: 'A1', to: 'J1' };

  return workbook;
}

function buildWorkbookFromSpreadsheet(data) {
  const workbook = new ExcelJS.Workbook();
  const sheets = data.sheets || {};

  for (const [sheetId, sheetData] of Object.entries(sheets)) {
    const sheet = workbook.addWorksheet(sheetData.name || sheetId);
    const cellData = sheetData.cellData || {};

    let maxRow = 0;
    let maxCol = 0;
    for (const rowKey of Object.keys(cellData)) {
      const r = parseInt(rowKey);
      if (!isNaN(r)) {
        if (r > maxRow) maxRow = r;
        for (const colKey of Object.keys(cellData[rowKey] || {})) {
          const c = parseInt(colKey);
          if (!isNaN(c) && c > maxCol) maxCol = c;
        }
      }
    }

    for (let r = 0; r <= maxRow; r++) {
      const row = sheet.getRow(r + 1);
      for (let c = 0; c <= maxCol; c++) {
        const cell = cellData[r]?.[c];
        if (cell) {
          const val = cell.v ?? cell.p?.body?.text ?? '';
          row.getCell(c + 1).value = typeof val === 'object' ? JSON.stringify(val) : val;
        }
      }
    }
  }

  return workbook;
}

async function saveAndNotify(workbook, fileName, userId, userEmail, role) {
  const buffer = await workbook.xlsx.writeBuffer();
  const path = `${role}/${fileName}`;
  await storage.uploadFile(path, Buffer.from(buffer), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await storage.sendFileToTelegram(path, fileName, `📄 ${fileName}`);

  logActivity({
    userId,
    userEmail,
    action: 'save_to_drive',
    entity: 'spreadsheet',
    details: { file_name: fileName, storage_path: path, role },
    ipAddress: null,
  });

  return { name: fileName, path };
}

// POST /api/exports/transactions/excel
router.post('/transactions/excel', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { data: txns, error } = await supabaseAdmin
      .from('transactions')
      .select('*, categories(name)')
      .order('txn_date', { ascending: false });
    if (error) throw error;

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', req.user.id)
      .single();

    const workbook = buildWorkbook(txns, profile);
    const buffer = await workbook.xlsx.writeBuffer();
    const now = new Date().toISOString().slice(0, 10);
    const fileName = `Trust-CRM-Transactions-${now}.xlsx`;

    if (req.query.save === 'drive') {
      const role = await getUserRole(req.user.id);
      const result = await saveAndNotify(workbook, fileName, req.user.id, req.user.email, role);
      return res.json({ success: true, result });
    }

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'export',
      entity: 'transaction',
      details: { format: 'excel', file_name: fileName },
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Excel export error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/exports/transactions/pdf
router.post('/transactions/pdf', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { data: txns, error } = await supabaseAdmin
      .from('transactions')
      .select('*, categories(name)')
      .order('txn_date', { ascending: false });
    if (error) throw error;

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', req.user.id)
      .single();

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    const now = new Date().toISOString().slice(0, 10);
    const fileName = `Trust-CRM-Transactions-${now}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold').text('Trust CRM', 40, 40);
    doc.fontSize(11).font('Helvetica').text('Transaction Report', 40, 65);
    doc.fontSize(9).fillColor('#666666')
      .text(`Generated by: ${profile?.full_name || 'Unknown'}  |  Date: ${new Date().toLocaleDateString('en-IN')}`, 40, 82);
    doc.moveTo(40, 100).lineTo(815, 100).strokeColor('#e5e7eb').stroke();

    let totalCredit = 0;
    let totalDebit = 0;

    const headers = ['Date', 'Type', 'Mode', 'Amount', 'Party', 'Category', 'Description', 'Reference', 'Voucher'];
    const colWidths = [75, 55, 55, 85, 140, 110, 180, 80, 60];
    let x = 40;
    const headerY = 112;

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
    doc.rect(40, headerY, 775, 20).fill('#4338ca');
    headers.forEach((h, i) => {
      doc.fillColor('#ffffff').text(h, x + 4, headerY + 6, { width: colWidths[i] });
      x += colWidths[i];
    });

    let rowY = headerY + 24;
    doc.font('Helvetica').fontSize(8);

    (txns || []).forEach((t, idx) => {
      if (rowY > 560) {
        doc.addPage();
        rowY = 40;
      }

      const amt = parseFloat(t.amount) || 0;
      if (t.type === 'credit') totalCredit += amt;
      else totalDebit += amt;

      if (idx % 2 === 0) {
        doc.rect(40, rowY - 2, 775, 18).fill('#f9fafb');
      }

      x = 40;
      const vals = [
        t.txn_date,
        t.type?.toUpperCase(),
        t.mode,
        `₹${amt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
        t.party || '-',
        t.categories?.name || '-',
        t.description || '-',
        t.reference_no || '-',
        t.mode === 'cash' ? (t.voucher_filed ? 'Filed' : 'Not Filed') : '-',
      ];

      vals.forEach((v, i) => {
        doc.fillColor(i === 3 ? (t.type === 'credit' ? '#059669' : '#e11d48') : '#1f2937')
          .text(String(v).substring(0, 30), x + 4, rowY, { width: colWidths[i] });
        x += colWidths[i];
      });

      rowY += 18;
    });

    rowY += 10;
    doc.moveTo(40, rowY).lineTo(815, rowY).strokeColor('#d1d5db').stroke();
    rowY += 8;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1f2937');
    doc.text(`Total Credit: ₹${totalCredit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, 40, rowY);
    doc.text(`Total Debit: ₹${totalDebit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, 280, rowY);
    doc.text(`Net: ₹${(totalCredit - totalDebit).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, 500, rowY);

    doc.end();

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'export',
      entity: 'transaction',
      details: { format: 'pdf', file_name: fileName },
      ipAddress: req.ip,
    });
  } catch (err) {
    console.error('PDF export error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/exports/spreadsheet/save
router.post('/spreadsheet/save', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { data, fileName: customName } = req.body;
    if (!data) return res.status(400).json({ success: false, message: 'No spreadsheet data provided' });

    const workbook = buildWorkbookFromSpreadsheet(data);
    const now = new Date().toISOString().slice(0, 10);
    const fileName = customName ? `${customName}.xlsx` : `Trust-CRM-Sheet-${now}.xlsx`;
    const role = await getUserRole(req.user.id);
    const result = await saveAndNotify(workbook, fileName, req.user.id, req.user.email, role);

    res.json({ success: true, result });
  } catch (err) {
    console.error('Spreadsheet save error:', err.message);
    console.error('Spreadsheet save error stack:', err.stack);
    res.status(500).json({ success: false, message: `Failed to save: ${err.message}` });
  }
});

// POST /api/exports/spreadsheet/download
router.post('/spreadsheet/download', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { data, fileName: customName } = req.body;
    if (!data) return res.status(400).json({ success: false, message: 'No spreadsheet data provided' });

    const workbook = buildWorkbookFromSpreadsheet(data);
    const buffer = await workbook.xlsx.writeBuffer();
    const now = new Date().toISOString().slice(0, 10);
    const fileName = customName ? `${customName}.xlsx` : `Trust-CRM-Sheet-${now}.xlsx`;

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'export',
      entity: 'spreadsheet',
      details: { format: 'excel', file_name: fileName },
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Spreadsheet download error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/exports/saved-files — list saved files
router.get('/saved-files', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const role = await getUserRole(req.user.id);
    const files = await storage.listFiles(role);
    res.json({ success: true, result: files });
  } catch (err) {
    res.json({ success: true, result: [] });
  }
});

// GET /api/exports/download/:folder/:fileName
router.get('/download/:folder/:fileName', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const path = `${req.params.folder}/${req.params.fileName}`;
    const data = await storage.downloadFile(path);
    const buffer = Buffer.from(await data.arrayBuffer());
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.fileName}"`);
    res.send(buffer);
  } catch (err) {
    res.status(404).json({ success: false, message: 'File not found' });
  }
});

// DELETE /api/exports/delete/:folder/:fileName
router.delete('/delete/:folder/:fileName', requireRole('admin'), async (req, res) => {
  try {
    const path = `${req.params.folder}/${req.params.fileName}`;
    await storage.deleteFile(path);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
