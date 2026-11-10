const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('volunteers').select('*, contacts(name, email, phone)').order('name');
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data || [] });
});

router.post('/', requireRole('admin', 'accountant'), async (req, res) => {
  const { contact_id, name, skills, availability, status, notes } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Name required' });
  const { data, error } = await supabaseAdmin.from('volunteers').insert({ contact_id: contact_id || null, name, skills, availability, status: status || 'active', notes }).select('*, contacts(name, email, phone)').single();
  if (error) return res.status(400).json({ success: false, message: error.message });
  logActivity({ userId: req.user.id, userEmail: req.user.email, action: 'create', entity: 'volunteer', entityId: data.id, details: { name }, ipAddress: req.ip });
  res.json({ success: true, result: data });
});

router.patch('/:id', requireRole('admin', 'accountant'), async (req, res) => {
  const { contact_id, name, skills, availability, status, notes } = req.body;
  const updates = {};
  if (contact_id !== undefined) updates.contact_id = contact_id || null;
  if (name !== undefined) updates.name = name;
  if (skills !== undefined) updates.skills = skills;
  if (availability !== undefined) updates.availability = availability;
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  const { data, error } = await supabaseAdmin.from('volunteers').update(updates).eq('id', req.params.id).select('*, contacts(name, email, phone)').single();
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { error } = await supabaseAdmin.from('volunteers').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

module.exports = router;
