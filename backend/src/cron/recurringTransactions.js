const supabaseAdmin = require('@/config/supabaseAdmin');
const { sendEmail, sendTelegram, fmt } = require('@/services/notify');
const { safeErrorMessage } = require('@/lib/security');
const { logActivity } = require('@/lib/logger');

function computeNextRun(frequency, scheduleDay, scheduleHour, scheduleMinute) {
  const now = new Date();
  let next = new Date(now);
  const h = scheduleHour || 8;
  const m = scheduleMinute || 0;

  switch (frequency) {
    case 'daily': {
      next.setUTCHours(h, m, 0, 0);
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
      return next.toISOString();
    }
    case 'weekly': {
      const targetDay = scheduleDay ?? 1;
      next.setUTCHours(h, m, 0, 0);
      const cur = next.getUTCDay();
      let ahead = targetDay - cur;
      if (ahead < 0) ahead += 7;
      if (ahead === 0 && next <= now) ahead = 7;
      next.setUTCDate(next.getUTCDate() + ahead);
      return next.toISOString();
    }
    case 'biweekly': {
      const targetDay = scheduleDay ?? 1;
      next.setUTCHours(h, m, 0, 0);
      const cur2 = next.getUTCDay();
      let ahead2 = targetDay - cur2;
      if (ahead2 < 0) ahead2 += 7;
      if (ahead2 === 0 && next <= now) ahead2 = 14;
      next.setUTCDate(next.getUTCDate() + ahead2);
      return next.toISOString();
    }
    case 'monthly': {
      const targetDay = scheduleDay ?? 1;
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
    case 'quarterly': {
      const targetDay = scheduleDay ?? 1;
      const quarterStarts = [1, 4, 7, 10];
      next.setUTCHours(h, m, 0, 0);
      const nowMonth = next.getUTCMonth();
      let targetMonth = quarterStarts.find(mo => mo - 1 > nowMonth);
      if (!targetMonth) {
        targetMonth = quarterStarts[0];
        next.setUTCFullYear(next.getUTCFullYear() + 1);
      }
      next.setUTCMonth(targetMonth - 1);
      next.setUTCDate(1);
      const maxDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
      next.setUTCDate(Math.min(targetDay, maxDay));
      if (next <= now) {
        next.setUTCMonth(next.getUTCMonth() + 3);
        const maxDay2 = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
        next.setUTCDate(Math.min(targetDay, maxDay2));
      }
      return next.toISOString();
    }
    case 'yearly': {
      const targetDay = scheduleDay ?? 1;
      next.setUTCMonth(0);
      next.setUTCDate(1);
      next.setUTCHours(h, m, 0, 0);
      const maxDay = new Date(Date.UTC(next.getUTCFullYear(), 1, 0)).getUTCDate();
      next.setUTCDate(Math.min(targetDay, maxDay));
      if (next <= now) {
        next.setUTCFullYear(next.getUTCFullYear() + 1);
        const maxDay2 = new Date(Date.UTC(next.getUTCFullYear(), 1, 0)).getUTCDate();
        next.setUTCDate(Math.min(targetDay, maxDay2));
      }
      return next.toISOString();
    }
    default:
      return null;
  }
}

async function generateTransaction(template) {
  const insertData = {
    type: template.type,
    mode: template.mode,
    digital_method: template.mode === 'digital' ? template.digital_method : null,
    amount: template.amount,
    currency: template.currency || 'INR',
    category_id: template.category_id,
    party: template.party,
    description: template.description,
    reference_no: template.reference_no,
    txn_date: new Date().toISOString().slice(0, 10),
    notify_contact_ids: template.notify_contact_ids || [],
    is_recurring: true,
    recurring_id: template.id,
    created_by: template.created_by,
  };

  if (template.mode === 'cash') {
    insertData.voucher_filed = false;
  }

  const { data: txn, error } = await supabaseAdmin
    .from('transactions')
    .insert(insertData)
    .select()
    .single();

  if (error) throw error;

  const newCount = template.occurrence_count + 1;
  const reachedLimit = template.max_occurrences && newCount >= template.max_occurrences;

  const updates = {
    occurrence_count: newCount,
    last_run_at: new Date().toISOString(),
    last_txn_id: txn.id,
    updated_at: new Date().toISOString(),
  };

  if (reachedLimit) {
    updates.enabled = false;
    updates.next_run_at = null;
  } else {
    updates.next_run_at = computeNextRun(template.frequency, template.schedule_day, template.schedule_hour, template.schedule_minute);
  }

  await supabaseAdmin.from('recurring_transactions').update(updates).eq('id', template.id);

  setImmediate(async () => {
    const notifyIds = template.notify_contact_ids || [];
    if (notifyIds.length > 0) {
      try {
        const { data: contacts } = await supabaseAdmin
          .from('contacts').select('*').in('id', notifyIds).eq('enabled', true);
        const { notifyContactsOfTransaction } = require('@/services/notify');
        await notifyContactsOfTransaction(txn, contacts || []);
      } catch (err) {
        console.error('Recurring notification error:', err.message);
      }
    }
  });

  return txn;
}

async function processDueRecurring() {
  const now = new Date().toISOString();
  const { data: dueTemplates } = await supabaseAdmin
    .from('recurring_transactions')
    .select('*')
    .eq('enabled', true)
    .lte('next_run_at', now);

  if (!dueTemplates || dueTemplates.length === 0) return;

  for (const template of dueTemplates) {
    console.log(`🔄 Processing recurring: ${template.name}`);
    try {
      const txn = await generateTransaction(template);
      logActivity({
        userId: template.created_by,
        action: 'generate',
        entity: 'recurring_transaction',
        entityId: template.id,
        details: { name: template.name, generated_txn_id: txn.id, amount: template.amount, frequency: template.frequency, source: 'cron' },
      });
      console.log(`✅ Generated transaction for "${template.name}" (${fmt(template.amount)})`);
    } catch (err) {
      console.error(`❌ Failed generating for "${template.name}":`, safeErrorMessage(err));
      const nextRun = computeNextRun(template.frequency, template.schedule_day, template.schedule_hour, template.schedule_minute);
      await supabaseAdmin.from('recurring_transactions').update({
        next_run_at: nextRun,
        updated_at: new Date().toISOString(),
      }).eq('id', template.id);
    }
  }
}

function startRecurringTransactionsCron() {
  const cron = require('node-cron');
  cron.schedule('*/5 * * * *', () => {
    processDueRecurring().catch((err) => console.error('Recurring transactions cron error:', err.message));
  });
  console.log('🔄 Recurring transactions cron started (every 5 minutes)');
}

module.exports = { startRecurringTransactionsCron, computeNextRun, generateTransaction, processDueRecurring };
