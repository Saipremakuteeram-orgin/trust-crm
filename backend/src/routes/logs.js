const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin
    .from('activity_logs')
    .select('*', { count: 'exact' });

  if (req.profile?.role === 'viewer') {
    query = query.eq('user_id', req.user.id);
  }

  if (req.query.entity) {
    query = query.eq('entity', req.query.entity);
  }
  if (req.query.action) {
    query = query.eq('action', req.query.action);
  }
  if (req.query.user_id) {
    query = query.eq('user_id', req.query.user_id);
  }
  if (req.query.from_date) {
    query = query.gte('created_at', req.query.from_date);
  }
  if (req.query.to_date) {
    query = query.lte('created_at', req.query.to_date);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    if (error.message?.includes('does not exist') || error.code === '42P01') {
      return res.json({ success: true, result: [], total: 0, page, limit });
    }
    return res.status(400).json({ success: false, message: error.message });
  }
  res.json({ success: true, result: data, total: count, page, limit });
});

module.exports = router;
