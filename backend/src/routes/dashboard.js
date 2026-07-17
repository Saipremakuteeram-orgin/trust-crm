const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');

router.use(requireAuth);

router.get('/summary', async (req, res) => {
  const [{ data: cash }, { data: digital }] = await Promise.all([
    supabaseAdmin.from('v_cash_summary').select('*').single(),
    supabaseAdmin.from('v_digital_summary').select('*').single(),
  ]);
  res.json({ success: true, result: { cash, digital } });
});

router.patch('/opening-balance', requireRole('admin'), async (req, res) => {
  const { type, amount } = req.body;
  if (!['cash', 'digital'].includes(type)) {
    return res.status(400).json({ success: false, message: 'Type must be cash or digital' });
  }
  if (typeof amount !== 'number' || amount < 0) {
    return res.status(400).json({ success: false, message: 'Amount must be a non-negative number' });
  }
  const column = type === 'cash' ? 'cash_opening_balance' : 'digital_opening_balance';
  const { error } = await supabaseAdmin
    .from('settings')
    .upsert({ key: column, value: amount.toString(), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true });
});

module.exports = router;
