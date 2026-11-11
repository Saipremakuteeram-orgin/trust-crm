const cron = require('node-cron');
const supabaseAdmin = require('@/config/supabaseAdmin');

async function runComplianceAlerts() {
  try {
    const today = new Date();
    const in7 = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const { data: items } = await supabaseAdmin.from('compliance_items').select('id, name, due_date').lte('due_date', in7).gte('due_date', today.toISOString().slice(0, 10));
    if (!items || items.length === 0) return;
    const { data: users } = await supabaseAdmin.from('profiles').select('id').in('role', ['admin', 'accountant']);
    // The cron runs daily over a rolling 7-day window, so skip alerts already
    // created in the last 20 hours to avoid one duplicate per day per item.
    const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabaseAdmin
      .from('notifications')
      .select('user_id, title')
      .eq('type', 'compliance_due')
      .gte('created_at', since);
    const alreadySent = new Set((existing || []).map((n) => `${n.user_id}|${n.title}`));
    const rows = [];
    for (const u of (users || [])) {
      for (const it of items) {
        const title = `Compliance due: ${it.name}`;
        if (alreadySent.has(`${u.id}|${title}`)) continue;
        alreadySent.add(`${u.id}|${title}`);
        rows.push({ user_id: u.id, type: 'compliance_due', title, body: `Due ${it.due_date}`, link: '/compliance' });
      }
    }
    if (rows.length) await supabaseAdmin.from('notifications').insert(rows);
  } catch (err) {
    console.error('Compliance alerts cron failed:', err.message);
  }
}

function startComplianceAlertsCron() {
  cron.schedule('0 8 * * *', () => { runComplianceAlerts(); }, { timezone: 'Asia/Kolkata' });
  console.log('🕐 Compliance alerts cron scheduled (08:00 IST)');
}

module.exports = { startComplianceAlertsCron, runComplianceAlerts };
