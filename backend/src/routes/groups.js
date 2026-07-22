const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');

router.use(requireAuth);

// LIST all groups with member count
router.get('/', async (req, res) => {
  try {
    const { data: groups, error } = await supabaseAdmin
      .from('contact_groups')
      .select('*')
      .order('name');
    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return res.json({ success: true, result: [] });
      }
      return res.status(400).json({ success: false, message: error.message });
    }

    const { data: members } = await supabaseAdmin
      .from('contact_group_members')
      .select('group_id, contact_id');

    const memberMap = {};
    (members || []).forEach((m) => {
      if (!memberMap[m.group_id]) memberMap[m.group_id] = [];
      memberMap[m.group_id].push(m.contact_id);
    });

    const result = (groups || []).map((g) => ({
      ...g,
      member_ids: memberMap[g.id] || [],
      member_count: (memberMap[g.id] || []).length,
    }));

    res.set('Cache-Control', 'private, max-age=30');
    res.json({ success: true, result });
  } catch (err) {
    console.error('Groups list error:', err.message);
    res.json({ success: true, result: [] });
  }
});

// GET single group with members
router.get('/:id', async (req, res) => {
  const { data: group, error } = await supabaseAdmin
    .from('contact_groups')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ success: false, message: 'Group not found' });

  const { data: members } = await supabaseAdmin
    .from('contact_group_members')
    .select('contact_id')
    .eq('group_id', req.params.id);

  res.json({
    success: true,
    result: {
      ...group,
      member_ids: (members || []).map((m) => m.contact_id),
    },
  });
});

// CREATE group
router.post('/', requireRole('admin', 'accountant'), async (req, res) => {
  const { name, description, member_ids } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Group name is required' });
  }

  const { data: group, error } = await supabaseAdmin
    .from('contact_groups')
    .insert({ name: name.trim(), description: description || null, created_by: req.user.id })
    .select()
    .single();
  if (error) return res.status(400).json({ success: false, message: error.message });

  if (member_ids && member_ids.length > 0) {
    const rows = member_ids.map((cid) => ({ group_id: group.id, contact_id: cid }));
    await supabaseAdmin.from('contact_group_members').insert(rows);
  }

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    entity: 'contact_group',
    entityId: group.id,
    details: { name: group.name, member_count: (member_ids || []).length },
    ipAddress: req.ip,
  });

  res.json({ success: true, result: { ...group, member_ids: member_ids || [] } });
});

// UPDATE group
router.patch('/:id', requireRole('admin', 'accountant'), async (req, res) => {
  const { name, description, member_ids } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabaseAdmin
      .from('contact_groups')
      .update(updates)
      .eq('id', req.params.id);
    if (error) return res.status(400).json({ success: false, message: error.message });
  }

  if (member_ids !== undefined) {
    await supabaseAdmin.from('contact_group_members').delete().eq('group_id', req.params.id);
    if (member_ids.length > 0) {
      const rows = member_ids.map((cid) => ({ group_id: req.params.id, contact_id: cid }));
      await supabaseAdmin.from('contact_group_members').insert(rows);
    }
  }

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    entity: 'contact_group',
    entityId: req.params.id,
    details: { ...updates, ...(member_ids !== undefined ? { member_count: member_ids.length } : {}) },
    ipAddress: req.ip,
  });

  const { data: group } = await supabaseAdmin
    .from('contact_groups')
    .select('*')
    .eq('id', req.params.id)
    .single();

  res.json({ success: true, result: { ...group, member_ids: member_ids || [] } });
});

// DELETE group
router.delete('/:id', requireRole('admin'), async (req, res) => {
  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'delete',
    entity: 'contact_group',
    entityId: req.params.id,
    details: {},
    ipAddress: req.ip,
  });

  const { error } = await supabaseAdmin.from('contact_groups').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

// ADD member to group
router.post('/:id/members', requireRole('admin', 'accountant'), async (req, res) => {
  const { contact_id } = req.body;
  if (!contact_id) return res.status(400).json({ success: false, message: 'contact_id is required' });

  const { error } = await supabaseAdmin
    .from('contact_group_members')
    .insert({ group_id: req.params.id, contact_id });
  if (error && error.code !== '23505') {
    return res.status(400).json({ success: false, message: error.message });
  }

  res.json({ success: true });
});

// REMOVE member from group
router.delete('/:id/members/:contactId', requireRole('admin', 'accountant'), async (req, res) => {
  const { error } = await supabaseAdmin
    .from('contact_group_members')
    .delete()
    .eq('group_id', req.params.id)
    .eq('contact_id', req.params.contactId);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

module.exports = router;
