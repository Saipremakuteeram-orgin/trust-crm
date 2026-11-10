const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth } = require('@/middlewares/auth');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(50);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data || [] });
});

router.patch('/:id/read', async (req, res) => {
  const { error } = await supabaseAdmin.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', req.params.id).eq('user_id', req.user.id);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

router.post('/read-all', async (req, res) => {
  const { error } = await supabaseAdmin.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', req.user.id).is('read_at', null);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

module.exports = router;
