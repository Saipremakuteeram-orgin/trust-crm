const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('contacts').select('*').order('name');
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.set('Cache-Control', 'private, max-age=30');
  res.json({ success: true, result: data });
});

router.post('/', requireRole('admin', 'accountant'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .insert({ ...req.body, created_by: req.user.id })
    .select()
    .single();
  if (error) return res.status(400).json({ success: false, message: error.message });

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    entity: 'contact',
    entityId: data.id,
    details: { name: data.name, email: data.email },
    ipAddress: req.ip,
  });

  res.json({ success: true, result: data });
});

router.patch('/:id', requireRole('admin', 'accountant'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ success: false, message: error.message });

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    entity: 'contact',
    entityId: req.params.id,
    details: req.body,
    ipAddress: req.ip,
  });

  res.json({ success: true, result: data });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'delete',
    entity: 'contact',
    entityId: req.params.id,
    details: {},
    ipAddress: req.ip,
  });

  const { error } = await supabaseAdmin.from('contacts').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

module.exports = router;
