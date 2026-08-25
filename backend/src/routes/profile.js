const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');

router.use(requireAuth);

router.get('/nav-order', async (req, res) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('nav_order')
      .eq('id', req.user.id)
      .single();

    res.json({ success: true, order: profile?.nav_order || [] });
  } catch (err) {
    console.error('Get nav-order error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load nav order' });
  }
});

router.put('/nav-order', requireRole('admin', 'accountant'), async (req, res) => {
  const { order } = req.body;

  if (!Array.isArray(order) || !order.every((item) => typeof item === 'string' && item.trim() !== '')) {
    return res.status(400).json({ success: false, message: 'Order must be an array of non-empty strings' });
  }

  try {
    const trimmed = order.map((item) => item.trim());
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ nav_order: trimmed })
      .eq('id', req.user.id);

    if (error) throw error;

    res.json({ success: true, order: trimmed });
  } catch (err) {
    console.error('Update nav-order error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to save nav order' });
  }
});

module.exports = router;
