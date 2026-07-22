const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');

router.use(requireAuth);

const SAFE_PROFILE_COLS = 'id, full_name, role, created_at';

router.get('/', requireRole('admin'), async (req, res) => {
  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select(SAFE_PROFILE_COLS)
    .order('created_at', { ascending: false });
  if (error) return res.status(400).json({ success: false, message: 'Failed to fetch users' });

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

router.post('/sync', requireRole('admin'), async (req, res) => {
  const { data: authUsers, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) return res.status(500).json({ success: false, message: 'Failed to sync users' });

  const { data: existingProfiles } = await supabaseAdmin.from('profiles').select('id');
  const existingIds = new Set((existingProfiles || []).map(p => p.id));

  const missing = (authUsers?.users || []).filter(u => !existingIds.has(u.id));

  if (missing.length === 0) {
    return res.json({ success: true, result: { synced: 0, message: 'All users already have profiles' } });
  }

  const inserted = await Promise.all(missing.map(async (u) => {
    const fullName = u.user_metadata?.full_name || u.email?.split('@')[0] || 'User';
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .insert({ id: u.id, full_name: fullName, role: 'accountant' })
      .select()
      .single();
    if (error) return null;
    return { ...data, email: u.email };
  }));

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'sync',
    entity: 'users',
    details: { synced: inserted.filter(Boolean).length },
    ipAddress: req.ip,
  });

  res.json({ success: true, result: { synced: inserted.filter(Boolean).length } });
});

router.post('/', requireRole('admin'), async (req, res) => {
  const { email, password, full_name, role } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
  }
  if (role && !['admin', 'accountant', 'viewer'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Invalid role' });
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name || email.split('@')[0] },
  });
  if (error) return res.status(400).json({ success: false, message: 'Failed to create user' });

  if (data?.user) {
    await supabaseAdmin
      .from('profiles')
      .upsert({
        id: data.user.id,
        full_name: full_name || email.split('@')[0],
        role: role || 'accountant',
      }, { onConflict: 'id' });
  }

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    entity: 'user',
    entityId: data?.user?.id,
    details: { email, full_name, role: role || 'accountant' },
    ipAddress: req.ip,
  });

  res.json({ success: true, result: { id: data?.user?.id, email } });
});

router.post('/invite', requireRole('admin'), async (req, res) => {
  const { email, full_name, role } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
  if (role && !['admin', 'accountant', 'viewer'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Invalid role' });
  }

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: full_name || email.split('@')[0] },
  });
  if (error) return res.status(400).json({ success: false, message: 'Failed to invite user' });

  if (role && data?.user) {
    await supabaseAdmin
      .from('profiles')
      .update({ role })
      .eq('id', data.user.id);
  }

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'invite',
    entity: 'user',
    entityId: data?.user?.id,
    details: { email, full_name, role },
    ipAddress: req.ip,
  });

  res.json({ success: true, result: { id: data?.user?.id, email } });
});

router.post('/:id/reset-password', requireRole('admin'), async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
  }
  if (req.params.id === req.user.id) {
    return res.status(400).json({ success: false, message: 'Cannot reset your own password here' });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, { password });
  if (error) return res.status(400).json({ success: false, message: 'Failed to reset password' });

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'reset_password',
    entity: 'user',
    entityId: req.params.id,
    details: {},
    ipAddress: req.ip,
  });

  res.json({ success: true, message: 'Password updated successfully' });
});

router.patch('/:id/role', requireRole('admin'), async (req, res) => {
  const { role } = req.body;
  if (!role || !['admin', 'accountant', 'viewer'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Invalid role' });
  }
  if (req.params.id === req.user.id) {
    return res.status(400).json({ success: false, message: 'Cannot change your own role' });
  }

  const { data: oldProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', req.params.id).single();

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ role })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ success: false, message: 'Failed to update role' });

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'change_role',
    entity: 'user',
    entityId: req.params.id,
    details: { from: oldProfile?.role, to: role },
    ipAddress: req.ip,
  });

  res.json({ success: true, result: data });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
  }

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'delete',
    entity: 'user',
    entityId: req.params.id,
    details: {},
    ipAddress: req.ip,
  });

  const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
  if (error) return res.status(400).json({ success: false, message: 'Failed to delete user' });
  res.json({ success: true });
});

module.exports = router;
