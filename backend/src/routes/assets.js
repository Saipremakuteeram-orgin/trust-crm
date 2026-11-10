const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('assets').select('*').order('name');
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data || [] });
});

router.post('/', requireRole('admin', 'accountant'), async (req, res) => {
  const { name, category, value, location, purchase_date, status, notes } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Name required' });
  const { data, error } = await supabaseAdmin.from('assets').insert({ name, category, value: value || 0, location, purchase_date: purchase_date || null, status: status || 'active', notes }).select().single();
  if (error) return res.status(400).json({ success: false, message: error.message });
  logActivity({ userId: req.user.id, userEmail: req.user.email, action: 'create', entity: 'asset', entityId: data.id, details: { name }, ipAddress: req.ip });
  res.json({ success: true, result: data });
});

router.patch('/:id', requireRole('admin', 'accountant'), async (req, res) => {
  const { name, category, value, location, purchase_date, status, notes } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (category !== undefined) updates.category = category;
  if (value !== undefined) updates.value = value;
  if (location !== undefined) updates.location = location;
  if (purchase_date !== undefined) updates.purchase_date = purchase_date || null;
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  const { data, error } = await supabaseAdmin.from('assets').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { error } = await supabaseAdmin.from('assets').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

module.exports = router;
