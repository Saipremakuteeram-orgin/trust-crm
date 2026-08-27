const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { getCached, invalidate } = require('@/lib/cache');

router.use(requireAuth);

// LIST donation receipts
router.get('/receipts', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('donation_receipts')
      .select('*, contacts(name, email, phone)')
      .order('receipt_date', { ascending: false });
    if (error) throw error;
    res.json({ success: true, result: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CREATE donation receipt
router.post('/receipts', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { transaction_id, donor_id, amount, receipt_date, payment_mode, section_80g, section_12a, acknowledgement_number, pan_number, address, notes } = req.body;

    if (!donor_id || !amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Donor and valid amount are required' });
    }

    const receipt_number = generate_receipt_number();

    const { data, error } = await supabaseAdmin
      .from('donation_receipts')
      .insert({
        receipt_number,
        transaction_id: transaction_id || null,
        donor_id,
        amount: Number(amount),
        receipt_date: receipt_date || new Date().toISOString().slice(0, 10),
        payment_mode: payment_mode || 'cash',
        section_80g: section_80g || false,
        section_12a: section_12a || false,
        acknowledgement_number: acknowledgement_number || null,
        pan_number: pan_number || null,
        address: address || null,
        notes: notes || null,
        issued_by: req.user.id,
      })
      .select('*, contacts(name, email, phone)')
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'create',
      entity: 'donation_receipt',
      entityId: data.id,
      details: { receipt_number: data.receipt_number, donor_id: data.donor_id, amount: data.amount },
      ipAddress: req.ip,
    });

    invalidate('donation_receipts');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// UPDATE donation receipt
router.patch('/receipts/:id', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const updates = {};
    const { transaction_id, donor_id, amount, receipt_date, payment_mode, section_80g, section_12a, acknowledgement_number, pan_number, address, notes } = req.body;

    if (transaction_id !== undefined) updates.transaction_id = transaction_id || null;
    if (donor_id !== undefined) updates.donor_id = donor_id;
    if (amount !== undefined) updates.amount = Number(amount);
    if (receipt_date !== undefined) updates.receipt_date = receipt_date;
    if (payment_mode !== undefined) updates.payment_mode = payment_mode;
    if (section_80g !== undefined) updates.section_80g = section_80g;
    if (section_12a !== undefined) updates.section_12a = section_12a;
    if (acknowledgement_number !== undefined) updates.acknowledgement_number = acknowledgement_number || null;
    if (pan_number !== undefined) updates.pan_number = pan_number || null;
    if (address !== undefined) updates.address = address || null;
    if (notes !== undefined) updates.notes = notes || null;

    const { data, error } = await supabaseAdmin
      .from('donation_receipts')
      .update(updates)
      .eq('id', req.params.id)
      .select('*, contacts(name, email, phone)')
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'update',
      entity: 'donation_receipt',
      entityId: data.id,
      details: updates,
      ipAddress: req.ip,
    });

    invalidate('donation_receipts');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE donation receipt
router.delete('/receipts/:id', requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('donation_receipts')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'delete',
      entity: 'donation_receipt',
      entityId: req.params.id,
      details: { receipt_number: data?.receipt_number },
      ipAddress: req.ip,
    });

    invalidate('donation_receipts');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
