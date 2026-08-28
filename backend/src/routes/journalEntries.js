const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { getCached, invalidate } = require('@/lib/cache');

router.use(requireAuth);

// JOURNAL ENTRIES CRUD
router.get('/journal-entries', async (req, res) => {
  try {
    const { page = 1, limit = 50, is_posted } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabaseAdmin
      .from('journal_entries')
      .select('*, profiles(full_name, email), journal_entry_lines(*, chart_of_accounts(name, account_code))', { count: 'exact' })
      .order('entry_date', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (is_posted !== undefined) query = query.eq('is_posted', is_posted === 'true');

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ success: true, result: data || [], total: count || 0, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/journal-entries', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { date, description, reference, lines } = req.body;

    if (!description || !lines || !Array.isArray(lines) || lines.length < 2) {
      return res.status(400).json({ success: false, message: 'Description and at least 2 lines are required' });
    }

    const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({ success: false, message: 'Debits must equal credits' });
    }

    const entryNumber = 'JE-' + String(Date.now()).slice(-8);

    const { data: entry, error: entryError } = await supabaseAdmin
      .from('journal_entries')
      .insert({
        entry_number: entryNumber,
        entry_date: date || new Date().toISOString().slice(0, 10),
        description: description.trim(),
        reference: reference?.trim() || null,
        created_by: req.user.id,
      })
      .select()
      .single();

    if (entryError) return res.status(400).json({ success: false, message: entryError.message });

    const linesPayload = lines.map(l => ({
      journal_entry_id: entry.id,
      account_id: l.account_id,
      description: l.description?.trim() || null,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
    }));

    const { error: linesError } = await supabaseAdmin
      .from('journal_entry_lines')
      .insert(linesPayload);

    if (linesError) {
      await supabaseAdmin.from('journal_entries').delete().eq('id', entry.id);
      return res.status(400).json({ success: false, message: linesError.message });
    }

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'create',
      entity: 'journal_entry',
      entityId: entry.id,
      details: { entry_number: entry.entry_number, description: entry.description, total_debit: totalDebit, total_credit: totalCredit },
      ipAddress: req.ip,
    });

    invalidate('journal_entries');
    res.json({ success: true, result: entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/journal-entries/:id', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { date, description, reference, lines } = req.body;
    const entry = await supabaseAdmin.from('journal_entries').select('is_posted').eq('id', req.params.id).single();

    if (entry.error) return res.status(404).json({ success: false, message: 'Entry not found' });
    if (entry.data?.is_posted) return res.status(400).json({ success: false, message: 'Cannot edit posted entry' });

    const updates = {};
    if (date !== undefined) updates.entry_date = date;
    if (description !== undefined) updates.description = description.trim();
    if (reference !== undefined) updates.reference = reference?.trim() || null;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabaseAdmin.from('journal_entries').update(updates).eq('id', req.params.id);
      if (error) return res.status(400).json({ success: false, message: error.message });
    }

    if (lines && Array.isArray(lines)) {
      const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
      const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return res.status(400).json({ success: false, message: 'Debits must equal credits' });
      }

      await supabaseAdmin.from('journal_entry_lines').delete().eq('journal_entry_id', req.params.id);

      const linesPayload = lines.map(l => ({
        journal_entry_id: req.params.id,
        account_id: l.account_id,
        description: l.description?.trim() || null,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      }));

      const { error: linesError } = await supabaseAdmin
        .from('journal_entry_lines')
        .insert(linesPayload);

      if (linesError) return res.status(400).json({ success: false, message: linesError.message });
    }

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'update',
      entity: 'journal_entry',
      entityId: req.params.id,
      details: updates,
      ipAddress: req.ip,
    });

    invalidate('journal_entries');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/journal-entries/:id/post', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { data: entry, error } = await supabaseAdmin
      .from('journal_entries')
      .select('is_posted')
      .eq('id', req.params.id)
      .single();

    if (error) return res.status(404).json({ success: false, message: 'Entry not found' });
    if (entry.is_posted) return res.status(400).json({ success: false, message: 'Entry already posted' });

    const { error: updateError } = await supabaseAdmin
      .from('journal_entries')
      .update({ is_posted: true, posted_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (updateError) return res.status(400).json({ success: false, message: updateError.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'post',
      entity: 'journal_entry',
      entityId: req.params.id,
      details: {},
      ipAddress: req.ip,
    });

    invalidate('journal_entries');
    res.json({ success: true, message: 'Entry posted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/journal-entries/:id', requireRole('admin'), async (req, res) => {
  try {
    const { data: entry } = await supabaseAdmin.from('journal_entries').select('is_posted').eq('id', req.params.id).single();

    if (entry?.is_posted) return res.status(400).json({ success: false, message: 'Cannot delete posted entry' });

    const { error } = await supabaseAdmin.from('journal_entries').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'delete',
      entity: 'journal_entry',
      entityId: req.params.id,
      details: {},
      ipAddress: req.ip,
    });

    invalidate('journal_entries');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
