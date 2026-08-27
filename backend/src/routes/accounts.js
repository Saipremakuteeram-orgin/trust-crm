const express = require('express');
const router = express.Router();
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { getCached, invalidate } = require('@/lib/cache');

router.use(requireAuth);

// Helper to build account tree
function buildAccountTree(accounts, parentId = null) {
  return accounts
    .filter(a => a.parent_id === parentId)
    .map(a => ({
      ...a,
      children: buildAccountTree(accounts, a.id)
    }));
}

// LIST chart of accounts
router.get('/accounts', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('chart_of_accounts')
      .select('*')
      .order('account_code');
    if (error) throw error;

    const tree = buildAccountTree(data || []);
    res.json({ success: true, result: { flat: data || [], tree } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CREATE account
router.post('/accounts', requireRole('admin'), async (req, res) => {
  try {
    const { account_code, name, type, parent_id } = req.body;
    if (!account_code || !name || !type) {
      return res.status(400).json({ success: false, message: 'Account code, name, and type are required' });
    }

    const validTypes = ['asset', 'liability', 'equity', 'income', 'expense'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid account type' });
    }

    const { data, error } = await supabaseAdmin
      .from('chart_of_accounts')
      .insert({
        account_code: account_code.trim(),
        name: name.trim(),
        type,
        parent_id: parent_id || null
      })
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'create',
      entity: 'chart_of_account',
      entityId: data.id,
      details: { account_code: data.account_code, name: data.name, type: data.type },
      ipAddress: req.ip,
    });

    invalidate('chart_of_accounts');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// UPDATE account
router.patch('/accounts/:id', requireRole('admin'), async (req, res) => {
  try {
    const updates = {};
    const { account_code, name, type, parent_id, is_active } = req.body;

    if (account_code !== undefined) updates.account_code = account_code.trim();
    if (name !== undefined) updates.name = name.trim();
    if (type !== undefined) {
      const validTypes = ['asset', 'liability', 'equity', 'income', 'expense'];
      if (!validTypes.includes(type)) return res.status(400).json({ success: false, message: 'Invalid account type' });
      updates.type = type;
    }
    if (parent_id !== undefined) updates.parent_id = parent_id || null;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await supabaseAdmin
      .from('chart_of_accounts')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'update',
      entity: 'chart_of_account',
      entityId: data.id,
      details: updates,
      ipAddress: req.ip,
    });

    invalidate('chart_of_accounts');
    res.json({ success: true, result: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE account
router.delete('/accounts/:id', requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('chart_of_accounts')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'delete',
      entity: 'chart_of_account',
      entityId: req.params.id,
      details: { account_code: data?.account_code, name: data?.name },
      ipAddress: req.ip,
    });

    invalidate('chart_of_accounts');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// LIST journal entries
router.get('/journal-entries', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .select('*, journal_entry_lines(*)')
      .order('entry_date', { ascending: false });

    if (error) throw error;
    res.json({ success: true, result: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CREATE journal entry (draft)
router.post('/journal-entries', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { entry_date, description, reference, lines } = req.body;

    if (!description || !lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ success: false, message: 'Description and at least one line are required' });
    }

    // Validate that debits equal credits
    const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({ success: false, message: 'Total debits must equal total credits' });
    }

    const entryNumber = generate_journal_entry_number();

    const { data: entry, error: entryError } = await supabaseAdmin
      .from('journal_entries')
      .insert({
        entry_number: entryNumber,
        entry_date: entry_date || new Date().toISOString().slice(0, 10),
        description: description.trim(),
        reference: reference || null,
        is_posted: false,
        created_by: req.user.id
      })
      .select()
      .single();

    if (entryError) return res.status(400).json({ success: false, message: entryError.message });

    // Insert lines
    const linesToInsert = lines.map(line => ({
      journal_entry_id: entry.id,
      account_id: line.account_id,
      description: line.description || null,
      debit: Number(line.debit) || 0,
      credit: Number(line.credit) || 0
    }));

    const { error: linesError } = await supabaseAdmin
      .from('journal_entry_lines')
      .insert(linesToInsert);

    if (linesError) {
      // Rollback: delete the entry
      await supabaseAdmin.from('journal_entries').delete().eq('id', entry.id);
      return res.status(400).json({ success: false, message: linesError.message });
    }

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'create',
      entity: 'journal_entry',
      entityId: entry.id,
      details: { entry_number: entry.entry_number, description: entry.description },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: { ...entry, lines: linesToInsert } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST journal entry (post it)
router.post('/journal-entries/:id/post', requireRole('admin'), async (req, res) => {
  try {
    const { data: entry, error } = await supabaseAdmin
      .from('journal_entries')
      .update({ is_posted: true, posted_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('is_posted', false)
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'post',
      entity: 'journal_entry',
      entityId: entry.id,
      details: { entry_number: entry.entry_number },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH journal entry (update draft)
router.patch('/journal-entries/:id', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { description, reference, lines } = req.body;
    const updates = {};

    if (description !== undefined) updates.description = description.trim();
    if (reference !== undefined) updates.reference = reference || null;

    const { data: entry, error } = await supabaseAdmin
      .from('journal_entries')
      .update(updates)
      .eq('id', req.params.id)
      .eq('is_posted', false)
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    // If lines provided, replace them
    if (lines && Array.isArray(lines)) {
      const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
      const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return res.status(400).json({ success: false, message: 'Total debits must equal total credits' });
      }

      await supabaseAdmin.from('journal_entry_lines').delete().eq('journal_entry_id', entry.id);

      const linesToInsert = lines.map(line => ({
        journal_entry_id: entry.id,
        account_id: line.account_id,
        description: line.description || null,
        debit: Number(line.debit) || 0,
        credit: Number(line.credit) || 0
      }));

      const { error: linesError } = await supabaseAdmin.from('journal_entry_lines').insert(linesToInsert);
      if (linesError) return res.status(400).json({ success: false, message: linesError.message });
    }

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'update',
      entity: 'journal_entry',
      entityId: entry.id,
      details: { entry_number: entry.entry_number },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE journal entry (only drafts)
router.delete('/journal-entries/:id', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .delete()
      .eq('id', req.params.id)
      .eq('is_posted', false)
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'delete',
      entity: 'journal_entry',
      entityId: req.params.id,
      details: { entry_number: data?.entry_number },
      ipAddress: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// TRIAL BALANCE
router.get('/reports/trial-balance', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('v_account_balances')
      .select('*')
      .order('account_code');

    if (error) throw error;

    const totalDebit = (data || []).reduce((sum, a) => sum + (Number(a.total_debit) || 0), 0);
    const totalCredit = (data || []).reduce((sum, a) => sum + (Number(a.total_credit) || 0), 0);

    res.json({
      success: true,
      result: {
        accounts: data || [],
        total_debit: totalDebit,
        total_credit: totalCredit,
        is_balanced: Math.abs(totalDebit - totalCredit) < 0.01
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
