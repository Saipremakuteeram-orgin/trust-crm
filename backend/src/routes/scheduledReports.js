const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { safeErrorMessage } = require('@/lib/security');
const { executeReport, computeNextRun, fetchFilteredTransactions, resolveRecipients } = require('@/cron/scheduledReports');

router.use(requireAuth);
router.use(requireRole('admin', 'accountant'));

// GET /api/scheduled-reports
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('scheduled_reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, result: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch scheduled reports' });
  }
});

// POST /api/scheduled-reports
router.post('/', async (req, res) => {
  try {
    const {
      name, filter_type, filter_mode, filter_categories, filter_from, filter_to,
      schedule_type, schedule_day, schedule_hour, schedule_minute,
      format, delivery_email, delivery_telegram, recipient_mode, recipient_contact_ids,
    } = req.body;

    if (!name || !schedule_type || !format) {
      return res.status(400).json({ success: false, message: 'name, schedule_type, and format are required' });
    }

    const schedule = {
      name,
      created_by: req.user.id,
      filter_type: filter_type || null,
      filter_mode: filter_mode || null,
      filter_categories: filter_categories || null,
      filter_from: filter_from || null,
      filter_to: filter_to || null,
      schedule_type,
      schedule_day: schedule_day ?? null,
      schedule_hour: schedule_hour ?? 8,
      schedule_minute: schedule_minute ?? 0,
      format,
      delivery_email: delivery_email !== false,
      delivery_telegram: delivery_telegram === true,
      recipient_mode: recipient_mode || 'subscribed',
      recipient_contact_ids: recipient_contact_ids || null,
      enabled: true,
    };

    schedule.next_run_at = computeNextRun(schedule);

    const { data, error } = await supabaseAdmin.from('scheduled_reports').insert(schedule).select().single();
    if (error) throw error;

    logActivity({ userId: req.user.id, userEmail: req.user.email, action: 'create', entity: 'scheduled_report', details: { name, schedule_type, format }, ipAddress: req.ip });

    res.json({ success: true, result: data });
  } catch (err) {
    console.error('Create scheduled report error:', safeErrorMessage(err));
    res.status(500).json({ success: false, message: 'Failed to create scheduled report' });
  }
});

// PUT /api/scheduled-reports/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    const fields = ['name', 'filter_type', 'filter_mode', 'filter_categories', 'filter_from', 'filter_to',
      'schedule_type', 'schedule_day', 'schedule_hour', 'schedule_minute',
      'format', 'delivery_email', 'delivery_telegram', 'recipient_mode', 'recipient_contact_ids', 'enabled'];
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    updates.updated_at = new Date().toISOString();
    const existing = await supabaseAdmin.from('scheduled_reports').select('*').eq('id', id).single();
    const merged = { ...existing.data, ...updates };
    updates.next_run_at = computeNextRun(merged);

    const { data, error } = await supabaseAdmin.from('scheduled_reports').update(updates).eq('id', id).select().single();
    if (error) throw error;

    logActivity({ userId: req.user.id, userEmail: req.user.email, action: 'update', entity: 'scheduled_report', details: { id }, ipAddress: req.ip });

    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update scheduled report' });
  }
});

// DELETE /api/scheduled-reports/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('scheduled_reports').delete().eq('id', id);
    if (error) throw error;

    logActivity({ userId: req.user.id, userEmail: req.user.email, action: 'delete', entity: 'scheduled_report', details: { id }, ipAddress: req.ip });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete scheduled report' });
  }
});

// POST /api/scheduled-reports/:id/preview
router.post('/:id/preview', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: schedule } = await supabaseAdmin.from('scheduled_reports').select('*').eq('id', id).single();
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });

    const { txns, start, end } = await fetchFilteredTransactions(schedule);
    const tc = txns.filter((t) => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
    const td = txns.filter((t) => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
    const ci = txns.filter((t) => t.type === 'credit' && t.mode === 'cash').reduce((s, t) => s + Number(t.amount), 0);
    const co = txns.filter((t) => t.type === 'debit' && t.mode === 'cash').reduce((s, t) => s + Number(t.amount), 0);
    const di = txns.filter((t) => t.type === 'credit' && t.mode === 'digital').reduce((s, t) => s + Number(t.amount), 0);
    const dout = txns.filter((t) => t.type === 'debit' && t.mode === 'digital').reduce((s, t) => s + Number(t.amount), 0);
    const recipients = await resolveRecipients(schedule);

    res.json({
      success: true,
      result: {
        period: { start, end },
        count: txns.length,
        summary: { totalCredit: tc, totalDebit: td, net: tc - td, cashIn: ci, cashOut: co, digitalIn: di, digitalOut: dout },
        sample: txns.slice(0, 10),
        recipientCount: recipients.length,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Preview failed' });
  }
});

// POST /api/scheduled-reports/:id/send-now
router.post('/:id/send-now', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: schedule } = await supabaseAdmin.from('scheduled_reports').select('*').eq('id', id).single();
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });

    const result = await executeReport(schedule);

    await supabaseAdmin.from('scheduled_reports').update({
      last_run_at: new Date().toISOString(),
      last_status: result.failedCount === 0 ? 'success' : 'partial',
      last_error: result.errors.length > 0 ? result.errors.join('; ') : null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    logActivity({ userId: req.user.id, userEmail: req.user.email, action: 'send_now', entity: 'scheduled_report', details: { name: schedule.name, sent: result.sentCount, failed: result.failedCount }, ipAddress: req.ip });

    res.json({
      success: true,
      result: {
        transactions: result.txns.length,
        period: `${result.start} to ${result.end}`,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        recipientCount: result.recipientCount,
        errors: result.errors,
      },
    });
  } catch (err) {
    console.error('Send-now error:', safeErrorMessage(err));
    res.status(500).json({ success: false, message: 'Failed to send report' });
  }
});

module.exports = router;
