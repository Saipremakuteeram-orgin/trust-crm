const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { safeErrorMessage } = require('@/lib/security');
const { computeNextRun, generateTransaction } = require('@/cron/recurringTransactions');

router.use(requireAuth);
router.use(requireRole('admin', 'accountant'));

const VALID_TYPES = ['credit', 'debit'];
const VALID_MODES = ['cash', 'digital'];
const VALID_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];
const MAX_AMOUNT = 100000000;
const MAX_FIELD_LEN = 2000;

// LIST
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('recurring_transactions')
      .select('*, categories(name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.set('Cache-Control', 'private, max-age=10');
    res.json({ success: true, result: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch recurring transactions' });
  }
});

// CREATE
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    if (!body.name || !body.name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    if (!body.amount || typeof body.amount !== 'number' || body.amount <= 0 || body.amount > MAX_AMOUNT) {
      return res.status(400).json({ success: false, message: 'Amount must be a positive number up to 10 crore' });
    }
    if (!body.type || !VALID_TYPES.includes(body.type)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing type' });
    }
    if (!body.mode || !VALID_MODES.includes(body.mode)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing mode' });
    }
    if (!body.frequency || !VALID_FREQUENCIES.includes(body.frequency)) {
      return res.status(400).json({ success: false, message: 'Invalid frequency' });
    }
    if (!body.start_date || !/^\d{4}-\d{2}-\d{2}/.test(body.start_date)) {
      return res.status(400).json({ success: false, message: 'Valid start_date is required (YYYY-MM-DD)' });
    }
    if (['weekly', 'biweekly'].includes(body.frequency)) {
      if (body.schedule_day === undefined || body.schedule_day < 0 || body.schedule_day > 6) {
        return res.status(400).json({ success: false, message: 'schedule_day must be 0-6 for weekly/biweekly' });
      }
    } else if (body.frequency !== 'daily') {
      if (body.schedule_day === undefined || body.schedule_day < 1 || body.schedule_day > 31) {
        return res.status(400).json({ success: false, message: 'schedule_day must be 1-31 for monthly/quarterly/yearly' });
      }
    }

    const insertData = {
      name: body.name.trim(),
      type: body.type,
      mode: body.mode,
      amount: body.amount,
      party: String(body.party || '').slice(0, MAX_FIELD_LEN),
      description: String(body.description || '').slice(0, MAX_FIELD_LEN),
      reference_no: String(body.reference_no || '').slice(0, MAX_FIELD_LEN),
      category_id: body.category_id || null,
      digital_method: body.mode === 'digital' ? (body.digital_method || 'upi') : null,
      notify_contact_ids: body.notify_contact_ids || [],
      frequency: body.frequency,
      schedule_day: body.frequency === 'daily' ? null : (body.schedule_day ?? null),
      schedule_hour: body.schedule_hour ?? 8,
      schedule_minute: body.schedule_minute ?? 0,
      start_date: body.start_date,
      end_date: body.end_date || null,
      max_occurrences: body.max_occurrences || null,
      enabled: body.enabled !== false,
      created_by: req.user.id,
    };

    insertData.next_run_at = computeNextRun(insertData.frequency, insertData.schedule_day, insertData.schedule_hour, insertData.schedule_minute);

    const { data, error } = await supabaseAdmin
      .from('recurring_transactions')
      .insert(insertData)
      .select('*, categories(name)')
      .single();
    if (error) throw error;

    logActivity({
      userId: req.user.id, userEmail: req.user.email,
      action: 'create', entity: 'recurring_transaction', entityId: data.id,
      details: { name: data.name, frequency: data.frequency, amount: data.amount, type: data.type },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: data });
  } catch (err) {
    console.error('Create recurring transaction error:', safeErrorMessage(err));
    res.status(500).json({ success: false, message: 'Failed to create recurring transaction' });
  }
});

// UPDATE
router.patch('/:id', async (req, res) => {
  try {
    const allowed = [
      'name', 'type', 'mode', 'amount', 'category_id', 'description', 'party',
      'reference_no', 'digital_method', 'notify_contact_ids',
      'frequency', 'schedule_day', 'schedule_hour', 'schedule_minute',
      'start_date', 'end_date', 'max_occurrences', 'enabled',
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    if (updates.frequency && !VALID_FREQUENCIES.includes(updates.frequency)) {
      return res.status(400).json({ success: false, message: 'Invalid frequency' });
    }
    if (updates.amount !== undefined && (typeof updates.amount !== 'number' || updates.amount <= 0)) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const { data: existing } = await supabaseAdmin
      .from('recurring_transactions').select('*').eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });

    const merged = { ...existing, ...updates };
    updates.next_run_at = computeNextRun(merged.frequency, merged.schedule_day, merged.schedule_hour, merged.schedule_minute);
    updates.updated_at = new Date().toISOString();

    if (updates.mode === 'cash') updates.digital_method = null;

    const { data, error } = await supabaseAdmin
      .from('recurring_transactions').update(updates).eq('id', req.params.id)
      .select('*, categories(name)').single();
    if (error) throw error;

    logActivity({
      userId: req.user.id, userEmail: req.user.email,
      action: 'update', entity: 'recurring_transaction', entityId: req.params.id,
      details: { name: data.name },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update' });
  }
});

// DELETE
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { data: template } = await supabaseAdmin
      .from('recurring_transactions').select('name').eq('id', req.params.id).single();

    const { error } = await supabaseAdmin.from('recurring_transactions').delete().eq('id', req.params.id);
    if (error) throw error;

    logActivity({
      userId: req.user.id, userEmail: req.user.email,
      action: 'delete', entity: 'recurring_transaction', entityId: req.params.id,
      details: { name: template?.name },
      ipAddress: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete' });
  }
});

// TOGGLE
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { data: existing } = await supabaseAdmin
      .from('recurring_transactions')
      .select('id, enabled, frequency, schedule_day, schedule_hour, schedule_minute')
      .eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });

    const newEnabled = !existing.enabled;
    const updates = { enabled: newEnabled, updated_at: new Date().toISOString() };

    if (newEnabled) {
      updates.next_run_at = computeNextRun(existing.frequency, existing.schedule_day, existing.schedule_hour, existing.schedule_minute);
    } else {
      updates.next_run_at = null;
    }

    const { data, error } = await supabaseAdmin
      .from('recurring_transactions').update(updates).eq('id', req.params.id)
      .select().single();
    if (error) throw error;

    logActivity({
      userId: req.user.id, userEmail: req.user.email,
      action: newEnabled ? 'enable' : 'disable',
      entity: 'recurring_transaction', entityId: req.params.id,
      details: { enabled: newEnabled },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to toggle' });
  }
});

// RUN NOW
router.post('/:id/run-now', async (req, res) => {
  try {
    const { data: template } = await supabaseAdmin
      .from('recurring_transactions').select('*').eq('id', req.params.id).single();
    if (!template) return res.status(404).json({ success: false, message: 'Not found' });

    const txn = await generateTransaction(template);

    logActivity({
      userId: req.user.id, userEmail: req.user.email,
      action: 'run_now', entity: 'recurring_transaction', entityId: req.params.id,
      details: { name: template.name, generated_txn_id: txn.id, source: 'manual' },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: { transaction: txn } });
  } catch (err) {
    console.error('Run-now error:', safeErrorMessage(err));
    res.status(500).json({ success: false, message: 'Failed to generate transaction' });
  }
});

module.exports = router;
