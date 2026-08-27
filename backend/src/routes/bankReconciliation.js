const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { getCached, invalidate } = require('@/lib/cache');

router.use(requireAuth);

// BANK STATEMENTS CRUD
router.get('/bank-statements', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('bank_statements')
      .select('*, profiles(name, email)')
      .order('period_start', { ascending: false });
    if (error) throw error;
    res.json({ success: true, result: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/bank-statements', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { bank_name, account_number, period_start, period_end, file_url } = req.body;

    if (!period_start || !period_end) {
      return res.status(400).json({ success: false, message: 'Period start and end dates are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('bank_statements')
      .insert({
        bank_name: bank_name || 'Unknown',
        account_number: account_number || null,
        period_start,
        period_end,
        file_url: file_url || null,
        uploaded_by: req.user.id,
      })
      .select('*, profiles(name, email)')
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'create',
      entity: 'bank_statement',
      entityId: data.id,
      details: { bank_name: data.bank_name, period_start: data.period_start, period_end: data.period_end },
      ipAddress: req.ip,
    });

    invalidate('bank_statements');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/bank-statements/:id', requireRole('admin'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('bank_statements')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'delete',
      entity: 'bank_statement',
      entityId: req.params.id,
      details: {},
      ipAddress: req.ip,
    });

    invalidate('bank_statements');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// BANK RECONCILIATION ITEMS
router.get('/bank-statements/:statementId/items', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('bank_reconciliation_items')
      .select('*')
      .eq('bank_statement_id', req.params.statementId)
      .order('transaction_date', { ascending: true });
    if (error) throw error;
    res.json({ success: true, result: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/bank-statements/:statementId/items', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { transaction_date, description, amount, type, reference_no, notes } = req.body;

    if (!description || !amount || !transaction_date || !type) {
      return res.status(400).json({ success: false, message: 'Description, amount, date and type are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('bank_reconciliation_items')
      .insert({
        bank_statement_id: req.params.statementId,
        transaction_date,
        description: description.trim(),
        amount: Number(amount),
        type,
        reference_no: reference_no || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'create',
      entity: 'bank_reconciliation_item',
      entityId: data.id,
      details: { bank_statement_id: req.params.statementId, description: data.description, amount: data.amount },
      ipAddress: req.ip,
    });

    invalidate('bank_reconciliation_items');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/bank-reconciliation-items/:itemId', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const updates = {};
    const { status, matched_transaction_id, notes } = req.body;

    if (status !== undefined) updates.status = status;
    if (matched_transaction_id !== undefined) updates.matched_transaction_id = matched_transaction_id || null;
    if (notes !== undefined) updates.notes = notes || null;

    const { data, error } = await supabaseAdmin
      .from('bank_reconciliation_items')
      .update(updates)
      .eq('id', req.params.itemId)
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'update',
      entity: 'bank_reconciliation_item',
      entityId: data.id,
      details: updates,
      ipAddress: req.ip,
    });

    invalidate('bank_reconciliation_items');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/bank-reconciliation-items/:itemId', requireRole('admin'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('bank_reconciliation_items')
      .delete()
      .eq('id', req.params.itemId);

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'delete',
      entity: 'bank_reconciliation_item',
      entityId: req.params.itemId,
      details: {},
      ipAddress: req.ip,
    });

    invalidate('bank_reconciliation_items');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get unmatched transactions for matching
router.get('/bank-reconciliation/unmatched-transactions', async (req, res) => {
  try {
    const { period_start, period_end } = req.query;

    let query = supabaseAdmin
      .from('transactions')
      .select('id, txn_date, description, amount, type, mode, category_id')
      .neq('type', 'transfer')
      .order('txn_date', { ascending: true });

    if (period_start) query = query.gte('txn_date', period_start);
    if (period_end) query = query.lte('txn_date', period_end);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, result: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
