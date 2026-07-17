const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth } = require('@/middlewares/auth');

router.use(requireAuth);

router.get('/summary', async (req, res) => {
  const [{ data: cash }, { data: digital }] = await Promise.all([
    supabaseAdmin.from('v_cash_summary').select('*').single(),
    supabaseAdmin.from('v_digital_summary').select('*').single(),
  ]);
  res.json({ success: true, result: { cash, digital } });
});

module.exports = router;
