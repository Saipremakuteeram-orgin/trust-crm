const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { getCached, invalidate } = require('@/lib/cache');

router.use(requireAuth);

// COMPLIANCE ITEMS CRUD
router.get('/compliance', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('compliance_items')
      .select('*')
      .order('due_date', { ascending: true });
    if (error) throw error;
    res.json({ success: true, result: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/compliance', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { name, category, frequency, due_date, responsible_person, status, notes } = req.body;
    if (!name || !due_date) return res.status(400).json({ success: false, message: 'Name and due date are required' });

    const { data, error } = await supabaseAdmin
      .from('compliance_items')
      .insert({
        name: name.trim(),
        category: category || 'Other',
        frequency: frequency || 'monthly',
        due_date,
        responsible_person: responsible_person || null,
        status: status || 'pending',
        notes: notes || null,
        created_by: req.user.id,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'create',
      entity: 'compliance_item',
      entityId: data.id,
      details: { name: data.name, category: data.category },
      ipAddress: req.ip,
    });

    invalidate('compliance_items');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/compliance/:id', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const updates = {};
    const { name, category, frequency, due_date, responsible_person, status, notes } = req.body;

    if (name !== undefined) updates.name = name.trim();
    if (category !== undefined) updates.category = category;
    if (frequency !== undefined) updates.frequency = frequency;
    if (due_date !== undefined) updates.due_date = due_date;
    if (responsible_person !== undefined) updates.responsible_person = responsible_person || null;
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes || null;

    const { data, error } = await supabaseAdmin
      .from('compliance_items')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'update',
      entity: 'compliance_item',
      entityId: data.id,
      details: updates,
      ipAddress: req.ip,
    });

    invalidate('compliance_items');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/compliance/:id', requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('compliance_items')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'delete',
      entity: 'compliance_item',
      entityId: req.params.id,
      details: {},
      ipAddress: req.ip,
    });

    invalidate('compliance_items');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// COMPLIANCE RETURNS CRUD
router.get('/compliance/:itemId/returns', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('compliance_returns')
      .select('*')
      .eq('compliance_item_id', req.params.itemId)
      .order('due_date', { ascending: false });
    if (error) throw error;
    res.json({ success: true, result: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/compliance/:itemId/returns', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { period, due_date, filed_date, status, acknowledgement_number, file_url, notes } = req.body;
    if (!period || !due_date) return res.status(400).json({ success: false, message: 'Period and due date are required' });

    const { data, error } = await supabaseAdmin
      .from('compliance_returns')
      .insert({
        compliance_item_id: req.params.itemId,
        period: period.trim(),
        due_date,
        filed_date: filed_date || null,
        status: status || 'pending',
        acknowledgement_number: acknowledgement_number || null,
        file_url: file_url || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'create',
      entity: 'compliance_return',
      entityId: data.id,
      details: { compliance_item_id: req.params.itemId, period: data.period },
      ipAddress: req.ip,
    });

    invalidate('compliance_returns');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/compliance/returns/:returnId', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const updates = {};
    const { period, due_date, filed_date, status, acknowledgement_number, file_url, notes } = req.body;

    if (period !== undefined) updates.period = period.trim();
    if (due_date !== undefined) updates.due_date = due_date;
    if (filed_date !== undefined) updates.filed_date = filed_date || null;
    if (status !== undefined) updates.status = status;
    if (acknowledgement_number !== undefined) updates.acknowledgement_number = acknowledgement_number || null;
    if (file_url !== undefined) updates.file_url = file_url || null;
    if (notes !== undefined) updates.notes = notes || null;

    const { data, error } = await supabaseAdmin
      .from('compliance_returns')
      .update(updates)
      .eq('id', req.params.returnId)
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'update',
      entity: 'compliance_return',
      entityId: data.id,
      details: updates,
      ipAddress: req.ip,
    });

    invalidate('compliance_returns');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/compliance/returns/:returnId', requireRole('admin'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('compliance_returns')
      .delete()
      .eq('id', req.params.returnId);

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'delete',
      entity: 'compliance_return',
      entityId: req.params.returnId,
      details: {},
      ipAddress: req.ip,
    });

    invalidate('compliance_returns');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
