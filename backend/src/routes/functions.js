const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');

router.use(requireAuth);

const VALID_STATUSES = ['active', 'completed', 'archived'];

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
  if (budget_total !== undefined) updates.budget_total = Number(budget_total);
  if (budget_cash !== undefined) updates.budget_cash = Number(budget_cash);
  if (budget_digital !== undefined) updates.budget_digital = Number(budget_digital);

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
  if (budget_amount !== undefined) updates.budget_amount = Number(budget_amount);
  if (budget_cash !== undefined) updates.budget_cash = Number(budget_cash);
  if (budget_digital !== undefined) updates.budget_digital = Number(budget_digital);
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
    const { data, error } = await supabaseAdmin
      .from('v_source_balance')
      .select('*')
      .single();

    if (error) {
      console.error('Source balance view error:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to compute source balance' });
    }

    const cash_available = (Number(data.total_cash_income) || 0) - (Number(data.total_cash_nonfunction_expenses) || 0);
    const digital_available = (Number(data.total_digital_income) || 0) - (Number(data.total_digital_nonfunction_expenses) || 0);

    res.set('Cache-Control', 'private, max-age=30');
    res.json({
      success: true,
      result: {
        total_cash_income: Number(data.total_cash_income) || 0,
        total_digital_income: Number(data.total_digital_income) || 0,
        total_cash_function_expenses: Number(data.total_cash_function_expenses) || 0,
        total_digital_function_expenses: Number(data.total_digital_function_expenses) || 0,
        total_cash_nonfunction_expenses: Number(data.total_cash_nonfunction_expenses) || 0,
        total_digital_nonfunction_expenses: Number(data.total_digital_nonfunction_expenses) || 0,
        cash_available,
        digital_available,
      },
    });
  } catch (err) {
    console.error('Source balance error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to compute source balance' });
  }
});

// LIST items for a function category
router.get('/:id/categories/:catId/items', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('function_category_items')
      .select('*')
      .eq('function_category_id', req.params.catId)
      .order('created_at', { ascending: true });
    if (error) return res.status(400).json({ success: false, message: error.message });
    res.json({ success: true, result: data || [] });
  } catch (err) {
    console.error('Function category items list error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch items' });
  }
});

// CREATE item for a function category
router.post('/:id/categories/:catId/items', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { item_name, quantity, unit_price, notes } = req.body;
    if (!item_name || !item_name.trim()) return res.status(400).json({ success: false, message: 'Item name is required' });

    const qty = Number(quantity || 1);
    const price = Number(unit_price || 0);
    const total = qty * price;

    const { data, error } = await supabaseAdmin
      .from('function_category_items')
      .insert({
        function_category_id: req.params.catId,
        item_name: item_name.trim(),
        quantity: qty,
        unit_price: price,
        total_amount: total,
        notes: notes || null,
      })
      .select()
      .single();
    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'create',
      entity: 'function_category_item',
      entityId: data.id,
      details: { function_category_id: req.params.catId, item_name: data.item_name, total_amount: data.total_amount },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: data });
  } catch (err) {
    console.error('Function category item create error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to create item' });
  }
});

// UPDATE item
router.patch('/:id/categories/:catId/items/:itemId', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const updates = {};
    const { item_name, quantity, unit_price, notes } = req.body;

    if (item_name !== undefined) {
      if (!item_name || !item_name.trim()) return res.status(400).json({ success: false, message: 'Item name is required' });
      updates.item_name = item_name.trim();
    }
    if (quantity !== undefined) updates.quantity = Number(quantity);
    if (unit_price !== undefined) updates.unit_price = Number(unit_price);
    if (notes !== undefined) updates.notes = notes || null;

    if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, message: 'No valid fields to update' });

    const qty = updates.quantity !== undefined ? updates.quantity : undefined;
    const price = updates.unit_price !== undefined ? updates.unit_price : undefined;

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('function_category_items')
      .select('quantity, unit_price')
      .eq('id', req.params.itemId)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ success: false, message: 'Item not found' });

    const finalQty = qty !== undefined ? qty : existing.quantity;
    const finalPrice = price !== undefined ? price : existing.unit_price;
    updates.total_amount = finalQty * finalPrice;

    const { data, error } = await supabaseAdmin
      .from('function_category_items')
      .update(updates)
      .eq('id', req.params.itemId)
      .select()
      .single();
    if (error) return res.status(400).json({ success: false, message: error.message });

    res.json({ success: true, result: data });
  } catch (err) {
    console.error('Function category item update error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update item' });
  }
});

// DELETE item
router.delete('/:id/categories/:catId/items/:itemId', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('function_category_items')
      .delete()
      .eq('id', req.params.itemId);
    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'delete',
      entity: 'function_category_item',
      entityId: req.params.itemId,
      details: {},
      ipAddress: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Function category item delete error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete item' });
  }
});

module.exports = router;
