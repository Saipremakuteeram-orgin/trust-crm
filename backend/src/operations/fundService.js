'use strict';

const {
  OperationsServiceError,
  getActorId,
  getActorRole,
  requireActor,
} = require('./postingService');

const FUND_TYPES = Object.freeze(['general', 'restricted', 'endowment', 'designated', 'project']);
const FUND_TYPE_ALIASES = Object.freeze({
  unrestricted: 'general',
  'donor-designated': 'designated',
  donor_designated: 'designated',
  program: 'project',
});
const APPROVED_ALLOCATION_STATUSES = new Set(['approved', 'posted']);
const POSTED_TRANSFER_STATUSES = new Set(['posted']);
const COMMITTED_STATUSES = new Set(['approved', 'committed']);
const ACTIVE_FUND_STATUSES = new Set(['draft', 'active']);

function textValue(value, field, { required = true, maxLength = 200 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw validationError(`${field} is required`, field);
    return null;
  }
  if (typeof value !== 'string') throw validationError(`${field} must be a string`, field);
  const normalized = value.trim();
  if (required && !normalized) throw validationError(`${field} is required`, field);
  if (normalized.length > maxLength) throw validationError(`${field} is too long`, field);
  return normalized || null;
}

function validationError(message, field, details = {}) {
  return new OperationsServiceError(message, {
    code: 'VALIDATION_ERROR',
    statusCode: 400,
    details: { [field]: message, ...details },
  });
}

function numberValue(value, field, { positive = false, nonNegative = false } = {}) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  const invalid = !Number.isFinite(number)
    || (positive && number <= 0)
    || (nonNegative && number < 0);
  if (invalid) {
    const requirement = positive ? 'a positive number' : 'a non-negative number';
    throw validationError(`${field} must be ${requirement}`, field);
  }
  return number;
}

function positiveAmount(value, field = 'amount') {
  return numberValue(value, field, { positive: true });
}

function nonNegativeAmount(value, field) {
  return numberValue(value === undefined || value === null ? 0 : value, field, { nonNegative: true });
}

function normalizeFundType(value) {
  const raw = textValue(value || 'general', 'type', { maxLength: 40 }).toLowerCase();
  const normalized = FUND_TYPE_ALIASES[raw] || raw;
  if (!FUND_TYPES.includes(normalized)) {
    throw validationError(`Unsupported fund type: ${raw}`, 'type');
  }
  return normalized;
}

function rowId(row, ...keys) {
  if (typeof row === 'string') return row;
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null) return row[key];
  }
  return null;
}

function rowTrustId(row) {
  return row?.trust_id || row?.trustId || null;
}

function rowFundId(row) {
  return row?.fund_id || row?.fundId || null;
}

function rowRecordId(row) {
  return row?.record_id || row?.recordId || row?.transaction_id || row?.transactionId || null;
}

function rowAmount(row) {
  const value = row?.amount;
  return value === undefined || value === null ? 0 : Number(value);
}

function roundMoney(value) {
  return Number((Number(value) || 0).toFixed(4));
}

function sumMoney(rows, selector = (row) => row) {
  return roundMoney(rows.reduce((total, row) => total + (Number(selector(row)) || 0), 0));
}

function requireTrustId(value) {
  return textValue(value, 'trustId', { maxLength: 100 });
}

function normalizeDateRange(dateRange = {}) {
  if (!dateRange || typeof dateRange !== 'object' || Array.isArray(dateRange)) {
    throw validationError('dateRange must be an object', 'dateRange');
  }
  const from = dateRange.from || dateRange.start || null;
  const to = dateRange.to || dateRange.end || null;
  const validDate = (value) => value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value));
  if (!validDate(from)) throw validationError('dateRange.from must be an ISO date', 'dateRange');
  if (!validDate(to)) throw validationError('dateRange.to must be an ISO date', 'dateRange');
  if (from && to && from > to) throw validationError('dateRange.from must be before dateRange.to', 'dateRange');
  return { from, to };
}

function rowDate(row) {
  return row?.transaction_date
    || row?.transactionDate
    || row?.committed_at
    || row?.committedAt
    || row?.posted_at
    || row?.postedAt
    || row?.created_at
    || row?.createdAt
    || null;
}

function inDateRange(row, dateRange) {
  const date = rowDate(row);
  if (!date) return true;
  const dateOnly = String(date).slice(0, 10);
  if (dateRange.from && dateOnly < dateRange.from) return false;
  if (dateRange.to && dateOnly > dateRange.to) return false;
  return true;
}

function allocationStatusIsActive(row) {
  return APPROVED_ALLOCATION_STATUSES.has(row?.status || 'posted');
}

function transferStatusIsPosted(row) {
  return POSTED_TRANSFER_STATUSES.has(row?.status);
}

function commitmentStatusIsActive(row) {
  return COMMITTED_STATUSES.has(row?.status);
}

function transactionType(row) {
  return String(row?.transaction_type || row?.transactionType || row?.type || '').toLowerCase();
}

function allocationKind(row) {
  const type = String(row?.allocation_type || row?.allocationType || '').toLowerCase();
  if (type === 'donation') return 'received';
  if (type === 'expense') return 'spent';
  if (type === 'transfer') return 'transfer';
  return transactionType(row) === 'credit' ? 'received' : 'spent';
}

function explicitFundEligibility(record, fund) {
  const metadata = record?.metadata && typeof record.metadata === 'object' ? record.metadata : {};
  const eligible = record?.fund_eligible ?? record?.fundEligible ?? metadata.fund_eligible ?? metadata.fundEligible;
  if (eligible === false) return false;

  const eligibleFundIds = record?.eligible_fund_ids
    || record?.eligibleFundIds
    || metadata.eligible_fund_ids
    || metadata.eligibleFundIds;
  if (Array.isArray(eligibleFundIds) && eligibleFundIds.length > 0 && !eligibleFundIds.includes(rowId(fund, 'id', 'fundId'))) {
    return false;
  }

  const eligibleFundTypes = record?.eligible_fund_types
    || record?.eligibleFundTypes
    || metadata.eligible_fund_types
    || metadata.eligibleFundTypes;
  if (Array.isArray(eligibleFundTypes) && eligibleFundTypes.length > 0) {
    const type = fund?.fund_type || fund?.fundType;
    if (!eligibleFundTypes.includes(type)) return false;
  }

  const recordFundId = record?.fund_id || record?.fundId;
  if (recordFundId && recordFundId !== rowId(fund, 'id', 'fundId')) return false;
  return true;
}

function overrideAllowed(actor, overrideReason) {
  return getActorRole(actor) === 'admin'
    && typeof overrideReason === 'string'
    && overrideReason.trim().length > 0;
}

function requireActiveFund(fund) {
  if (fund?.status !== 'active') {
    throw new OperationsServiceError('Fund must be active before it can affect balances', {
      code: 'FUND_NOT_ACTIVE',
      statusCode: 409,
    });
  }
}

function ensureReason(reason, field = 'reason') {
  const normalized = textValue(reason, field, { maxLength: 2_000 });
  return normalized;
}

function databaseError(error, operation) {
  if (error instanceof OperationsServiceError) throw error;
  const code = error?.code || 'DATABASE_ERROR';
  throw new OperationsServiceError(error?.message || `Failed to ${operation}`, {
    code,
    statusCode: error?.statusCode || (code === 'PGRST116' ? 404 : 400),
    details: error,
  });
}

function singleResult(data, operation) {
  if (!data) {
    throw new OperationsServiceError(`Database did not return a result for ${operation}`, {
      code: 'EMPTY_DATABASE_RESULT',
      statusCode: 502,
    });
  }
  return data;
}

function makeFundCode(name) {
  const slug = String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24) || 'FUND';
  return `${slug}-${Date.now().toString(36).toUpperCase().slice(-8)}`;
}

function financialYearFor(date = new Date()) {
  const value = new Date(date);
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth() + 1;
  return month >= 4 ? `${year}-${String(year + 1).slice(-2)}` : `${year - 1}-${String(year).slice(-2)}`;
}

function createSupabaseFundRepository(client) {
  const supabase = client || require('../config/supabaseAdmin');

  async function queryRows(table, { trustId, fundId, dateRange, order = 'created_at' } = {}) {
    let query = supabase.from(table).select('*');
    if (trustId) query = query.eq('trust_id', trustId);
    if (fundId) query = query.eq('fund_id', fundId);
    if (dateRange?.from) query = query.gte(order, dateRange.from);
    if (dateRange?.to) query = query.lte(order, dateRange.to);
    query = query.order(order, { ascending: true });
    const { data, error } = await query;
    if (error) databaseError(error, `list ${table}`);
    return data || [];
  }

  return {
    async listFunds({ trustId } = {}) {
      let query = supabase.from('operations_funds').select('*').order('name', { ascending: true });
      if (trustId) query = query.eq('trust_id', trustId);
      const { data, error } = await query;
      if (error) databaseError(error, 'list funds');
      return data || [];
    },

    async getFund({ fundId }) {
      const { data, error } = await supabase
        .from('operations_funds')
        .select('*')
        .eq('id', fundId)
        .maybeSingle();
      if (error) databaseError(error, 'get fund');
      return data;
    },

    async listBudgets({ trustId, fundId } = {}) {
      return queryRows('operations_fund_budgets', { trustId, fundId, order: 'created_at' });
    },

    async listAllocations({ trustId, fundId, dateRange } = {}) {
      const rows = await queryRows('operations_fund_allocations', { trustId, fundId, dateRange, order: 'created_at' });
      const transactionIds = rows.map((row) => row.transaction_id).filter(Boolean);
      if (transactionIds.length === 0) return rows;
      const { data: transactions, error } = await supabase
        .from('operations_transactions')
        .select('id, transaction_type')
        .in('id', transactionIds);
      if (error) databaseError(error, 'load fund allocation records');
      const transactionTypes = new Map((transactions || []).map((row) => [row.id, row.transaction_type]));
      return rows.map((row) => ({
        ...row,
        transaction_type: row.transaction_type || transactionTypes.get(row.transaction_id),
      }));
    },

    async listCommitments({ trustId, fundId, dateRange } = {}) {
      return queryRows('operations_fund_commitments', { trustId, fundId, dateRange, order: 'created_at' });
    },

    async listTransfers({ trustId, fundId, dateRange } = {}) {
      let query = supabase.from('operations_fund_transfers').select('*');
      if (trustId) query = query.eq('trust_id', trustId);
      if (fundId) query = query.or(`from_fund_id.eq.${fundId},to_fund_id.eq.${fundId}`);
      if (dateRange?.from) query = query.gte('created_at', dateRange.from);
      if (dateRange?.to) query = query.lte('created_at', dateRange.to);
      const { data, error } = await query.order('created_at', { ascending: true });
      if (error) databaseError(error, 'list fund transfers');
      return data || [];
    },

    async getTransaction({ recordId }) {
      const { data, error } = await supabase
        .from('operations_transactions')
        .select('*')
        .eq('id', recordId)
        .maybeSingle();
      if (error) databaseError(error, 'get financial record');
      return data;
    },

    async createFund(input) {
      const { data, error } = await supabase
        .from('operations_funds')
        .insert({
          trust_id: input.trustId,
          code: input.code,
          name: input.name,
          fund_type: input.type,
          status: 'draft',
          currency: input.currency || 'INR',
          opening_balance: input.openingBalance,
          created_by: input.actorId,
          updated_by: input.actorId,
        })
        .select('*')
        .single();
      if (error) databaseError(error, 'create fund');
      return singleResult(data, 'create fund');
    },

    async createBudget(input) {
      const { data, error } = await supabase
        .from('operations_fund_budgets')
        .insert({
          trust_id: input.trustId,
          fund_id: input.fundId,
          financial_year: input.financialYear,
          amount: input.amount,
          currency: input.currency || 'INR',
          status: 'draft',
          created_by: input.actorId,
          updated_by: input.actorId,
        })
        .select('*')
        .single();
      if (error) databaseError(error, 'create fund budget');
      return singleResult(data, 'create fund budget');
    },

    async createApproval(input) {
      const { data, error } = await supabase
        .from('operations_approval_requests')
        .insert({
          trust_id: input.trustId,
          record_type: input.recordType,
          record_id: input.recordId,
          status: 'pending_approval',
          requested_by: input.actorId,
          reason: input.reason,
        })
        .select('*')
        .single();
      if (error) databaseError(error, 'create fund approval');
      return singleResult(data, 'create fund approval');
    },

    async createApprovalAction(input) {
      const { data, error } = await supabase
        .from('operations_approval_actions')
        .insert({
          trust_id: input.trustId,
          approval_request_id: input.approvalId,
          action: input.action,
          actor_id: input.actorId,
          comment: input.comment || null,
        })
        .select('*')
        .single();
      if (error) databaseError(error, 'record fund approval action');
      return singleResult(data, 'record fund approval action');
    },

    async getApproval({ recordId, recordType }) {
      const { data, error } = await supabase
        .from('operations_approval_requests')
        .select('*')
        .eq('record_id', recordId)
        .eq('record_type', recordType)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) databaseError(error, 'get fund approval');
      return data;
    },

    async updateApproval({ approvalId, actorId, status, reason }) {
      const patch = {
        status,
        reviewed_by: actorId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (reason) patch.reason = reason;
      const { data, error } = await supabase
        .from('operations_approval_requests')
        .update(patch)
        .eq('id', approvalId)
        .select('*')
        .single();
      if (error) databaseError(error, 'update fund approval');
      return singleResult(data, 'update fund approval');
    },

    async activateFund({ fundId, actorId }) {
      const { data, error } = await supabase
        .from('operations_funds')
        .update({ status: 'active', updated_by: actorId, updated_at: new Date().toISOString() })
        .eq('id', fundId)
        .select('*')
        .single();
      if (error) databaseError(error, 'approve fund');
      return singleResult(data, 'approve fund');
    },

    async approveBudget({ fundId, actorId }) {
      const { data, error } = await supabase
        .from('operations_fund_budgets')
        .update({ status: 'approved', updated_by: actorId, updated_at: new Date().toISOString() })
        .eq('fund_id', fundId)
        .eq('status', 'draft')
        .select('*');
      if (error) databaseError(error, 'approve fund budget');
      return data || [];
    },

    async createAllocation(input) {
      const { data, error } = await supabase
        .from('operations_fund_allocations')
        .insert({
          trust_id: input.trustId,
          fund_id: input.fundId,
          transaction_id: input.transactionId,
          donation_id: input.donationId || null,
          allocation_type: input.allocationType,
          status: input.status,
          amount: input.amount,
          currency: input.currency || 'INR',
          created_by: input.actorId,
        })
        .select('*')
        .single();
      if (error) databaseError(error, 'allocate record to fund');
      return singleResult(data, 'allocate record to fund');
    },

    async createDonationAllocation(input) {
      const { data, error } = await supabase
        .from('operations_donation_allocations')
        .insert({
          trust_id: input.trustId,
          donation_id: input.donationId,
          fund_id: input.fundId,
          amount: input.amount,
          currency: input.currency || 'INR',
          created_by: input.actorId,
        })
        .select('*')
        .single();
      if (error) databaseError(error, 'link donation allocation');
      return singleResult(data, 'link donation allocation');
    },

    async createTransfer(input) {
      const { data, error } = await supabase
        .from('operations_fund_transfers')
        .insert({
          trust_id: input.trustId,
          from_fund_id: input.fromFundId,
          to_fund_id: input.toFundId,
          status: 'pending_approval',
          amount: input.amount,
          currency: input.currency || 'INR',
          reason: input.reason,
          created_by: input.actorId,
        })
        .select('*')
        .single();
      if (error) databaseError(error, 'create fund transfer');
      return singleResult(data, 'create fund transfer');
    },

    async getTransfer({ transferId }) {
      const { data, error } = await supabase
        .from('operations_fund_transfers')
        .select('*')
        .eq('id', transferId)
        .maybeSingle();
      if (error) databaseError(error, 'get fund transfer');
      return data;
    },

    async postTransfer(input) {
      const postedAt = input.postedAt || new Date().toISOString();
      const { data: transfer, error: transferError } = await supabase
        .from('operations_fund_transfers')
        .update({
          status: 'posted',
          approved_by: input.actorId,
          posted_at: postedAt,
          updated_at: postedAt,
        })
        .eq('id', input.transferId)
        .eq('status', 'pending_approval')
        .select('*')
        .single();
      if (transferError) databaseError(transferError, 'post fund transfer');

      return singleResult(transfer, 'post fund transfer');
    },

    async createAuditEvent(input) {
      const { data, error } = await supabase
        .from('operations_audit_events')
        .insert({
          trust_id: input.trustId,
          entity_type: input.entityType,
          entity_id: input.entityId,
          action: input.action,
          actor_id: input.actorId || null,
          reason: input.reason || null,
          metadata: input.metadata || {},
        })
        .select('*')
        .single();
      if (error) databaseError(error, 'write fund audit event');
      return data;
    },
  };
}

function createFundService({ repository, now = () => new Date() } = {}) {
  const adapter = repository || createSupabaseFundRepository();

  async function getFundOrThrow(fundId) {
    const normalizedId = textValue(fundId, 'fundId', { maxLength: 100 });
    const fund = await adapter.getFund({ fundId: normalizedId });
    if (!fund) {
      throw new OperationsServiceError('Fund was not found', { code: 'NOT_FOUND', statusCode: 404 });
    }
    if (!ACTIVE_FUND_STATUSES.has(fund.status || 'active')) {
      throw new OperationsServiceError('Fund is closed and cannot receive new operations', {
        code: 'FUND_CLOSED',
        statusCode: 409,
      });
    }
    return fund;
  }

  async function buildFundSummary(fund, { dateRange, includeRows = false } = {}) {
    const trustId = rowTrustId(fund);
    const fundId = rowId(fund, 'id', 'fundId');
    const [budgets, allocations, commitments, transfers] = await Promise.all([
      adapter.listBudgets({ trustId, fundId }),
      adapter.listAllocations({ trustId, fundId, dateRange }),
      adapter.listCommitments({ trustId, fundId, dateRange }),
      adapter.listTransfers({ trustId, fundId, dateRange }),
    ]);

    const filteredAllocations = allocations.filter((row) => allocationStatusIsActive(row) && inDateRange(row, dateRange));
    const received = sumMoney(filteredAllocations.filter((row) => allocationKind(row) === 'received'), rowAmount);
    const spent = sumMoney(filteredAllocations.filter((row) => allocationKind(row) === 'spent'), rowAmount);
    const committed = sumMoney(
      commitments.filter((row) => commitmentStatusIsActive(row) && inDateRange(row, dateRange)),
      rowAmount,
    );
    const fundTransfers = transfers.filter((row) => transferStatusIsPosted(row) && inDateRange(row, dateRange));
    const transfersIn = sumMoney(
      fundTransfers.filter((row) => (row.to_fund_id || row.toFundId) === fundId),
      rowAmount,
    );
    const transfersOut = sumMoney(
      fundTransfers.filter((row) => (row.from_fund_id || row.fromFundId) === fundId),
      rowAmount,
    );
    const budgetRows = budgets.filter((row) => row.status === undefined || row.status === 'approved' || row.status === 'active');
    const budget = sumMoney(budgetRows, rowAmount);
    // A draft fund's opening balance is not official until its Admin approval
    // moves the fund to active.
    const opening = fund.status === 'active'
      ? Number(fund.opening_balance ?? fund.openingBalance ?? 0) || 0
      : 0;
    const available = roundMoney(opening + received + transfersIn - spent - transfersOut - committed);
    const budgetRemaining = roundMoney(budget - spent);

    const result = {
      fundId,
      trustId,
      opening: roundMoney(opening),
      received,
      spent,
      committed,
      transfersIn,
      transfersOut,
      available,
      budget,
      actual: spent,
      budgetRemaining,
      budgetVariance: budgetRemaining,
      budgetVsActual: {
        budget,
        actual: spent,
        remaining: budgetRemaining,
        utilizationPercent: budget > 0 ? roundMoney((spent / budget) * 100) : null,
      },
    };

    if (includeRows) {
      result.allocations = filteredAllocations;
      result.commitments = commitments.filter((row) => inDateRange(row, dateRange));
      // Pending transfers are visible for approval, but only posted transfers
      // participate in the calculated balance above.
      result.transfers = transfers.filter((row) => inDateRange(row, dateRange));
      result.budgets = budgets;
    }
    return result;
  }

  async function getFundSummary({ actor, trustId, fundId, dateRange = {} } = {}) {
    if (actor) requireActor(actor, ['admin', 'accountant', 'viewer'], 'read fund summaries');
    const normalizedTrustId = requireTrustId(trustId);
    const normalizedDateRange = normalizeDateRange(dateRange);
    let funds = await adapter.listFunds({ trustId: normalizedTrustId });
    funds = funds.filter((fund) => rowTrustId(fund) === normalizedTrustId);
    if (fundId) {
      const normalizedFundId = textValue(fundId, 'fundId', { maxLength: 100 });
      funds = funds.filter((fund) => rowId(fund, 'id', 'fundId') === normalizedFundId);
    }
    if (funds.length === 0) {
      if (fundId) throw new OperationsServiceError('Fund was not found', { code: 'NOT_FOUND', statusCode: 404 });
      return {
        trustId: normalizedTrustId,
        opening: 0,
        received: 0,
        spent: 0,
        committed: 0,
        transfersIn: 0,
        transfersOut: 0,
        available: 0,
        budget: 0,
        actual: 0,
        budgetRemaining: 0,
        budgetVariance: 0,
        budgetVsActual: { budget: 0, actual: 0, remaining: 0, utilizationPercent: null },
        funds: [],
      };
    }

    const summaries = await Promise.all(funds.map((fund) => buildFundSummary(fund, { dateRange: normalizedDateRange })));
    const aggregate = {
      trustId: normalizedTrustId,
      opening: sumMoney(summaries, (row) => row.opening),
      received: sumMoney(summaries, (row) => row.received),
      spent: sumMoney(summaries, (row) => row.spent),
      committed: sumMoney(summaries, (row) => row.committed),
      transfersIn: sumMoney(summaries, (row) => row.transfersIn),
      transfersOut: sumMoney(summaries, (row) => row.transfersOut),
      available: sumMoney(summaries, (row) => row.available),
      budget: sumMoney(summaries, (row) => row.budget),
      actual: sumMoney(summaries, (row) => row.actual),
      budgetRemaining: sumMoney(summaries, (row) => row.budgetRemaining),
      budgetVariance: sumMoney(summaries, (row) => row.budgetVariance),
      budgetVsActual: {
        budget: sumMoney(summaries, (row) => row.budget),
        actual: sumMoney(summaries, (row) => row.actual),
        remaining: sumMoney(summaries, (row) => row.budgetRemaining),
        utilizationPercent: sumMoney(summaries, (row) => row.budget) > 0
          ? roundMoney((sumMoney(summaries, (row) => row.actual) / sumMoney(summaries, (row) => row.budget)) * 100)
          : null,
      },
      funds: summaries,
    };
    if (fundId) return { ...summaries[0], funds: summaries };
    return aggregate;
  }

  async function listFunds({ actor, trustId } = {}) {
    requireActor(actor, ['admin', 'accountant', 'viewer'], 'read funds');
    const normalizedTrustId = trustId ? requireTrustId(trustId) : null;
    const funds = await adapter.listFunds({ trustId: normalizedTrustId });
    const scopedFunds = normalizedTrustId
      ? funds.filter((fund) => rowTrustId(fund) === normalizedTrustId)
      : funds;
    return Promise.all(scopedFunds.map(async (fund) => ({
      ...fund,
      summary: await buildFundSummary(fund, { dateRange: { from: null, to: null } }),
    })));
  }

  async function getFund({ actor, fundId, trustId } = {}) {
    requireActor(actor, ['admin', 'accountant', 'viewer'], 'read funds');
    const fund = await getFundOrThrow(fundId);
    const normalizedTrustId = requireTrustId(trustId || rowTrustId(fund));
    if (rowTrustId(fund) !== normalizedTrustId) {
      throw new OperationsServiceError('Fund does not belong to the selected trust', {
        code: 'CROSS_TRUST_OPERATION',
        statusCode: 409,
      });
    }
    return {
      ...fund,
      summary: await buildFundSummary(fund, { dateRange: { from: null, to: null }, includeRows: true }),
    };
  }

  async function createFund({ actor, trustId, name, type, openingBalance = 0, budget } = {}) {
    requireActor(actor, ['admin', 'accountant'], 'create funds');
    const normalizedTrustId = requireTrustId(trustId);
    const normalizedName = textValue(name, 'name', { maxLength: 200 });
    const normalizedType = normalizeFundType(type);
    const normalizedOpening = nonNegativeAmount(openingBalance, 'openingBalance');
    const hasBudget = budget !== undefined && budget !== null && budget !== '';
    const normalizedBudget = hasBudget ? nonNegativeAmount(budget, 'budget') : null;
    const actorId = getActorId(actor);
    const fund = await adapter.createFund({
      trustId: normalizedTrustId,
      code: makeFundCode(normalizedName),
      name: normalizedName,
      type: normalizedType,
      openingBalance: normalizedOpening,
      currency: 'INR',
      actorId,
    });
    const fundId = rowId(fund, 'id', 'fundId');
    if (!fundId) throw new OperationsServiceError('Created fund did not return an ID', { code: 'EMPTY_DATABASE_RESULT', statusCode: 502 });

    let budgetRow = null;
    if (hasBudget) {
      budgetRow = await adapter.createBudget({
        trustId: normalizedTrustId,
        fundId,
        amount: normalizedBudget,
        financialYear: financialYearFor(now()),
        currency: 'INR',
        actorId,
      });
    }

    let approval = null;
    {
      approval = await adapter.createApproval({
        trustId: normalizedTrustId,
        recordType: 'operations_fund',
        recordId: fundId,
        actorId,
        reason: normalizedOpening > 0
          ? 'Fund creation with opening balance requires Admin approval'
          : 'Fund creation requires Admin approval before activation',
      });
      await adapter.createApprovalAction({
        trustId: normalizedTrustId,
        approvalId: rowId(approval, 'id', 'approvalId'),
        actorId,
        action: 'submit',
        comment: 'Fund submitted for Admin approval',
      });
    }
    if (typeof adapter.createAuditEvent === 'function') {
      await adapter.createAuditEvent({
        trustId: normalizedTrustId,
        entityType: 'operations_fund',
        entityId: fundId,
        action: 'create_draft',
        actorId,
        metadata: { openingBalance: normalizedOpening, budget: normalizedBudget },
      });
    }
    return { fund, budget: budgetRow, approval, status: 'draft' };
  }

  async function approveFund({ actor, fundId, approvalId } = {}) {
    requireActor(actor, ['admin'], 'approve funds');
    const fund = await getFundOrThrow(fundId);
    const normalizedTrustId = rowTrustId(fund);
    const approval = approvalId
      ? await adapter.getApproval({ recordId: fundId, recordType: 'operations_fund' })
      : await adapter.getApproval({ recordId: fundId, recordType: 'operations_fund' });
    if (!approval || (approvalId && rowId(approval, 'id', 'approvalId') !== approvalId)) {
      throw new OperationsServiceError('Fund approval was not found', { code: 'NOT_FOUND', statusCode: 404 });
    }
    if (approval.status !== 'pending_approval') {
      throw new OperationsServiceError('Only pending fund approvals can be approved', { code: 'INVALID_STATE', statusCode: 409 });
    }
    const activated = await adapter.activateFund({ fundId, actorId: getActorId(actor) });
    if (typeof adapter.approveBudget === 'function') await adapter.approveBudget({ fundId, actorId: getActorId(actor) });
    const updatedApproval = await adapter.updateApproval({
      approvalId: rowId(approval, 'id', 'approvalId'),
      actorId: getActorId(actor),
      status: 'approved',
    });
    await adapter.createApprovalAction({
      trustId: normalizedTrustId,
      approvalId: rowId(approval, 'id', 'approvalId'),
      actorId: getActorId(actor),
      action: 'approve',
      comment: 'Fund opening balance approved',
    });
    return { fund: activated, approval: updatedApproval, status: 'active' };
  }

  async function allocateToFund({ actor, recordId, fundId, amount, overrideReason } = {}) {
    requireActor(actor, ['admin', 'accountant'], 'allocate records to funds');
    const normalizedRecordId = textValue(recordId, 'recordId', { maxLength: 100 });
    const normalizedAmount = positiveAmount(amount);
    const fund = await getFundOrThrow(fundId);
    requireActiveFund(fund);
    const record = await adapter.getTransaction({ recordId: normalizedRecordId });
    if (!record) throw new OperationsServiceError('Financial record was not found', { code: 'NOT_FOUND', statusCode: 404 });
    if (rowTrustId(record) !== rowTrustId(fund)) {
      throw new OperationsServiceError('Financial record and fund must belong to the same trust', {
        code: 'CROSS_TRUST_OPERATION',
        statusCode: 409,
      });
    }
    if (!['posted', 'approved'].includes(record.status)) {
      throw new OperationsServiceError('Only approved or posted records can be allocated to a fund', {
        code: 'INELIGIBLE_RECORD',
        statusCode: 409,
      });
    }
    const recordAmount = Number(record.amount);
    if (!Number.isFinite(recordAmount) || recordAmount <= 0 || normalizedAmount > recordAmount) {
      throw new OperationsServiceError('Allocation amount cannot exceed the financial record amount', {
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });
    }
    if (!explicitFundEligibility(record, fund)) {
      throw new OperationsServiceError('This expense is not eligible for the selected fund', {
        code: 'INELIGIBLE_EXPENSE',
        statusCode: 409,
      });
    }

    const existingAllocations = await adapter.listAllocations({ trustId: rowTrustId(fund), fundId: null });
    const allocatedForRecord = sumMoney(existingAllocations.filter((row) => (
      rowRecordId(row) === normalizedRecordId
      && !['reversed', 'cancelled'].includes(row.status)
    )), rowAmount);
    if (allocatedForRecord + normalizedAmount > recordAmount) {
      throw new OperationsServiceError('Allocation would exceed the financial record amount', {
        code: 'ALLOCATION_EXCEEDS_RECORD',
        statusCode: 409,
      });
    }

    const type = transactionType(record);
    if (!['credit', 'debit'].includes(type)) {
      throw new OperationsServiceError('Financial record type must be credit or debit', {
        code: 'INELIGIBLE_RECORD',
        statusCode: 409,
      });
    }
    const allocationType = type === 'credit' ? 'donation' : 'expense';
    let override = null;
    if (type === 'debit') {
      const summary = await getFundSummary({ trustId: rowTrustId(fund), fundId });
      if (summary.available < normalizedAmount) {
        if (!overrideAllowed(actor, overrideReason)) {
          throw new OperationsServiceError('Insufficient fund balance for this expense', {
            code: 'INSUFFICIENT_FUND_BALANCE',
            statusCode: 409,
            details: { available: summary.available, requested: normalizedAmount },
          });
        }
        override = overrideReason.trim();
      }
    }

    const allocation = await adapter.createAllocation({
      trustId: rowTrustId(fund),
      fundId: rowId(fund, 'id', 'fundId'),
      transactionId: normalizedRecordId,
      donationId: record.donation_id || record.donationId || null,
      allocationType,
      status: record.status === 'posted' ? 'posted' : 'approved',
      amount: normalizedAmount,
      currency: record.currency || 'INR',
      actorId: getActorId(actor),
      overrideReason: override,
    });

    const donationId = record.donation_id || record.donationId
      || (record.source_type === 'operations_donation' ? record.source_id : null);
    let donationAllocation = null;
    if (allocationType === 'donation' && donationId && typeof adapter.createDonationAllocation === 'function') {
      donationAllocation = await adapter.createDonationAllocation({
        trustId: rowTrustId(fund),
        donationId,
        fundId: rowId(fund, 'id', 'fundId'),
        amount: normalizedAmount,
        currency: record.currency || 'INR',
        actorId: getActorId(actor),
      });
    }
    if (typeof adapter.createAuditEvent === 'function') {
      await adapter.createAuditEvent({
        trustId: rowTrustId(fund),
        entityType: 'operations_fund_allocation',
        entityId: rowId(allocation, 'id', 'allocationId') || normalizedRecordId,
        action: 'allocate_to_fund',
        actorId: getActorId(actor),
        reason: override,
        metadata: { recordId: normalizedRecordId, fundId, amount: normalizedAmount, allocationType },
      });
    }
    return { allocation, donationAllocation, status: allocation.status, overrideReason: override };
  }

  async function createFundTransfer({ actor, fromFundId, toFundId, amount, reason, overrideReason } = {}) {
    requireActor(actor, ['admin', 'accountant'], 'prepare fund transfers');
    const normalizedAmount = positiveAmount(amount);
    const normalizedReason = ensureReason(reason);
    const fromFund = await getFundOrThrow(fromFundId);
    const toFund = await getFundOrThrow(toFundId);
    requireActiveFund(fromFund);
    requireActiveFund(toFund);
    const fromId = rowId(fromFund, 'id', 'fundId');
    const toId = rowId(toFund, 'id', 'fundId');
    if (fromId === toId) {
      throw new OperationsServiceError('Transfer source and destination must be different funds', {
        code: 'INVALID_TRANSFER',
        statusCode: 400,
      });
    }
    if (rowTrustId(fromFund) !== rowTrustId(toFund)) {
      throw new OperationsServiceError('Fund transfers must stay within the same trust', {
        code: 'CROSS_TRUST_OPERATION',
        statusCode: 409,
      });
    }
    const summary = await getFundSummary({ trustId: rowTrustId(fromFund), fundId: fromId });
    let normalizedOverride = null;
    if (summary.available < normalizedAmount) {
      if (!overrideAllowed(actor, overrideReason)) {
        throw new OperationsServiceError('Insufficient source fund balance for this transfer', {
          code: 'INSUFFICIENT_FUND_BALANCE',
          statusCode: 409,
          details: { available: summary.available, requested: normalizedAmount },
        });
      }
      normalizedOverride = overrideReason.trim();
    }
    const transfer = await adapter.createTransfer({
      trustId: rowTrustId(fromFund),
      fromFundId: fromId,
      toFundId: toId,
      amount: normalizedAmount,
      currency: fromFund.currency || 'INR',
      reason: normalizedReason,
      actorId: getActorId(actor),
      overrideReason: normalizedOverride,
    });
    const transferId = rowId(transfer, 'id', 'transferId');
    const approval = await adapter.createApproval({
      trustId: rowTrustId(fromFund),
      recordType: 'operations_fund_transfer',
      recordId: transferId,
      actorId: getActorId(actor),
      reason: normalizedReason,
    });
    await adapter.createApprovalAction({
      trustId: rowTrustId(fromFund),
      approvalId: rowId(approval, 'id', 'approvalId'),
      actorId: getActorId(actor),
      action: 'submit',
      comment: normalizedOverride ? `Admin override: ${normalizedOverride}` : 'Fund transfer submitted for Admin approval',
    });
    return { transfer, approval, status: 'pending_approval', overrideReason: normalizedOverride };
  }

  async function approveFundTransfer({ actor, transferId, overrideReason } = {}) {
    requireActor(actor, ['admin'], 'approve fund transfers');
    const normalizedTransferId = textValue(transferId, 'transferId', { maxLength: 100 });
    const transfer = await adapter.getTransfer({ transferId: normalizedTransferId });
    if (!transfer) throw new OperationsServiceError('Fund transfer was not found', { code: 'NOT_FOUND', statusCode: 404 });
    if (transfer.status !== 'pending_approval') {
      throw new OperationsServiceError('Only pending fund transfers can be approved', { code: 'INVALID_STATE', statusCode: 409 });
    }
    const fromFund = await getFundOrThrow(transfer.from_fund_id || transfer.fromFundId);
    const toFund = await getFundOrThrow(transfer.to_fund_id || transfer.toFundId);
    requireActiveFund(fromFund);
    requireActiveFund(toFund);
    if (rowTrustId(fromFund) !== rowTrustId(toFund) || rowTrustId(fromFund) !== rowTrustId(transfer)) {
      throw new OperationsServiceError('Fund transfers must stay within the same trust', {
        code: 'CROSS_TRUST_OPERATION',
        statusCode: 409,
      });
    }
    const summary = await getFundSummary({ trustId: rowTrustId(fromFund), fundId: rowId(fromFund, 'id', 'fundId') });
    const amount = rowAmount(transfer);
    const storedOverride = transfer.overrideReason || transfer.override_reason || null;
    const effectiveOverride = overrideReason || storedOverride;
    if (summary.available < amount && !overrideAllowed(actor, effectiveOverride)) {
      throw new OperationsServiceError('Insufficient source fund balance for this transfer', {
        code: 'INSUFFICIENT_FUND_BALANCE',
        statusCode: 409,
        details: { available: summary.available, requested: amount },
      });
    }
    const posted = await adapter.postTransfer({
      transferId: normalizedTransferId,
      trustId: rowTrustId(fromFund),
      fromFundId: rowId(fromFund, 'id', 'fundId'),
      toFundId: rowId(toFund, 'id', 'fundId'),
      amount,
      currency: transfer.currency || 'INR',
      actorId: getActorId(actor),
      postedAt: now().toISOString(),
      overrideReason: effectiveOverride,
    });
    const approval = await adapter.getApproval({ recordId: normalizedTransferId, recordType: 'operations_fund_transfer' });
    let updatedApproval = approval;
    if (approval) {
      updatedApproval = await adapter.updateApproval({
        approvalId: rowId(approval, 'id', 'approvalId'),
        actorId: getActorId(actor),
        status: 'approved',
        reason: effectiveOverride || undefined,
      });
      await adapter.createApprovalAction({
        trustId: rowTrustId(fromFund),
        approvalId: rowId(approval, 'id', 'approvalId'),
        actorId: getActorId(actor),
        action: 'approve',
        comment: effectiveOverride ? `Admin override: ${effectiveOverride}` : 'Fund transfer approved and posted',
      });
    }
    return { transfer: posted, approval: updatedApproval, status: 'posted', overrideReason: effectiveOverride || null };
  }

  return {
    createFund,
    approveFund,
    allocateToFund,
    createFundTransfer,
    approveFundTransfer,
    listFunds,
    getFund,
    getFundSummary,
  };
}

let defaultService;
function getDefaultService() {
  if (!defaultService) defaultService = createFundService();
  return defaultService;
}

module.exports = {
  FUND_TYPES,
  FUND_TYPE_ALIASES,
  createFundService,
  createSupabaseFundRepository,
  createFund: (input) => getDefaultService().createFund(input),
  allocateToFund: (input) => getDefaultService().allocateToFund(input),
  createFundTransfer: (input) => getDefaultService().createFundTransfer(input),
  getFundSummary: (input) => getDefaultService().getFundSummary(input),
};
