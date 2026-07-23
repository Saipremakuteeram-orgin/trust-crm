const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');

router.use(requireAuth);

router.get('/summary', async (req, res) => {
  const [{ data: cash }, { data: digital }] = await Promise.all([
    supabaseAdmin.from('v_cash_summary').select('*').single(),
    supabaseAdmin.from('v_digital_summary').select('*').single(),
  ]);
  res.set('Cache-Control', 'private, max-age=10');
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

  logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    entity: 'settings',
    details: { key: column, value: amount },
    ipAddress: req.ip,
  });

  res.json({ success: true });
});

router.get('/recurring-commitment', async (req, res) => {
  try {
    const { data: templates, error } = await supabaseAdmin
      .from('recurring_transactions')
      .select('id, name, type, mode, amount, frequency, enabled')
      .eq('enabled', true);
    if (error) throw error;

    function toMonthly(amount, frequency) {
      const a = Number(amount);
      switch (frequency) {
        case 'daily': return a * 30;
        case 'weekly': return a * 4.33;
        case 'biweekly': return a * 2.17;
        case 'monthly': return a;
        case 'quarterly': return a / 3;
        case 'yearly': return a / 12;
        default: return a;
      }
    }

    let monthlyCredit = 0;
    let monthlyDebit = 0;
    for (const t of (templates || [])) {
      const monthly = toMonthly(t.amount, t.frequency);
      if (t.type === 'credit') monthlyCredit += monthly;
      else monthlyDebit += monthly;
    }

    res.set('Cache-Control', 'private, max-age=30');
    res.json({
      success: true,
      result: {
        monthly_credit: Math.round(monthlyCredit * 100) / 100,
        monthly_debit: Math.round(monthlyDebit * 100) / 100,
        net: Math.round((monthlyCredit - monthlyDebit) * 100) / 100,
        active_count: (templates || []).length,
      },
    });
  } catch (err) {
    console.error('Recurring commitment error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to compute recurring commitment' });
  }
});

module.exports = router;
