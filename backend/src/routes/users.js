const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');

router.use(requireAuth);

router.get('/', requireRole('admin'), async (req, res) => {
  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(400).json({ success: false, message: error.message });

  const enriched = await Promise.all(profiles.map(async (p) => {
    try {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(p.id);
      return { ...p, email: user?.email || 'Unknown' };
    } catch {
      return { ...p, email: 'Unknown' };
    }
  }));

  res.json({ success: true, result: enriched });
});

router.patch('/:id/role', requireRole('admin'), async (req, res) => {
  const { role } = req.body;
  if (!role || !['admin', 'accountant', 'viewer'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Invalid role' });
  }
  if (req.params.id === req.user.id) {
    return res.status(400).json({ success: false, message: 'Cannot change your own role' });
  }
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ role })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
  }
  const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

module.exports = router;
