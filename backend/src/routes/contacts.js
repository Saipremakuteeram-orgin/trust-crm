const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { safeErrorMessage } = require('@/lib/security');

const CONTACT_FIELDS = ['name', 'email', 'phone', 'telegram_chat_id', 'enabled', 'subscribe_monthly_report', 'notes'];

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('contacts').select('id, name, email, phone, telegram_chat_id, enabled, subscribe_monthly_report, notes, created_by, created_at').order('name');
  if (error) return res.status(400).json({ success: false, message: 'Failed to fetch contacts' });
  res.set('Cache-Control', 'private, max-age=30');
  res.json({ success: true, result: data });
});

function pickAllowedFields(body) {
  const out = {};
  for (const key of CONTACT_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

router.post('/', requireRole('admin', 'accountant'), async (req, res) => {
  const fields = pickAllowedFields(req.body);
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .insert({ ...fields, created_by: req.user.id })
    .select('id, name, email, phone, telegram_chat_id, enabled, subscribe_monthly_report, notes, created_by, created_at')
    .single();
  if (error) return res.status(400).json({ success: false, message: 'Failed to create contact' });

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
  const fields = pickAllowedFields(req.body);
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ success: false, message: 'No valid fields to update' });
  }
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .update(fields)
    .eq('id', req.params.id)
    .select('id, name, email, phone, telegram_chat_id, enabled, subscribe_monthly_report, notes, created_by, created_at')
    .single();
  if (error) return res.status(400).json({ success: false, message: 'Failed to update contact' });

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    entity: 'contact',
    entityId: req.params.id,
    details: fields,
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
  if (error) return res.status(400).json({ success: false, message: 'Failed to delete contact' });
  res.json({ success: true });
});

module.exports = router;
