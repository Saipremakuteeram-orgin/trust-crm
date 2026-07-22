const supabaseAdmin = require('@/config/supabaseAdmin');
const { sendEmail, sendTelegram, fmt } = require('@/services/notify');
const { safeErrorMessage } = require('@/lib/security');

function computeNextRun(schedule) {
  const now = new Date();
  let next = new Date(now);
  const h = schedule.schedule_hour || 8;
  const m = schedule.schedule_minute || 0;

  switch (schedule.schedule_type) {
    case 'once': {
      if (schedule.filter_from) {
        next = new Date(`${schedule.filter_from}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
        if (next <= now) return null;
        return next.toISOString();
      }
      return null;
    }
    case 'daily': {
      next.setUTCHours(h, m, 0, 0);
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
      return next.toISOString();
    }
    case 'weekly': {
      const targetDay = schedule.schedule_day ?? 1;
      next.setUTCHours(h, m, 0, 0);
      const cur = next.getUTCDay();
      let ahead = targetDay - cur;
      if (ahead < 0) ahead += 7;
      if (ahead === 0 && next <= now) ahead = 7;
      next.setUTCDate(next.getUTCDate() + ahead);
      return next.toISOString();
    }
    case 'biweekly': {
      const targetDay = schedule.schedule_day ?? 1;
      next.setUTCHours(h, m, 0, 0);
      const cur2 = next.getUTCDay();
      let ahead2 = targetDay - cur2;
      if (ahead2 < 0) ahead2 += 7;
      if (ahead2 === 0 && next <= now) ahead2 = 14;
      if (schedule.last_run_at) {
        const lastRun = new Date(schedule.last_run_at);
        const diffDays = Math.floor((next - lastRun) / 86400000);
        if (diffDays < 7) ahead2 += 7 - diffDays;
      }
      next.setUTCDate(next.getUTCDate() + ahead2);
      return next.toISOString();
    }
    case 'monthly': {
      const targetDay = schedule.schedule_day ?? 1;
      next.setUTCHours(h, m, 0, 0);
      next.setUTCDate(1);
      if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1);
      const maxDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
      next.setUTCDate(Math.min(targetDay, maxDay));
      if (next <= now) {
        next.setUTCMonth(next.getUTCMonth() + 1);
        const maxDay2 = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
        next.setUTCDate(Math.min(targetDay, maxDay2));
      }
      return next.toISOString();
    }
    default:
      return null;
  }
}

function computeDateRange(schedule) {
  const now = new Date();
  const h = schedule.schedule_hour || 8;

  if (schedule.schedule_type === 'once' && schedule.filter_from && schedule.filter_to) {
    return { start: schedule.filter_from, end: schedule.filter_to };
  }

  const end = new Date(now);
  end.setUTCHours(h, 0, 0, 0);
  if (end > now) end.setUTCDate(end.getUTCDate() - 1);
  const endStr = end.toISOString().slice(0, 10);

  const start = new Date(end);
  switch (schedule.schedule_type) {
    case 'daily': break;
    case 'weekly':
    case 'biweekly':
      start.setUTCDate(start.getUTCDate() - 6);
      break;
    case 'monthly':
      start.setUTCDate(start.getUTCDate() - 29);
      break;
    default:
      start.setUTCDate(start.getUTCDate() - 6);
  }
  return { start: start.toISOString().slice(0, 10), end: endStr };
}

async function fetchFilteredTransactions(schedule) {
  const { start, end } = computeDateRange(schedule);
  let query = supabaseAdmin
    .from('transactions')
    .select('*, categories(name)')
    .gte('txn_date', start)
    .lte('txn_date', end)
    .order('txn_date', { ascending: false });

  if (schedule.filter_type && schedule.filter_type.length > 0) query = query.in('type', schedule.filter_type);
  if (schedule.filter_mode && schedule.filter_mode.length > 0) query = query.in('mode', schedule.filter_mode);
  if (schedule.filter_categories && schedule.filter_categories.length > 0) {
    query = query.in('category_id', schedule.filter_categories);
  }

  const { data, error } = await query;
  if (error) throw error;
  return { txns: data || [], start, end };
}

async function resolveRecipients(schedule) {
  if (schedule.recipient_mode === 'selected' && schedule.recipient_contact_ids?.length > 0) {
    const { data } = await supabaseAdmin
      .from('contacts').select('id, name, email, telegram_chat_id, enabled')
      .in('id', schedule.recipient_contact_ids).eq('enabled', true);
    return data || [];
  }
  const { data } = await supabaseAdmin
    .from('contacts').select('id, name, email, telegram_chat_id, enabled')
    .eq('enabled', true).eq('subscribe_monthly_report', true);
  return data || [];
}

function buildSummaryHtml(schedule, txns, start, end) {
  const tc = txns.filter((t) => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
  const td = txns.filter((t) => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
  const ci = txns.filter((t) => t.type === 'credit' && t.mode === 'cash').reduce((s, t) => s + Number(t.amount), 0);
  const co = txns.filter((t) => t.type === 'debit' && t.mode === 'cash').reduce((s, t) => s + Number(t.amount), 0);
  const di = txns.filter((t) => t.type === 'credit' && t.mode === 'digital').reduce((s, t) => s + Number(t.amount), 0);
  const dout = txns.filter((t) => t.type === 'debit' && t.mode === 'digital').reduce((s, t) => s + Number(t.amount), 0);
  return `<div style="font-family:sans-serif;font-size:14px;color:#333"><h2>📊 ${schedule.name}</h2><p style="color:#666">Period: ${start} to ${end}</p><table cellpadding="6" style="border-collapse:collapse;width:100%;max-width:480px"><tr><td>Credit (In)</td><td style="text-align:right;color:#059669">${fmt(tc)}</td></tr><tr><td>Debit (Out)</td><td style="text-align:right;color:#dc2626">${fmt(td)}</td></tr><tr><td><b>Net</b></td><td style="text-align:right"><b>${fmt(tc - td)}</b></td></tr><tr><td colspan="2"><hr/></td></tr><tr><td>Cash In/Out</td><td style="text-align:right">${fmt(ci)} / ${fmt(co)}</td></tr><tr><td>Digital In/Out</td><td style="text-align:right">${fmt(di)} / ${fmt(dout)}</td></tr><tr><td colspan="2"><hr/></td></tr><tr><td>Transactions</td><td style="text-align:right">${txns.length}</td></tr></table></div>`;
}

function buildSummaryText(schedule, txns, start, end) {
  const tc = txns.filter((t) => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
  const td = txns.filter((t) => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
  return `📊 <b>${schedule.name}</b>\nPeriod: ${start} to ${end}\n\nCredit: <b>${fmt(tc)}</b> | Debit: <b>${fmt(td)}</b>\nNet: <b>${fmt(tc - td)}</b>\nTransactions: ${txns.length}`;
}

async function executeReport(schedule) {
  const { txns, start, end } = await fetchFilteredTransactions(schedule);
  const recipients = await resolveRecipients(schedule);
  const { buildWorkbook } = require('@/routes/exports');
  let sentCount = 0, failedCount = 0;
  const errors = [];

  for (const c of recipients) {
    try {
      if (schedule.delivery_email && c.email) {
        if (schedule.format === 'summary') {
          await sendEmail({ to: c.email, subject: `📊 ${schedule.name} (${start} to ${end})`, html: buildSummaryHtml(schedule, txns, start, end) });
        } else {
          const { data: profile } = await supabaseAdmin.from('profiles').select('full_name').eq('id', schedule.created_by).single();
          const safeName = schedule.name.replace(/[^a-zA-Z0-9-]/g, '_');
          if (schedule.format === 'excel') {
            const workbook = buildWorkbook(txns, profile);
            const buffer = await workbook.xlsx.writeBuffer();
            await sendEmail({
              to: c.email, subject: `📊 ${schedule.name} (${start} to ${end})`,
              html: `<div style="font-family:sans-serif;font-size:14px"><p>${schedule.name} report — ${txns.length} transactions</p></div>`,
              attachments: [{ filename: `${safeName}-${start}-to-${end}.xlsx`, content: Buffer.from(buffer) }],
            });
          } else if (schedule.format === 'pdf') {
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
            const chunks = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            const pdfBuffer = await new Promise((resolve) => {
              doc.on('end', () => resolve(Buffer.concat(chunks)));
              doc.fontSize(18).font('Helvetica-Bold').text('Trust CRM', 40, 40);
              doc.fontSize(11).font('Helvetica').text(`${schedule.name} — ${start} to ${end}`, 40, 60);
              doc.moveTo(40, 80).lineTo(815, 80).strokeColor('#e5e7eb').stroke();
              let tCredit = 0, tDebit = 0;
              const hdrs = ['Date', 'Type', 'Mode', 'Amount', 'Party', 'Category', 'Notes'];
              const cw = [80, 60, 60, 100, 140, 120, 215];
              let hy = 90;
              doc.font('Helvetica-Bold').fontSize(7).fillColor('#4338ca');
              doc.rect(40, hy, 775, 18).fill('#4338ca');
              let x = 40;
              hdrs.forEach((h, i) => { doc.fillColor('#fff').text(h, x + 3, hy + 5, { width: cw[i] }); x += cw[i]; });
              let ry = hy + 22;
              doc.font('Helvetica').fontSize(7);
              txns.forEach((t, idx) => {
                if (ry > 560) { doc.addPage(); ry = 30; }
                const amt = parseFloat(t.amount) || 0;
                if (t.type === 'credit') tCredit += amt; else tDebit += amt;
                if (idx % 2 === 0) doc.rect(40, ry - 2, 775, 16).fill('#f9fafb');
                x = 40;
                const vals = [t.txn_date, t.type?.toUpperCase(), t.mode, `₹${amt.toLocaleString('en-IN')}`, t.party || '-', t.categories?.name || '-', t.description || '-'];
                vals.forEach((v, i) => { doc.fillColor('#1f2937').text(String(v).substring(0, 35), x + 3, ry, { width: cw[i] }); x += cw[i]; });
                ry += 16;
              });
              ry += 8;
              doc.font('Helvetica-Bold').fontSize(8).fillColor('#1f2937');
              doc.text(`Credit: ₹${tCredit.toLocaleString('en-IN')}`, 40, ry);
              doc.text(`Debit: ₹${tDebit.toLocaleString('en-IN')}`, 300, ry);
              doc.text(`Net: ₹${(tCredit - tDebit).toLocaleString('en-IN')}`, 530, ry);
              doc.end();
            });
            await sendEmail({
              to: c.email, subject: `📊 ${schedule.name} (${start} to ${end})`,
              html: `<div style="font-family:sans-serif;font-size:14px"><p>${schedule.name} report — ${txns.length} transactions</p></div>`,
              attachments: [{ filename: `${safeName}-${start}-to-${end}.pdf`, content: pdfBuffer }],
            });
          }
        }
        sentCount++;
      }
      if (schedule.delivery_telegram && c.telegram_chat_id) {
        await sendTelegram({ chatId: c.telegram_chat_id, text: buildSummaryText(schedule, txns, start, end) });
        sentCount++;
      }
    } catch (err) {
      failedCount++;
      errors.push(`${c.name}: ${safeErrorMessage(err)}`);
    }
  }

  return { txns, start, end, sentCount, failedCount, recipientCount: recipients.length, errors };
}

async function processDueReports() {
  const now = new Date().toISOString();
  const { data: dueReports } = await supabaseAdmin
    .from('scheduled_reports')
    .select('*')
    .eq('enabled', true)
    .lte('next_run_at', now);

  if (!dueReports || dueReports.length === 0) return;

  for (const schedule of dueReports) {
    console.log(`📤 Running scheduled report: ${schedule.name}`);
    try {
      const result = await executeReport(schedule);
      const nextRun = schedule.schedule_type === 'once' ? null : computeNextRun(schedule);
      await supabaseAdmin.from('scheduled_reports').update({
        last_run_at: new Date().toISOString(),
        last_status: result.failedCount === 0 ? 'success' : 'partial',
        last_error: result.errors.length > 0 ? result.errors.join('; ') : null,
        next_run_at: nextRun,
        enabled: schedule.schedule_type === 'once' ? false : true,
        updated_at: new Date().toISOString(),
      }).eq('id', schedule.id);
      console.log(`✅ Scheduled report "${schedule.name}" sent to ${result.sentCount} recipient(s)`);
    } catch (err) {
      console.error(`❌ Scheduled report "${schedule.name}" failed:`, safeErrorMessage(err));
      const nextRun = computeNextRun(schedule);
      await supabaseAdmin.from('scheduled_reports').update({
        last_run_at: new Date().toISOString(),
        last_status: 'failed',
        last_error: safeErrorMessage(err),
        next_run_at: nextRun,
        updated_at: new Date().toISOString(),
      }).eq('id', schedule.id);
    }
  }
}

function startScheduledReportsCron() {
  const cron = require('node-cron');
  cron.schedule('*/5 * * * *', () => {
    processDueReports().catch((err) => console.error('Scheduled reports cron error:', err.message));
  });
  console.log('🕐 Scheduled reports cron started (every 5 minutes)');
}

module.exports = { startScheduledReportsCron, executeReport, computeNextRun, computeDateRange, fetchFilteredTransactions, resolveRecipients };
