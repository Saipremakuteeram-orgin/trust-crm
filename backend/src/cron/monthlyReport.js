const cron = require('node-cron');
const supabaseAdmin = require('@/config/supabaseAdmin');
const { sendEmail, sendTelegram, fmt } = require('@/services/notify');
const { logActivity } = require('@/lib/logger');
const { reportHeaderHtml, purposeFor, TRUST_NAME } = require('@/lib/reportBranding');

async function generateAndSendMonthlyReport() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthLabel = start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const { data: txns, error } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .gte('txn_date', start.toISOString().slice(0, 10))
    .lt('txn_date', end.toISOString().slice(0, 10));

  if (error) {
    console.error('Monthly report query failed:', error.message);
    return;
  }

  const totalCredit = txns.filter((t) => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
  const totalDebit = txns.filter((t) => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
  const cashCredit = txns.filter((t) => t.type === 'credit' && t.mode === 'cash').reduce((s, t) => s + Number(t.amount), 0);
  const cashDebit = txns.filter((t) => t.type === 'debit' && t.mode === 'cash').reduce((s, t) => s + Number(t.amount), 0);
  const digitalCredit = txns.filter((t) => t.type === 'credit' && t.mode === 'digital').reduce((s, t) => s + Number(t.amount), 0);
  const digitalDebit = txns.filter((t) => t.type === 'debit' && t.mode === 'digital').reduce((s, t) => s + Number(t.amount), 0);
  const net = totalCredit - totalDebit;

  const subject = `📊 Monthly Trust Report — ${monthLabel}`;
  const html =
    reportHeaderHtml({ title: `Monthly Report — ${monthLabel}`, purposeKey: 'monthly' }) +
    `<div style="font-family:sans-serif;font-size:14px;color:#333">
      <table cellpadding="6" style="border-collapse:collapse;width:100%;max-width:480px">
        <tr><td>Total Credit (In)</td><td style="text-align:right;color:#059669">${fmt(totalCredit)}</td></tr>
        <tr><td>Total Debit (Out)</td><td style="text-align:right;color:#dc2626">${fmt(totalDebit)}</td></tr>
        <tr><td><b>Net</b></td><td style="text-align:right"><b>${fmt(net)}</b></td></tr>
        <tr><td colspan="2"><hr/></td></tr>
        <tr><td>Cash In</td><td style="text-align:right">${fmt(cashCredit)}</td></tr>
        <tr><td>Cash Out</td><td style="text-align:right">${fmt(cashDebit)}</td></tr>
        <tr><td>Digital In</td><td style="text-align:right">${fmt(digitalCredit)}</td></tr>
        <tr><td>Digital Out</td><td style="text-align:right">${fmt(digitalDebit)}</td></tr>
        <tr><td colspan="2"><hr/></td></tr>
        <tr><td>Total Transactions</td><td style="text-align:right">${txns.length}</td></tr>
      </table>
    </div>`;
  const telegramText =
    `📊 <b>${TRUST_NAME}</b>\nMonthly Report — ${monthLabel}\n\n` +
    `<b>Purpose:</b> ${purposeFor('monthly')}\n\n` +
    `Total Credit: <b>${fmt(totalCredit)}</b>\nTotal Debit: <b>${fmt(totalDebit)}</b>\nNet: <b>${fmt(net)}</b>\n\n` +
    `Cash In/Out: ${fmt(cashCredit)} / ${fmt(cashDebit)}\nDigital In/Out: ${fmt(digitalCredit)} / ${fmt(digitalDebit)}\n\n` +
    `Total Transactions: ${txns.length}`;

  const { data: recipients } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('enabled', true)
    .eq('subscribe_monthly_report', true);

  for (const c of recipients || []) {
    if (c.email) await sendEmail({ to: c.email, subject, html });
    if (c.telegram_chat_id) await sendTelegram({ chatId: c.telegram_chat_id, text: telegramText });
  }

  console.log(`✅ Monthly report for ${monthLabel} sent to ${(recipients || []).length} recipient(s)`);
  logActivity({ action: 'send_now', entity: 'scheduled_report', details: { name: `Monthly Report — ${monthLabel}`, recipientCount: (recipients || []).length, totalCredit, totalDebit, source: 'monthly_cron' } });
}

function startMonthlyReportCron() {
  cron.schedule('0 8 1 * *', () => {
    generateAndSendMonthlyReport().catch((err) => console.error('Monthly report cron failed:', err.message));
  });
  console.log('🕐 Monthly report cron scheduled (1st of month, 08:00)');
}

module.exports = { startMonthlyReportCron, generateAndSendMonthlyReport };
