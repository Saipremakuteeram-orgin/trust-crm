const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('events').select('*').order('start_at', { ascending: true });
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data || [] });
});

router.post('/', requireRole('admin', 'accountant'), async (req, res) => {
  const { title, description, start_at, end_at, location, capacity } = req.body;
  if (!title || !start_at) return res.status(400).json({ success: false, message: 'Title and start date required' });
  const { data, error } = await supabaseAdmin.from('events').insert({ title, description, start_at, end_at, location, capacity, created_by: req.user.id }).select().single();
  if (error) return res.status(400).json({ success: false, message: error.message });
  logActivity({ userId: req.user.id, userEmail: req.user.email, action: 'create', entity: 'event', entityId: data.id, details: { title }, ipAddress: req.ip });
  res.json({ success: true, result: data });
});

router.patch('/:id', requireRole('admin', 'accountant'), async (req, res) => {
  const { title, description, start_at, end_at, location, capacity } = req.body;
  const updates = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (start_at !== undefined) updates.start_at = start_at;
  if (end_at !== undefined) updates.end_at = end_at;
  if (location !== undefined) updates.location = location;
  if (capacity !== undefined) updates.capacity = capacity;
  const { data, error } = await supabaseAdmin.from('events').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { error } = await supabaseAdmin.from('events').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

// Registrations
router.get('/:id/registrations', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('event_registrations').select('*, contacts(name, email, phone)').eq('event_id', req.params.id);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data || [] });
});

router.post('/:id/register', requireRole('admin', 'accountant'), async (req, res) => {
  const { contact_id, notes } = req.body;
  if (!contact_id) return res.status(400).json({ success: false, message: 'contact_id required' });
  const { data, error } = await supabaseAdmin.from('event_registrations').insert({ event_id: req.params.id, contact_id, notes }).select('*, contacts(name, email, phone)').single();
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data });
});

router.patch('/registrations/:rid', requireRole('admin', 'accountant'), async (req, res) => {
  const { status, notes } = req.body;
  const updates = {};
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  const { data, error } = await supabaseAdmin.from('event_registrations').update(updates).eq('id', req.params.rid).select('*, contacts(name, email, phone)').single();
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data });
});

router.delete('/registrations/:rid', requireRole('admin'), async (req, res) => {
  const { error } = await supabaseAdmin.from('event_registrations').delete().eq('id', req.params.rid);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

module.exports = router;
