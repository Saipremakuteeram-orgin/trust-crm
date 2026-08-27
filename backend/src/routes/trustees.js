const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { getCached, invalidate } = require('@/lib/cache');

router.use(requireAuth);

// TRUSTEES CRUD
router.get('/trustees', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('trustees')
      .select('*, contacts(name, email, phone)')
      .order('appointment_date', { ascending: false });
    if (error) throw error;
    res.json({ success: true, result: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/trustees', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { contact_id, appointment_date, term_end, role, designation, is_active, notes } = req.body;
    if (!contact_id) return res.status(400).json({ success: false, message: 'Contact is required' });

    const { data, error } = await supabaseAdmin
      .from('trustees')
      .insert({
        contact_id,
        appointment_date: appointment_date || new Date().toISOString().slice(0, 10),
        term_end: term_end || null,
        role: role || 'Trustee',
        designation: designation || null,
        is_active: is_active !== false,
        notes: notes || null,
      })
      .select('*, contacts(name, email, phone)')
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'create',
      entity: 'trustee',
      entityId: data.id,
      details: { contact_id: data.contact_id, role: data.role },
      ipAddress: req.ip,
    });

    invalidate('trustees');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/trustees/:id', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const updates = {};
    const { appointment_date, term_end, role, designation, is_active, notes } = req.body;

    if (appointment_date !== undefined) updates.appointment_date = appointment_date;
    if (term_end !== undefined) updates.term_end = term_end || null;
    if (role !== undefined) updates.role = role;
    if (designation !== undefined) updates.designation = designation || null;
    if (is_active !== undefined) updates.is_active = is_active;
    if (notes !== undefined) updates.notes = notes || null;

    const { data, error } = await supabaseAdmin
      .from('trustees')
      .update(updates)
      .eq('id', req.params.id)
      .select('*, contacts(name, email, phone)')
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'update',
      entity: 'trustee',
      entityId: data.id,
      details: updates,
      ipAddress: req.ip,
    });

    invalidate('trustees');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/trustees/:id', requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('trustees')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'delete',
      entity: 'trustee',
      entityId: req.params.id,
      details: {},
      ipAddress: req.ip,
    });

    invalidate('trustees');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// BENEFICIARIES CRUD
router.get('/beneficiaries', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('beneficiaries')
      .select('*, contacts(name, email, phone)')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, result: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/beneficiaries', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { contact_id, eligibility_start, eligibility_end, category, priority, notes } = req.body;
    if (!contact_id) return res.status(400).json({ success: false, message: 'Contact is required' });

    const { data, error } = await supabaseAdmin
      .from('beneficiaries')
      .insert({
        contact_id,
        eligibility_start: eligibility_start || new Date().toISOString().slice(0, 10),
        eligibility_end: eligibility_end || null,
        category: category || 'General',
        priority: priority || 0,
        notes: notes || null,
      })
      .select('*, contacts(name, email, phone)')
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'create',
      entity: 'beneficiary',
      entityId: data.id,
      details: { contact_id: data.contact_id, category: data.category },
      ipAddress: req.ip,
    });

    invalidate('beneficiaries');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/beneficiaries/:id', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const updates = {};
    const { eligibility_start, eligibility_end, category, priority, notes } = req.body;

    if (eligibility_start !== undefined) updates.eligibility_start = eligibility_start;
    if (eligibility_end !== undefined) updates.eligibility_end = eligibility_end || null;
    if (category !== undefined) updates.category = category;
    if (priority !== undefined) updates.priority = priority;
    if (notes !== undefined) updates.notes = notes || null;

    const { data, error } = await supabaseAdmin
      .from('beneficiaries')
      .update(updates)
      .eq('id', req.params.id)
      .select('*, contacts(name, email, phone)')
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'update',
      entity: 'beneficiary',
      entityId: data.id,
      details: updates,
      ipAddress: req.ip,
    });

    invalidate('beneficiaries');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/beneficiaries/:id', requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('beneficiaries')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'delete',
      entity: 'beneficiary',
      entityId: req.params.id,
      details: {},
      ipAddress: req.ip,
    });

    invalidate('beneficiaries');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// BENEFICIARY DISBURSEMENTS
router.get('/beneficiaries/:id/disbursements', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('beneficiary_disbursements')
      .select('*')
      .eq('beneficiary_id', req.params.id)
      .order('disbursement_date', { ascending: false });
    if (error) throw error;
    res.json({ success: true, result: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/beneficiaries/:id/disbursements', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { amount, disbursement_date, purpose, mode, reference_no, receipt_file_id, notes } = req.body;
    if (!purpose || !purpose.trim()) return res.status(400).json({ success: false, message: 'Purpose is required' });

    const { data, error } = await supabaseAdmin
      .from('beneficiary_disbursements')
      .insert({
        beneficiary_id: req.params.id,
        amount: Number(amount) || 0,
        disbursement_date: disbursement_date || new Date().toISOString().slice(0, 10),
        purpose: purpose.trim(),
        mode: mode || 'cash',
        reference_no: reference_no || null,
        receipt_file_id: receipt_file_id || null,
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
      entity: 'beneficiary_disbursement',
      entityId: data.id,
      details: { beneficiary_id: req.params.id, amount: data.amount, purpose: data.purpose },
      ipAddress: req.ip,
    });

    invalidate('beneficiary_disbursements');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/beneficiaries/disbursements/:disbursementId', requireRole('admin'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('beneficiary_disbursements')
      .delete()
      .eq('id', req.params.disbursementId);

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'delete',
      entity: 'beneficiary_disbursement',
      entityId: req.params.disbursementId,
      details: {},
      ipAddress: req.ip,
    });

    invalidate('beneficiary_disbursements');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
