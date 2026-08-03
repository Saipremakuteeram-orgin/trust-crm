const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');

router.use(requireAuth);

const VALID_STATUSES = ['active', 'completed', 'archived'];
const MAX_AMOUNT = 100000000;

function validateBudget(body) {
  const total = body.budget_total !== undefined ? Number(body.budget_total) : 0;
  const cash = body.budget_cash !== undefined ? Number(body.budget_cash) : 0;
  const digital = body.budget_digital !== undefined ? Number(body.budget_digital) : 0;
  if (isNaN(total) || total < 0 || total > MAX_AMOUNT) return 'Invalid budget total';
  if (isNaN(cash) || cash < 0 || cash > MAX_AMOUNT) return 'Invalid cash budget';
  if (isNaN(digital) || digital < 0 || digital > MAX_AMOUNT) return 'Invalid digital budget';
  // Only enforce the sum rule when a real cash/digital split is provided.
  // A total-only budget (cash/digital both 0) is valid and tracked against total.
  if ((cash > 0 || digital > 0) && Math.abs(cash + digital - total) > 0.01) {
    return 'budget_cash + budget_digital must equal budget_total';
  }
  return null;
}

// LIST functions with budget summary
router.get('/', async (req, res) => {
  try {
    const statusFilter = req.query.status;
    let query = supabaseAdmin
      .from('v_function_budget_summary')
      .select('*')
      .order('created_at', { ascending: false });

    if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return res.json({ success: true, result: [] });
      }
      return res.status(400).json({ success: false, message: 'Failed to fetch functions' });
    }

    res.set('Cache-Control', 'private, max-age=30');
    res.json({ success: true, result: data });
  } catch (err) {
    console.error('Functions list error:', err.message);
    res.json({ success: true, result: [] });
  }
});

// GET single function with category breakdown and transactions
router.get('/:id', async (req, res) => {
  try {
    const { data: fn, error } = await supabaseAdmin
      .from('v_function_budget_summary')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !fn) return res.status(404).json({ success: false, message: 'Function not found' });

    const [{ data: categories }, { data: txns }] = await Promise.all([
      supabaseAdmin.from('v_function_category_budget').select('*').eq('function_id', req.params.id).order('budget_amount', { ascending: false }),
      supabaseAdmin.from('transactions').select('id, type, mode, amount, party, description, txn_date, category_id, categories(name), function_category_id, voucher_filed, notification_status, created_at')
        .eq('function_id', req.params.id)
        .order('txn_date', { ascending: false }),
    ]);

    res.set('Cache-Control', 'private, max-age=15');
    res.json({ success: true, result: { ...fn, categories: categories || [], transactions: txns || [] } });
  } catch (err) {
    console.error('Function detail error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch function' });
  }
});

// CREATE function
router.post('/', requireRole('admin', 'accountant'), async (req, res) => {
  const { name, description, budget_total, budget_cash, budget_digital, status } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Function name is required' });

  const validationErr = validateBudget(req.body);
  if (validationErr) return res.status(400).json({ success: false, message: validationErr });

  const total = Number(budget_total || 0);
  const cash = Number(budget_cash || 0);
  const digital = Number(budget_digital || 0);

  const insertData = {
    name: name.trim(),
    description: description || null,
    budget_total: total,
    budget_cash: cash,
    budget_digital: digital,
    status: status && VALID_STATUSES.includes(status) ? status : 'active',
    created_by: req.user.id,
  };

  const { data, error } = await supabaseAdmin.from('functions').insert(insertData).select().single();
  if (error) {
    if (error.message?.includes('does not exist') || error.code === '42P01') {
      return res.status(500).json({ success: false, message: 'Functions table not found. Run the migration SQL (backend/src/migrations/001_create_functions.sql) in Supabase SQL Editor first.' });
    }
    return res.status(400).json({ success: false, message: error.message });
  }

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    entity: 'function',
    entityId: data.id,
    details: { name: data.name, budget_total: data.budget_total },
    ipAddress: req.ip,
  });

  res.json({ success: true, result: data });
});

// UPDATE function
router.patch('/:id', requireRole('admin', 'accountant'), async (req, res) => {
  const { name, description, budget_total, budget_cash, budget_digital, status } = req.body;
  const updates = {};

  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ success: false, message: 'Name cannot be empty' });
    updates.name = name.trim();
  }
  if (description !== undefined) updates.description = description;

  const hasBudget = budget_total !== undefined || budget_cash !== undefined || budget_digital !== undefined;
  if (hasBudget) {
    const validationErr = validateBudget(req.body);
    if (validationErr) return res.status(400).json({ success: false, message: validationErr });
    if (budget_total !== undefined) updates.budget_total = Number(budget_total);
    if (budget_cash !== undefined) updates.budget_cash = Number(budget_cash);
    if (budget_digital !== undefined) updates.budget_digital = Number(budget_digital);
  }

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
    updates.status = status;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'No valid fields to update' });
  }

  const { data, error } = await supabaseAdmin
    .from('functions')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ success: false, message: error.message });

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    entity: 'function',
    entityId: req.params.id,
    details: updates,
    ipAddress: req.ip,
  });

  res.json({ success: true, result: data });
});

// CHANGE STATUS (convenience endpoint)
router.patch('/:id/status', requireRole('admin', 'accountant'), async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });

  const { data, error } = await supabaseAdmin
    .from('functions')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ success: false, message: error.message });

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    entity: 'function',
    entityId: req.params.id,
    details: { status },
    ipAddress: req.ip,
  });

  res.json({ success: true, result: data });
});

// DELETE function (admin only, only if no transactions linked)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { data: txnCount, error: countError } = await supabaseAdmin
    .from('transactions')
    .select('id')
    .eq('function_id', req.params.id)
    .limit(1);

  if (countError) return res.status(400).json({ success: false, message: 'Failed to check transactions' });
  if (txnCount && txnCount.length > 0) {
    return res.status(400).json({ success: false, message: 'Cannot delete function with linked transactions' });
  }

  const { error } = await supabaseAdmin.from('functions').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ success: false, message: error.message });

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'delete',
    entity: 'function',
    entityId: req.params.id,
    details: {},
    ipAddress: req.ip,
  });

  res.json({ success: true });
});

// ADD category budget to function
router.post('/:id/categories', requireRole('admin', 'accountant'), async (req, res) => {
  const { category_id, budget_amount, budget_cash, budget_digital } = req.body;
  if (!category_id) return res.status(400).json({ success: false, message: 'category_id is required' });

  const amount = Number(budget_amount || 0);
  const cash = Number(budget_cash || 0);
  const digital = Number(budget_digital || 0);
  if (isNaN(amount) || amount < 0) return res.status(400).json({ success: false, message: 'Invalid budget amount' });
  if (isNaN(cash) || cash < 0) return res.status(400).json({ success: false, message: 'Invalid cash budget' });
  if (isNaN(digital) || digital < 0) return res.status(400).json({ success: false, message: 'Invalid digital budget' });

  const { data, error } = await supabaseAdmin
    .from('function_categories')
    .upsert(
      { function_id: req.params.id, category_id, budget_amount: amount, budget_cash: cash, budget_digital: digital },
      { onConflict: 'function_id,category_id' }
    )
    .select()
    .single();
  if (error) return res.status(400).json({ success: false, message: error.message });

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    entity: 'function_category',
    entityId: data.id,
    details: { function_id: req.params.id, category_id, budget_amount: amount },
    ipAddress: req.ip,
  });

  res.json({ success: true, result: data });
});

// UPDATE category budget
router.patch('/:id/categories/:catId', requireRole('admin', 'accountant'), async (req, res) => {
  const { budget_amount, budget_cash, budget_digital } = req.body;
  const updates = {};
  if (budget_amount !== undefined) {
    const n = Number(budget_amount);
    if (isNaN(n) || n < 0) return res.status(400).json({ success: false, message: 'Invalid budget amount' });
    updates.budget_amount = n;
  }
  if (budget_cash !== undefined) {
    const n = Number(budget_cash);
    if (isNaN(n) || n < 0) return res.status(400).json({ success: false, message: 'Invalid cash budget' });
    updates.budget_cash = n;
  }
  if (budget_digital !== undefined) {
    const n = Number(budget_digital);
    if (isNaN(n) || n < 0) return res.status(400).json({ success: false, message: 'Invalid digital budget' });
    updates.budget_digital = n;
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, message: 'No valid fields' });

  const { data, error } = await supabaseAdmin
    .from('function_categories')
    .update(updates)
    .eq('id', req.params.catId)
    .select()
    .single();
  if (error) return res.status(400).json({ success: false, message: error.message });

  res.json({ success: true, result: data });
});

// DELETE category budget
router.delete('/:id/categories/:catId', requireRole('admin', 'accountant'), async (req, res) => {
  const { error } = await supabaseAdmin.from('function_categories').delete().eq('id', req.params.catId);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

// SOURCE BALANCE report (cash/digital income vs function expenses)
router.get('/summary/source-balance', async (req, res) => {
  try {
    const [{ data: fnSum }, { data: txnData, error: txnErr }] = await Promise.all([
      supabaseAdmin.from('functions').select('budget_cash, budget_digital').eq('status', 'active'),
      supabaseAdmin.from('transactions').select('type, mode, amount, function_id'),
    ]);
    if (txnErr) throw txnErr;

    let total_cash_income = 0;
    let total_digital_income = 0;
    let total_cash_function_expenses = 0;
    let total_digital_function_expenses = 0;
    let total_cash_nonfunction_expenses = 0;
    let total_digital_nonfunction_expenses = 0;

    (txnData || []).forEach((t) => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'credit' && t.mode === 'cash') total_cash_income += amt;
      else if (t.type === 'credit' && t.mode === 'digital') total_digital_income += amt;
      else if (t.type === 'debit' && t.mode === 'cash') {
        if (t.function_id) total_cash_function_expenses += amt;
        else total_cash_nonfunction_expenses += amt;
      } else if (t.type === 'debit' && t.mode === 'digital') {
        if (t.function_id) total_digital_function_expenses += amt;
        else total_digital_nonfunction_expenses += amt;
      }
    });

    let total_allocated_cash = 0;
    let total_allocated_digital = 0;
    (fnSum || []).forEach((f) => {
      total_allocated_cash += Number(f.budget_cash) || 0;
      total_allocated_digital += Number(f.budget_digital) || 0;
    });

    const cash_available = total_cash_income - total_cash_nonfunction_expenses;
    const digital_available = total_digital_income - total_digital_nonfunction_expenses;
    const cash_unallocated = cash_available - total_allocated_cash;
    const digital_unallocated = digital_available - total_allocated_digital;

    res.set('Cache-Control', 'private, max-age=30');
    res.json({
      success: true,
      result: {
        total_cash_income,
        total_digital_income,
        total_cash_function_expenses,
        total_digital_function_expenses,
        total_cash_nonfunction_expenses,
        total_digital_nonfunction_expenses,
        total_allocated_cash,
        total_allocated_digital,
        cash_available,
        digital_available,
        cash_unallocated,
        digital_unallocated,
      },
    });
  } catch (err) {
    console.error('Source balance error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to compute source balance' });
  }
});

module.exports = router;
