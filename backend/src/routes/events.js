const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('events').select('*').order('start_at', { ascending: true });
  if (error) return res.status(400).json({ success: false, message: error.message });

  const { data: registrations } = await supabaseAdmin
    .from('event_registrations')
    .select('event_id, status');
  const counts = {};
  (registrations || []).forEach((r) => {
    if (r.status === 'cancelled') return;
    counts[r.event_id] = (counts[r.event_id] || 0) + 1;
  });

  res.json({
    success: true,
    result: (data || []).map((event) => ({ ...event, registered: counts[event.id] || 0 })),
  });
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
  if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });
  const { data, error } = await supabaseAdmin.from('events').update(updates).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ success: false, message: error.message });
  if (!data) return res.status(404).json({ success: false, message: 'Event not found' });
  res.json({ success: true, result: data });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { error } = await supabaseAdmin.from('events').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

// Registrations
router.get('/:id/registrations', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('event_registrations')
    .select('*, contacts(name, email, phone)')
    .eq('event_id', req.params.id)
    .order('created_at', { ascending: true });
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data || [] });
});

router.post('/:id/register', requireRole('admin', 'accountant'), async (req, res) => {
  const { contact_id, notes } = req.body;
  if (!contact_id) return res.status(400).json({ success: false, message: 'contact_id required' });

  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('id, capacity')
    .eq('id', req.params.id)
    .maybeSingle();
  if (eventError) return res.status(400).json({ success: false, message: eventError.message });
  if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('event_registrations')
    .select('status')
    .eq('event_id', req.params.id)
    .eq('contact_id', contact_id)
    .maybeSingle();
  if (existingError) return res.status(400).json({ success: false, message: existingError.message });
  if (existing) {
    return res.status(409).json({
      success: false,
      message: existing.status === 'cancelled'
        ? 'This contact has a cancelled registration; update it to registered instead.'
        : 'This contact is already registered for this event',
    });
  }

  if (Number(event.capacity) > 0) {
    const { count, error: countError } = await supabaseAdmin
      .from('event_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', req.params.id)
      .neq('status', 'cancelled');
    if (countError) return res.status(400).json({ success: false, message: countError.message });
    if ((count || 0) >= Number(event.capacity)) {
      return res.status(409).json({ success: false, message: 'Event is at full capacity' });
    }
  }

  const { data, error } = await supabaseAdmin.from('event_registrations').insert({ event_id: req.params.id, contact_id, notes }).select('*, contacts(name, email, phone)').single();
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data });
});

const REGISTRATION_STATUSES = ['registered', 'attended', 'cancelled', 'no_show'];

router.patch('/registrations/:rid', requireRole('admin', 'accountant'), async (req, res) => {
  const { status, notes } = req.body;
  const updates = {};
  if (status !== undefined) {
    if (!REGISTRATION_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${REGISTRATION_STATUSES.join(', ')}` });
    }
    updates.status = status;
  }
  if (notes !== undefined) updates.notes = notes;
  if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });
  const { data, error } = await supabaseAdmin.from('event_registrations').update(updates).eq('id', req.params.rid).select('*, contacts(name, email, phone)').maybeSingle();
  if (error) return res.status(400).json({ success: false, message: error.message });
  if (!data) return res.status(404).json({ success: false, message: 'Registration not found' });
  res.json({ success: true, result: data });
});

router.delete('/registrations/:rid', requireRole('admin'), async (req, res) => {
  const { error } = await supabaseAdmin.from('event_registrations').delete().eq('id', req.params.rid);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

module.exports = router;
