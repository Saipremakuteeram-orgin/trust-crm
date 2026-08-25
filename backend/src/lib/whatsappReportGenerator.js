const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const supabaseAdmin = require('@/config/supabaseAdmin');
const { logActivity } = require('@/lib/logger');
const { drawPdfHeader, addExcelHeader } = require('@/lib/reportBranding');

async function fetchTransactions() {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('*, categories(name)')
    .order('txn_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function generateTransactionExcel(profile) {
  const txns = await fetchTransactions();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = profile?.full_name || 'Trust CRM';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Transactions', { views: [{ state: 'frozen', ySplit: 6 }] });

  const dataStartRow = addExcelHeader(sheet, {
    subtitle: 'Transaction Report',
    purposeKey: 'transactions',
    generatedBy: profile?.full_name,
    date: new Date().toLocaleDateString('en-IN'),
    lastCol: 'H',
  });

  sheet.columns = [
    { key: 'txn_date', width: 14 },
    { key: 'type', width: 10 },
    { key: 'mode', width: 10 },
    { key: 'amount', width: 16 },
    { key: 'party', width: 22 },
    { key: 'category', width: 20 },
    { key: 'description', width: 30 },
    { key: 'reference_no', width: 16 },
  ];

  const headerRow = sheet.getRow(dataStartRow);
  headerRow.values = ['Date', 'Type', 'Mode', 'Amount (₹)', 'Party', 'Category', 'Description', 'Reference'];
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 28;

  let totalCredit = 0;
  let totalDebit = 0;

  txns.forEach((t) => {
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
    amount: totalCredit - totalDebit,
    party: `Credit: ₹${totalCredit.toLocaleString('en-IN')}  |  Debit: ₹${totalDebit.toLocaleString('en-IN')}`,
  });
  summaryRow.font = { bold: true, size: 11 };
  sheet.autoFilter = { from: 'A' + dataStartRow, to: 'H' + dataStartRow };

  const buffer = await workbook.xlsx.writeBuffer();
  const now = new Date().toISOString().slice(0, 10);
  const fileName = `Trust-CRM-Transactions-${now}.xlsx`;

  return {
    buffer: Buffer.from(buffer),
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileName,
  };
}

async function generateTransactionPdf(profile) {
  const txns = await fetchTransactions();
  const now = new Date().toISOString().slice(0, 10);
  const fileName = `Trust-CRM-Transactions-${now}.pdf`;

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      resolve({ buffer, mimetype: 'application/pdf', fileName });
    });
    doc.on('error', reject);

    const headerStart = drawPdfHeader(doc, {
      subtitle: 'Transaction Report',
      purposeKey: 'transactions',
      generatedBy: profile?.full_name,
      date: new Date().toLocaleDateString('en-IN'),
    });

    let totalCredit = 0;
    let totalDebit = 0;

    const headers = ['Date', 'Type', 'Mode', 'Amount', 'Party', 'Category', 'Description', 'Reference'];
    const colWidths = [75, 55, 55, 85, 140, 110, 180, 80];
    let x = 40;
    const headerY = headerStart;

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
    doc.rect(40, headerY, 775, 20).fill('#4338ca');
    headers.forEach((h, i) => {
      doc.fillColor('#ffffff').text(h, x + 4, headerY + 6, { width: colWidths[i] });
      x += colWidths[i];
    });

    let rowY = headerY + 24;
    doc.font('Helvetica').fontSize(8);

    txns.forEach((t, idx) => {
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
  });
}

async function generateTransactionReport(profile, reportType) {
  if (reportType === 'transactions-excel') {
    return generateTransactionExcel(profile);
  }
  if (reportType === 'transactions-pdf') {
    return generateTransactionPdf(profile);
  }
  throw new Error(`Unknown reportType: ${reportType}`);
}

module.exports = {
  generateTransactionReport,
  generateTransactionExcel,
  generateTransactionPdf,
};
