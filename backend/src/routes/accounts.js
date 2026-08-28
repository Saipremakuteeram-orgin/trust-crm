const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { getCached, invalidate } = require('@/lib/cache');

router.use(requireAuth);

// CHART OF ACCOUNTS CRUD
router.get('/accounts', async (req, res) => {
  try {
    const { type, parent_id } = req.query;
    let query = supabaseAdmin.from('chart_of_accounts').select('*').order('account_code', { ascending: true });

    if (type) query = query.eq('type', type);
    if (parent_id) query = query.eq('parent_id', parent_id);
    if (req.query.active !== 'false') query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, result: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/accounts', requireRole('admin'), async (req, res) => {
  try {
    const { account_code, name, type, parent_id, is_active } = req.body;

    if (!name || !type) {
      return res.status(400).json({ success: false, message: 'Name and type are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('chart_of_accounts')
      .insert({
        account_code: account_code || null,
        name: name.trim(),
        type,
        parent_id: parent_id || null,
        is_active: is_active !== false,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'create',
      entity: 'account',
      entityId: data.id,
      details: { name: data.name, type: data.type, account_code: data.account_code },
      ipAddress: req.ip,
    });

    invalidate('accounts');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/accounts/:id', requireRole('admin'), async (req, res) => {
  try {
    const updates = {};
    const { account_code, name, type, parent_id, is_active } = req.body;

    if (account_code !== undefined) updates.account_code = account_code || null;
    if (name !== undefined) updates.name = name.trim();
    if (type !== undefined) updates.type = type;
    if (parent_id !== undefined) updates.parent_id = parent_id || null;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await supabaseAdmin
      .from('chart_of_accounts')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'update',
      entity: 'account',
      entityId: data.id,
      details: updates,
      ipAddress: req.ip,
    });

    invalidate('accounts');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/accounts/:id', requireRole('admin'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('chart_of_accounts')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'delete',
      entity: 'account',
      entityId: req.params.id,
      details: {},
      ipAddress: req.ip,
    });

    invalidate('accounts');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// TRIAL BALANCE
router.get('/trial-balance', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('account_balances')
      .select('*')
      .order('type', { ascending: true })
      .order('account_code', { ascending: true });

    if (error) throw error;

    const result = (data || []).map(row => ({
      ...row,
      debit: row.type === 'asset' || row.type === 'expense' ? Math.max(0, Number(row.balance)) : 0,
      credit: row.type === 'liability' || row.type === 'equity' || row.type === 'income' ? Math.max(0, Number(row.balance)) : 0,
    }));

    const totals = result.reduce((acc, row) => {
      acc.total_debit += Number(row.debit) || 0;
      acc.total_credit += Number(row.credit) || 0;
      return acc;
    }, { total_debit: 0, total_credit: 0 });

    res.json({ success: true, result, totals });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
