const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { data: camps, error } = await supabaseAdmin.from('campaigns').select('*').order('created_at', { ascending: false });
  if (error) return res.status(400).json({ success: false, message: error.message });
  // progress
  const { data: receipts } = await supabaseAdmin.from('donation_receipts').select('campaign_id, amount');
  const raised = {};
  (receipts || []).forEach((r) => { if (r.campaign_id) raised[r.campaign_id] = (raised[r.campaign_id] || 0) + Number(r.amount || 0); });
  const result = (camps || []).map((c) => ({ ...c, raised: raised[c.id] || 0, progress: c.goal_amount > 0 ? Math.min(100, ((raised[c.id] || 0) / c.goal_amount) * 100) : 0 }));
  res.json({ success: true, result });
});

router.post('/', requireRole('admin', 'accountant'), async (req, res) => {
  const { name, description, goal_amount, start_date, end_date, status } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Name required' });
  const { data, error } = await supabaseAdmin.from('campaigns').insert({ name, description, goal_amount: goal_amount || 0, start_date, end_date, status: status || 'active', created_by: req.user.id }).select().single();
  if (error) return res.status(400).json({ success: false, message: error.message });
  logActivity({ userId: req.user.id, userEmail: req.user.email, action: 'create', entity: 'campaign', entityId: data.id, details: { name }, ipAddress: req.ip });
  res.json({ success: true, result: data });
});

router.patch('/:id', requireRole('admin', 'accountant'), async (req, res) => {
  const { name, description, goal_amount, start_date, end_date, status } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (goal_amount !== undefined) updates.goal_amount = goal_amount;
  if (start_date !== undefined) updates.start_date = start_date;
  if (end_date !== undefined) updates.end_date = end_date;
  if (status !== undefined) updates.status = status;
  const { data, error } = await supabaseAdmin.from('campaigns').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, result: data });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { error } = await supabaseAdmin.from('campaigns').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true });
});

module.exports = router;
