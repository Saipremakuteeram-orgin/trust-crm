const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { drawPdfHeader } = require('@/lib/reportBranding');

router.use(requireAuth);

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function getMonthKey(d) {
  return d.toISOString().slice(0, 7);
}

// Resolve date range from query params
// range: daily | monthly | yearly | custom
function resolveRange(query) {
  const range = query.range || 'monthly';
  const now = new Date();

  if (range === 'daily') {
    const day = query.date ? new Date(query.date) : now;
    const start = new Date(day); start.setUTCHours(0, 0, 0, 0);
    const end = new Date(day); end.setUTCHours(23, 59, 59, 999);
    return { range, label: toISODate(day), start: toISODate(start), end: toISODate(end) };
  }

  if (range === 'monthly') {
    const ym = query.month ? query.month : now.toISOString().slice(0, 7); // YYYY-MM
    const start = new Date(`${ym}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    end.setUTCHours(23, 59, 59, 999);
    return { range, label: ym, start: toISODate(start), end: toISODate(end) };
  }

  if (range === 'yearly') {
    const y = query.year ? parseInt(query.year) : now.getUTCFullYear();
    const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
    return { range, label: String(y), start: toISODate(start), end: toISODate(end) };
  }

  // custom
  const start = query.from ? new Date(query.from) : new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const end = query.to ? new Date(query.to) : now;
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(23, 59, 59, 999);
  return { range: 'custom', label: `${toISODate(start)} to ${toISODate(end)}`, start: toISODate(start), end: toISODate(end) };
}

async function fetchTransactionsInRange(start, end) {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('*, categories(name)')
    .gte('txn_date', start)
    .lte('txn_date', end)
    .order('txn_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

// GET /api/reports?range=monthly&month=2026-07
router.get('/', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { start, end, label, range } = resolveRange(req.query);
    const txns = await fetchTransactionsInRange(start, end);

    const { data: catRows } = await supabaseAdmin.from('categories').select('id, name');
    const catMap = {};
    (catRows || []).forEach((c) => { catMap[c.id] = c.name; });

    let total_credit = 0;
    let total_debit = 0;
    let cash_in = 0;
    let cash_out = 0;
    let digital_in = 0;
    let digital_out = 0;
    const catMap2 = {};
    const partyMap = {};
    const trendMap = {};

    txns.forEach((t) => {
      const amt = parseFloat(t.amount) || 0;
      const isCredit = t.type === 'credit';
      if (isCredit) total_credit += amt; else total_debit += amt;

      if (t.mode === 'cash') {
        if (isCredit) cash_in += amt; else cash_out += amt;
      } else {
        if (isCredit) digital_in += amt; else digital_out += amt;
      }

      if (isCredit === false) {
        const catName = catMap[t.category_id] || 'Uncategorized';
        catMap2[catName] = (catMap2[catName] || 0) + amt;
      }

      if (t.party) partyMap[t.party] = (partyMap[t.party] || 0) + amt;

      const trendKey = range === 'yearly' ? getMonthKey(new Date(t.txn_date)) : t.txn_date;
      if (!trendMap[trendKey]) trendMap[trendKey] = { period: trendKey, credit: 0, debit: 0, net: 0 };
      if (isCredit) trendMap[trendKey].credit += amt; else trendMap[trendKey].debit += amt;
    });

    Object.values(trendMap).forEach((m) => { m.net = m.credit - m.debit; });
    const trend = Object.values(trendMap).sort((a, b) => a.period.localeCompare(b.period));

    const category_breakdown = Object.entries(catMap2)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const top_parties = Object.entries(partyMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    res.json({
      success: true,
      result: {
        range,
        label,
        start,
        end,
        txn_count: txns.length,
        overview: {
          total_credit,
          total_debit,
          net_balance: total_credit - total_debit,
          cash_in_hand: cash_in - cash_out,
          digital_balance: digital_in - digital_out,
        },
        category_breakdown,
        top_parties,
        trend,
      },
    });
  } catch (err) {
    console.error('Reports error:', err.message);
    res.status(500).json({ success: false, message: 'Report generation failed' });
  }
});

// GET /api/reports/transactions?range=...&month=... (for export download)
router.get('/transactions', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { start, end } = resolveRange(req.query);
    const txns = await fetchTransactionsInRange(start, end);
    res.json({ success: true, result: txns });
  } catch (err) {
    console.error('Reports transactions error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { buildWorkbook } = require('./exports');

function reportFileName(label, ext) {
  const safe = String(label).replace(/[^a-zA-Z0-9-]/g, '_');
  return `Trust-CRM-Report-${safe}.${ext}`;
}

// POST /api/reports/export/excel?range=...&month=...
router.post('/export/excel', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { start, end, label } = resolveRange(req.query);
    const txns = await fetchTransactionsInRange(start, end);
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('full_name').eq('id', req.user.id).single();

    const workbook = buildWorkbook(txns, profile);
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = reportFileName(label, 'xlsx');

    logActivity({
      userId: req.user.id, userEmail: req.user.email, action: 'export',
      entity: 'transaction', details: { format: 'excel', report_range: label, file_name: fileName }, ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Report excel error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/reports/export/pdf?range=...&month=...
router.post('/export/pdf', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { start, end, label } = resolveRange(req.query);
    const txns = await fetchTransactionsInRange(start, end);
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('full_name').eq('id', req.user.id).single();

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const fileName = reportFileName(label, 'pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    doc.pipe(res);

    const headerOpts = {
      subtitle: `Transaction Report — ${label}`,
      generatedBy: profile?.full_name || 'Unknown',
      date: new Date().toLocaleDateString('en-IN'),
    };
    const headerY = drawPdfHeader(doc, headerOpts);

    let totalCredit = 0, totalDebit = 0;
    const headers = ['Date', 'Type', 'Mode', 'Amount', 'Party', 'Category', 'Description', 'Reference', 'Voucher'];
    const colWidths = [75, 55, 55, 85, 140, 110, 180, 80, 60];
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
    doc.rect(40, headerY, 775, 20).fill('#4338ca');
    let x = 40;
    headers.forEach((h, i) => { doc.fillColor('#ffffff').text(h, x + 4, headerY + 6, { width: colWidths[i] }); x += colWidths[i]; });

    let rowY = headerY + 24;
    doc.font('Helvetica').fontSize(8);
    txns.forEach((t, idx) => {
        if (rowY > 560) {
          doc.addPage();
          rowY = drawPdfHeader(doc, headerOpts);
        }
      const amt = parseFloat(t.amount) || 0;
      if (t.type === 'credit') totalCredit += amt; else totalDebit += amt;
      if (idx % 2 === 0) doc.rect(40, rowY - 2, 775, 18).fill('#f9fafb');
      x = 40;
      const vals = [
        t.txn_date, t.type?.toUpperCase(), t.mode,
        `₹${amt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
        t.party || '-', t.categories?.name || '-', t.description || '-', t.reference_no || '-',
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
      userId: req.user.id, userEmail: req.user.email, action: 'export',
      entity: 'transaction', details: { format: 'pdf', report_range: label, file_name: fileName }, ipAddress: req.ip,
    });
  } catch (err) {
    console.error('Report pdf error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/reports/generate — Generate ad-hoc report with custom filters and optional delivery
// Body: { range, date, month, year, from, to, filter_type, filter_mode, filter_categories, format, delivery_email, delivery_telegram, recipient_mode, recipient_contact_ids, recipient_group_ids }
router.post('/generate', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const {
      range = 'custom',
      date, month, year, from, to,
      filter_type = [], filter_mode = [], filter_categories = [],
      format = 'excel',
      delivery_email = false,
      delivery_telegram = false,
      recipient_mode = 'subscribed',
      recipient_contact_ids = [],
      recipient_group_ids = [],
    } = req.body;

    // Resolve date range
    const rangeQuery = { range, date, month, year, from, to };
    const { start, end, label, range: resolvedRange } = resolveRange(rangeQuery);

    // Fetch transactions in range
    let txns = await fetchTransactionsInRange(start, end);

    // Apply filters
    if (filter_type.length > 0) {
      txns = txns.filter((t) => filter_type.includes(t.type));
    }
    if (filter_mode.length > 0) {
      txns = txns.filter((t) => filter_mode.includes(t.mode));
    }
    if (filter_categories.length > 0) {
      txns = txns.filter((t) => t.category_id && filter_categories.includes(t.category_id));
    }

    // Build report data
    const { data: catRows } = await supabaseAdmin.from('categories').select('id, name');
    const catMap = {};
    (catRows || []).forEach((c) => { catMap[c.id] = c.name; });

    let total_credit = 0, total_debit = 0, cash_in = 0, cash_out = 0, digital_in = 0, digital_out = 0;
    const catMap2 = {};

    txns.forEach((t) => {
      const amt = parseFloat(t.amount) || 0;
      const isCredit = t.type === 'credit';
      if (isCredit) total_credit += amt; else total_debit += amt;
      if (t.mode === 'cash') { if (isCredit) cash_in += amt; else cash_out += amt; }
      else { if (isCredit) digital_in += amt; else digital_out += amt; }
      if (!isCredit) {
        const catName = catMap[t.category_id] || 'Uncategorized';
        catMap2[catName] = (catMap2[catName] || 0) + amt;
      }
    });

    const category_breakdown = Object.entries(catMap2)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const reportData = {
      range: resolvedRange,
      label,
      start,
      end,
      txn_count: txns.length,
      overview: {
        total_credit,
        total_debit,
        net_balance: total_credit - total_debit,
        cash_in_hand: cash_in - cash_out,
        digital_balance: digital_in - digital_out,
      },
      category_breakdown,
      transactions: txns,
    };

    // If format is 'preview', return JSON preview
    if (format === 'preview') {
      return res.json({ success: true, result: reportData });
    }

    // Generate file
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('full_name, email').eq('id', req.user.id).single();

    let fileBuffer, mimeType, fileName;

    if (format === 'excel') {
      const workbook = buildWorkbook(txns, profile);
      fileBuffer = await workbook.xlsx.writeBuffer();
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      fileName = `Trust-CRM-Report-${label.replace(/[^a-zA-Z0-9-]/g, '_')}.xlsx`;
    } else if (format === 'pdf') {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => { fileBuffer = Buffer.concat(chunks); });
      fileName = `Trust-CRM-Report-${label.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
      mimeType = 'application/pdf';

      const headerOpts = {
        subtitle: `Transaction Report — ${label}`,
        generatedBy: profile?.full_name || 'Unknown',
        date: new Date().toLocaleDateString('en-IN'),
      };
      const headerY = drawPdfHeader(doc, headerOpts);

      let totalCredit = 0, totalDebit = 0;
      const headers = ['Date', 'Type', 'Mode', 'Amount', 'Party', 'Category', 'Description', 'Reference', 'Voucher'];
      const colWidths = [75, 55, 55, 85, 140, 110, 180, 80, 60];
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
      doc.rect(40, headerY, 775, 20).fill('#4338ca');
      let x = 40;
      headers.forEach((h, i) => { doc.fillColor('#ffffff').text(h, x + 4, headerY + 6, { width: colWidths[i] }); x += colWidths[i]; });

      let rowY = headerY + 24;
      doc.font('Helvetica').fontSize(8);
      txns.forEach((t, idx) => {
      if (rowY > 560) {
        doc.addPage();
        rowY = drawPdfHeader(doc, headerOpts);
      }
        const amt = parseFloat(t.amount) || 0;
        if (t.type === 'credit') totalCredit += amt; else totalDebit += amt;
        if (idx % 2 === 0) doc.rect(40, rowY - 2, 775, 18).fill('#f9fafb');
        x = 40;
        const vals = [
          t.txn_date, t.type?.toUpperCase(), t.mode,
          `��${amt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
          t.party || '-', t.categories?.name || '-', t.description || '-', t.reference_no || '-',
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

      // Wait for buffer to be ready
      await new Promise((resolve) => { if (fileBuffer) resolve(); else doc.once('end', resolve); });
    } else {
      // summary format - return JSON
      return res.json({ success: true, result: reportData });
    }

    // Log activity
    logActivity({
      userId: req.user.id, userEmail: req.user.email, action: 'export',
      entity: 'transaction', details: { format, report_range: label, file_name: fileName, filters: { filter_type, filter_mode, filter_categories } }, ipAddress: req.ip,
    });

    // Deliver if requested
    if (delivery_email || delivery_telegram) {
      const { sendEmail, sendTelegram, notifyContactsOfTransaction } = require('@/services/notify');
      const contactsRes = await supabaseAdmin.from('contacts').select('*').eq('enabled', true);
      const allContacts = contactsRes.data || [];

      let recipients = [];
      if (recipient_mode === 'subscribed') {
        recipients = allContacts.filter((c) => c.email && c.subscribed !== false);
      } else if (recipient_mode === 'selected') {
        recipients = allContacts.filter((c) => recipient_contact_ids.includes(c.id) && c.email);
      } else if (recipient_mode === 'groups') {
        const { data: groupMembers } = await supabaseAdmin
          .from('contact_group_members').select('contact_id').in('group_id', recipient_group_ids);
        const ids = new Set(groupMembers?.map((m) => m.contact_id) || []);
        recipients = allContacts.filter((c) => ids.has(c.id) && c.email);
      }

      const html = `
        <div style="font-family:sans-serif;font-size:14px;color:#333">
          <h3>Transaction Report — ${label}</h3>
          <p><b>Period:</b> ${label} (${reportData.txn_count} transactions)</p>
          <p><b>Total Income:</b> ₹${total_credit.toLocaleString('en-IN')}</p>
          <p><b>Total Expenses:</b> ₹${total_debit.toLocaleString('en-IN')}</p>
          <p><b>Net:</b> ₹${(total_credit - total_debit).toLocaleString('en-IN')}</p>
          <p><b>Cash in Hand:</b> ₹${(cash_in - cash_out).toLocaleString('en-IN')}</p>
          <p><b>Digital Balance:</b> ₹${(digital_in - digital_out).toLocaleString('en-IN')}</p>
          <p style="margin-top:16px;color:#666;font-size:12px;">This is an automated report from Trust CRM.</p>
        </div>`;

      if (delivery_email && recipients.length > 0) {
        await sendEmail({
          to: recipients.map((c) => c.email).join(','),
          subject: `Transaction Report — ${label}`,
          html,
          attachments: [{ filename: fileName, content: fileBuffer.toString('base64') }],
        });
      }

      if (delivery_telegram) {
        const telegramText =
          `���� <b>Transaction Report — ${label}</b>\n` +
          `Period: ${label}\n` +
          `Transactions: ${reportData.txn_count}\n` +
          `Income: ₹${total_credit.toLocaleString('en-IN')}\n` +
          `Expenses: ₹${total_debit.toLocaleString('en-IN')}\n` +
          `Net: ₹${(total_credit - total_debit).toLocaleString('en-IN')}\n` +
          `Cash: ₹${(cash_in - cash_out).toLocaleString('en-IN')}\n` +
          `Digital: ₹${(digital_in - digital_out).toLocaleString('en-IN')}`;

        // Send to all contacts with telegram_chat_id
        const tgRecipients = recipients.filter((c) => c.telegram_chat_id);
        await Promise.all(tgRecipients.map((c) =>
          sendTelegram({ chatId: c.telegram_chat_id, text: telegramText })
        ));
      }
    }

    // Return file if not delivered (or always return for download)
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(fileBuffer);

  } catch (err) {
    console.error('Report generate error:', err.message);
    res.status(500).json({ success: false, message: 'Report generation failed' });
  }
});

module.exports = router;
