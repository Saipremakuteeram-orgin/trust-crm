const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('contacts').select('*').order('name');
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data });
});

router.post('/', requireRole('admin', 'accountant'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .insert({ ...req.body, created_by: req.user.id })
    .select()
    .single();
  if (error) return res.status(400).json({ success: false, message: error.message });
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
  res.json({ success: true, result: data });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { error } = await supabaseAdmin.from('contacts').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

module.exports = router;
