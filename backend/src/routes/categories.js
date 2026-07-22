const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { getCached, invalidate } = require('@/lib/cache');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const data = await getCached('categories:all', 30000, async () => {
    const { data, error } = await supabaseAdmin.from('categories').select('*').order('name');
    if (error) throw error;
    return data;
  });
  res.set('Cache-Control', 'private, max-age=30');
  res.json({ success: true, result: data });
});

router.post('/', requireRole('admin'), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
  const { data, error } = await supabaseAdmin.from('categories').insert({ name: name.trim() }).select().single();
  if (error) return res.status(400).json({ success: false, message: error.message });
  invalidate('categories');

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    entity: 'category',
    entityId: data.id,
    details: { name: data.name },
    ipAddress: req.ip,
  });

  res.json({ success: true, result: data });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'delete',
    entity: 'category',
    entityId: req.params.id,
    details: {},
    ipAddress: req.ip,
  });

  const { error } = await supabaseAdmin.from('categories').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ success: false, message: error.message });
  invalidate('categories');
  res.json({ success: true });
});

module.exports = router;
