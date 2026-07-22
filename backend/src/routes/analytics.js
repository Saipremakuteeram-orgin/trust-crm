const express = require('express');
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth } = require('@/middlewares/auth');
const { getCached, invalidate } = require('@/lib/cache');

const router = express.Router();
router.use(requireAuth);

function startOfDay(d) {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
}

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function getMonthKey(d) {
  return d.toISOString().slice(0, 7);
}

router.get('/', async (req, res) => {
  try {
    const result = await getCached('analytics:overview', 15000, async () => {
      const { data: txns, error } = await supabaseAdmin
        .from('transactions')
        .select('id, type, mode, amount, party, category_id, txn_date, created_at');

      if (error) throw error;

      const { data: catRows } = await supabaseAdmin.from('categories').select('id, name');
      const catMap = {};
      (catRows || []).forEach(c => { catMap[c.id] = c.name; });

      const rows = (txns || []).map(t => ({
        ...t,
        _date: new Date(t.txn_date),
        _amount: parseFloat(t.amount) || 0,
        _catName: catMap[t.category_id] || 'Uncategorized',
      }));

      if (rows.length === 0) {
        return {
          overview: { total_credit: 0, total_debit: 0, net_balance: 0, txn_count: 0 },
          monthly_trend: [],
          category_breakdown: [],
          payment_mode_split: { cash: { credit: 0, debit: 0 }, digital: { credit: 0, debit: 0 } },
          top_parties: [],
          weekly_trend: [],
          daily_avg: { credit: 0, debit: 0 },
        };
      }

      let total_credit = 0;
      let total_debit = 0;

      const monthlyMap = {};
      const catMap2 = {};
      const modeMap = {};
      const partyMap = {};

      rows.forEach(r => {
        const mk = getMonthKey(r._date);
        if (!monthlyMap[mk]) monthlyMap[mk] = { month: mk, credit: 0, debit: 0, net: 0 };

        if (r.type === 'credit') {
          total_credit += r._amount;
          monthlyMap[mk].credit += r._amount;
          modeMap[r.mode] = modeMap[r.mode] || { credit: 0, debit: 0 };
          modeMap[r.mode].credit += r._amount;
        } else if (r.type === 'debit') {
          total_debit += r._amount;
          monthlyMap[mk].debit += r._amount;
          modeMap[r.mode] = modeMap[r.mode] || { credit: 0, debit: 0 };
          modeMap[r.mode].debit += r._amount;

          catMap2[r._catName] = (catMap2[r._catName] || 0) + r._amount;
        }

        if (r.party) {
          partyMap[r.party] = (partyMap[r.party] || 0) + r._amount;
        }
      });

      Object.values(monthlyMap).forEach(m => { m.net = m.credit - m.debit; });
      const monthly_trend = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

      const category_breakdown = Object.entries(catMap2)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      const payment_mode_split = {
        cash: modeMap['cash'] || { credit: 0, debit: 0 },
        digital: modeMap['digital'] || { credit: 0, debit: 0 },
      };

      const top_parties = Object.entries(partyMap)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

      const now = rows.reduce((max, r) => r._date > max ? r._date : max, rows[0]._date);
      const weekStart = new Date(now);
      weekStart.setUTCDate(weekStart.getUTCDate() - 6);
      weekStart.setUTCHours(0, 0, 0, 0);

      const weeklyDayMap = {};
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setUTCDate(d.getUTCDate() + i);
        const key = toISODate(d);
        weeklyDayMap[key] = { date: key, credit: 0, debit: 0 };
      }
      rows.forEach(r => {
        const dk = toISODate(r._date);
        if (weeklyDayMap[dk]) {
          if (r.type === 'credit') weeklyDayMap[dk].credit += r._amount;
          else weeklyDayMap[dk].debit += r._amount;
        }
      });
      const weekly_trend = Object.values(weeklyDayMap).sort((a, b) => a.date.localeCompare(b.date));

      const uniqueDays = new Set(rows.map(r => toISODate(r._date))).size || 1;
      const daily_avg = {
        credit: Math.round((total_credit / uniqueDays) * 100) / 100,
        debit: Math.round((total_debit / uniqueDays) * 100) / 100,
      };

      return {
        overview: {
          total_credit,
          total_debit,
          net_balance: total_credit - total_debit,
          txn_count: rows.length,
        },
        monthly_trend,
        category_breakdown,
        payment_mode_split,
        top_parties,
        weekly_trend,
        daily_avg,
      };
    });

    res.set('Cache-Control', 'private, max-age=15');
    res.json({ success: true, result });
  } catch (err) {
    console.error('Analytics error:', err.message);
    res.status(500).json({ success: false, message: 'Analytics computation failed' });
  }
});

module.exports = router;
