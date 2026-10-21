'use strict';

const express = require('express');
const {
  requireOperationsFeature,
  requireOperationsRole,
  requireOperationsTrust,
} = require('../middlewares/operationsAuth');

const REPORT_STATUSES = new Set([
  'posted', 'reversed', 'draft', 'pending_approval', 'approved', 'rejected',
  'cancelled', 'verified', 'sent', 'partially_paid', 'paid', 'overdue',
]);

function reportError(message, statusCode = 400, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = 'REPORT_VALIDATION_ERROR';
  error.details = details;
  return error;
}

function text(value, field, { maxLength = 200 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw reportError(`${field} must be text`);
  }
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw reportError(`${field} is too long`);
  return normalized;
}

function dateValue(value, field) {
  const normalized = text(value, field, { maxLength: 30 });
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw reportError(`${field} must use YYYY-MM-DD format`);
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw reportError(`${field} must be a valid calendar date`);
  }
  return normalized;
}

function normalizeReportFilters(input = {}) {
  const from = dateValue(input.from, 'from');
  const to = dateValue(input.to, 'to');
  if (from && to && from > to) throw reportError('from must be before to');

  const status = text(input.status, 'status', { maxLength: 40 })?.toLowerCase() || null;
  if (status && !REPORT_STATUSES.has(status)) throw reportError(`Unsupported report status: ${status}`);

  return {
    trustId: text(input.trustId ?? input.trust_id, 'trustId', { maxLength: 120 }),
    from,
    to,
    fundId: text(input.fundId ?? input.fund_id, 'fundId', { maxLength: 120 }),
    type: text(input.type, 'type', { maxLength: 80 })?.toLowerCase() || null,
    status,
    paymentMode: text(input.paymentMode ?? input.payment_mode, 'paymentMode', { maxLength: 40 })?.toLowerCase() || null,
    purpose: text(input.purpose ?? input.donationPurpose ?? input.donation_purpose, 'purpose', { maxLength: 200 })?.toLowerCase() || null,
    payrollPeriod: text(input.payrollPeriod ?? input.payroll_period, 'payrollPeriod', { maxLength: 80 }),
    invoiceStatus: text(input.invoiceStatus ?? input.invoice_status, 'invoiceStatus', { maxLength: 40 })?.toLowerCase() || null,
    financialYear: text(input.financialYear ?? input.financial_year, 'financialYear', { maxLength: 20 }),
  };
}

function rowId(row, ...keys) {
  if (typeof row === 'string') return row;
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null) return row[key];
  }
  return null;
}

function rowTrustId(row) {
  return rowId(row, 'trust_id', 'trustId');
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Number(numberValue(value).toFixed(4));
}

function inDateRange(value, from, to) {
  if (!value) return true;
  const date = String(value).slice(0, 10);
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function containsText(value, query) {
  if (!query) return true;
  return String(value || '').toLowerCase().includes(query);
}

function financialYearFor(date, configuredStartMonth = 4) {
  if (!date) return null;
  const source = String(date).slice(0, 10);
  const year = Number(source.slice(0, 4));
  const month = Number(source.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const startMonth = Number(configuredStartMonth);
  const financialYearStartMonth = Number.isInteger(startMonth) && startMonth >= 1 && startMonth <= 12 ? startMonth : 4;
  const startYear = month >= financialYearStartMonth ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function trustFinancialYearStartMonth(trust) {
  const value = trust?.financial_year_start_month ?? trust?.financialYearStartMonth;
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : 4;
}

function activeAllocation(row) {
  return !row?.status || ['approved', 'posted'].includes(String(row.status).toLowerCase());
}

function normalizeData(data = {}) {
  return {
    trusts: Array.isArray(data.trusts) ? data.trusts : [],
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    journalEntries: Array.isArray(data.journalEntries || data.journal_entries) ? (data.journalEntries || data.journal_entries) : [],
    fundAllocations: Array.isArray(data.fundAllocations || data.fund_allocations) ? (data.fundAllocations || data.fund_allocations) : [],
    donationAllocations: Array.isArray(data.donationAllocations || data.donation_allocations) ? (data.donationAllocations || data.donation_allocations) : [],
    donations: Array.isArray(data.donations) ? data.donations : [],
    invoices: Array.isArray(data.invoices) ? data.invoices : [],
    payrollRuns: Array.isArray(data.payrollRuns || data.payroll_runs) ? (data.payrollRuns || data.payroll_runs) : [],
    payrollPeriods: Array.isArray(data.payrollPeriods || data.payroll_periods) ? (data.payrollPeriods || data.payroll_periods) : [],
  };
}

function sourceForTransaction(transaction, data, maps, trustId) {
  const sourceType = String(transaction?.source_type || transaction?.sourceType || '').toLowerCase();
  const sourceId = rowId(transaction, 'source_id', 'sourceId');
  const transactionId = rowId(transaction, 'id', 'transactionId');
  const trustedSource = (source) => source && rowTrustId(source) === trustId ? source : null;
  let donation = sourceType.includes('donation') && sourceId ? trustedSource(maps.donationsById.get(sourceId)) : null;
  let invoice = sourceType.includes('invoice') && sourceId ? trustedSource(maps.invoicesById.get(sourceId)) : null;
  let payrollRun = sourceType.includes('payroll') && sourceId ? trustedSource(maps.payrollRunsById.get(sourceId)) : null;

  if (!donation) donation = trustedSource(maps.donationsByTransactionId.get(transactionId));
  if (!invoice) invoice = trustedSource(maps.invoicesByTransactionId.get(transactionId));
  if (!payrollRun) payrollRun = trustedSource(maps.payrollRunsByJournalId.get(rowId(transaction, 'journal_entry_id', 'journalEntryId')));

  const source = donation || invoice || payrollRun || null;
  const recordType = donation ? 'donation' : invoice ? 'invoice' : payrollRun ? 'payroll' : sourceType === 'reversal' ? 'reversal' : 'transaction';
  const sourceStatus = source?.status || null;
  const period = payrollRun
    ? (payrollRun.period_name
      || payrollRun.periodName
      || (rowTrustId(maps.payrollPeriodsById.get(rowId(payrollRun, 'payroll_period_id', 'payrollPeriodId'))) === trustId
        ? maps.payrollPeriodsById.get(rowId(payrollRun, 'payroll_period_id', 'payrollPeriodId'))?.period_name
        : null)
      || null)
    : null;
  const metadata = transaction?.metadata && typeof transaction.metadata === 'object' ? transaction.metadata : {};
  const purpose = donation?.purpose
    || invoice?.purpose
    || invoice?.description
    || metadata.purpose
    || transaction?.description
    || payrollRun?.description
    || null;
  const paymentMode = donation?.payment_mode
    || donation?.paymentMode
    || metadata.payment_mode
    || metadata.paymentMode
    || null;

  return {
    source,
    donation,
    invoice,
    payrollRun,
    recordType,
    sourceStatus,
    payrollPeriod: period,
    purpose,
    paymentMode,
    sourceType,
    sourceId: sourceId || rowId(source, 'id', 'donationId', 'invoiceId', 'payrollRunId'),
    metadata,
    data,
  };
}

function buildReportRows(data, filters) {
  const normalized = normalizeData(data);
  const trustsById = new Map(normalized.trusts.map((trust) => [rowId(trust, 'id'), trust]));
  const transactionsById = new Map(normalized.transactions.map((transaction) => [rowId(transaction, 'id', 'transactionId'), transaction]));
  const maps = {
    donationsById: new Map(normalized.donations.map((row) => [rowId(row, 'id', 'donationId'), row])),
    donationsByTransactionId: new Map(normalized.donations.filter((row) => row.transaction_id || row.transactionId).map((row) => [row.transaction_id || row.transactionId, row])),
    invoicesById: new Map(normalized.invoices.map((row) => [rowId(row, 'id', 'invoiceId'), row])),
    invoicesByTransactionId: new Map(normalized.invoices.filter((row) => row.transaction_id || row.transactionId).map((row) => [row.transaction_id || row.transactionId, row])),
    payrollRunsById: new Map(normalized.payrollRuns.map((row) => [rowId(row, 'id', 'payrollRunId'), row])),
    payrollRunsByJournalId: new Map(normalized.payrollRuns.filter((row) => row.journal_entry_id || row.journalEntryId).map((row) => [row.journal_entry_id || row.journalEntryId, row])),
    payrollPeriodsById: new Map(normalized.payrollPeriods.map((row) => [rowId(row, 'id', 'payrollPeriodId'), row])),
  };

  const fundAllocationByTransaction = new Map();
  const fundAllocationByDonation = new Map();
  for (const allocation of normalized.fundAllocations) {
    if (!activeAllocation(allocation) || !rowTrustId(allocation)) continue;
    const transactionId = rowId(allocation, 'transaction_id', 'transactionId');
    const donationId = rowId(allocation, 'donation_id', 'donationId');
    if (transactionId) fundAllocationByTransaction.set(transactionId, [...(fundAllocationByTransaction.get(transactionId) || []), allocation]);
    if (donationId) fundAllocationByDonation.set(donationId, [...(fundAllocationByDonation.get(donationId) || []), allocation]);
  }
  const donationAllocationByDonation = new Map();
  for (const allocation of normalized.donationAllocations) {
    if (!rowTrustId(allocation)) continue;
    const donationId = rowId(allocation, 'donation_id', 'donationId');
    if (donationId) donationAllocationByDonation.set(donationId, [...(donationAllocationByDonation.get(donationId) || []), allocation]);
  }

  const seenTransactions = new Set();
  const seenSourceRecords = new Set();
  const rows = [];
  for (const journal of normalized.journalEntries) {
    if (String(journal.status || '').toLowerCase() !== 'posted') continue;
    const trustId = rowTrustId(journal);
    if (!trustId || (filters.trustId && trustId !== filters.trustId)) continue;
    if (!inDateRange(journal.entry_date || journal.entryDate, filters.from, filters.to)) continue;

    const transactionId = rowId(journal, 'transaction_id', 'transactionId');
    const transaction = transactionId ? transactionsById.get(transactionId) : null;
    if (transaction && rowTrustId(transaction) !== trustId) continue;
    if (transaction && !['posted', 'reversed'].includes(String(transaction.status || '').toLowerCase())) continue;
    const sourceData = sourceForTransaction(transaction, normalized, maps, trustId);
    const sourceDeduplicationId = sourceData.recordType === 'reversal'
      ? sourceData.metadata.reverses_record_id || transactionId
      : ['donation', 'invoice', 'payroll'].includes(sourceData.recordType) && sourceData.sourceId
        ? sourceData.sourceId
        : null;
    const sourceDeduplicationKey = sourceDeduplicationId
      ? `${trustId}:${sourceData.recordType}:${sourceDeduplicationId}`
      : null;
    const type = String(transaction?.transaction_type || transaction?.transactionType || '').toLowerCase()
      || (numberValue(journal.total_credit) > numberValue(journal.total_debit) ? 'credit' : 'debit');
    const amount = numberValue(transaction?.amount || Math.max(numberValue(journal.total_debit), numberValue(journal.total_credit)));
    const sourceId = sourceData.sourceId;
    const allocationRows = transactionId
      ? (fundAllocationByTransaction.get(transactionId) || []).filter((allocation) => rowTrustId(allocation) === trustId)
      : [];
    const donationFundAllocations = sourceData.donation
      ? (fundAllocationByDonation.get(sourceId) || []).filter((allocation) => rowTrustId(allocation) === trustId)
      : [];
    const directDonationAllocations = sourceData.donation
      ? (donationAllocationByDonation.get(sourceId) || []).filter((allocation) => rowTrustId(allocation) === trustId)
      : [];
    const selectedAllocations = allocationRows.length > 0
      ? allocationRows
      : (donationFundAllocations.length > 0 ? donationFundAllocations : directDonationAllocations);
    const fundIds = [...new Set([
      rowId(transaction, 'fund_id', 'fundId'),
      ...selectedAllocations.map((allocation) => rowId(allocation, 'fund_id', 'fundId')),
    ].filter(Boolean))];
    if (filters.fundId && !fundIds.includes(filters.fundId)) continue;

    const date = journal.entry_date || journal.entryDate || transaction?.transaction_date || transaction?.transactionDate || null;
    const row = {
      id: rowId(journal, 'id', 'journalEntryId') || transactionId,
      journal_entry_id: rowId(journal, 'id', 'journalEntryId'),
      transaction_id: transactionId,
      record_id: sourceId || transactionId || rowId(journal, 'id', 'journalEntryId'),
      record_type: sourceData.recordType,
      trust_id: trustId,
      trust_name: trustsById.get(trustId)?.name || trustsById.get(trustId)?.legal_name || trustId,
      date,
      type,
      status: 'posted',
      source_status: sourceData.sourceStatus,
      amount: roundMoney(amount),
      debit: type === 'debit' ? roundMoney(amount) : 0,
      credit: type === 'credit' ? roundMoney(amount) : 0,
      fund_id: fundIds.length === 1 ? fundIds[0] : null,
      fund_ids: fundIds,
      allocated_amount: roundMoney(selectedAllocations.reduce((sum, allocation) => sum + numberValue(allocation.amount), 0)),
      payment_mode: sourceData.paymentMode,
      purpose: sourceData.purpose,
      payroll_period: sourceData.payrollPeriod,
      invoice_status: sourceData.invoice?.status || null,
       financial_year: financialYearFor(date, trustFinancialYearStartMonth(trustsById.get(trustId))),
      is_reversal: sourceData.recordType === 'reversal' || Boolean(sourceData.metadata.reverses_record_id || sourceData.metadata.reversal_reason),
      reversal_of: sourceData.metadata.reverses_record_id || null,
      description: transaction?.description || journal.description || null,
    };

    if (filters.type && filters.type !== row.type && filters.type !== row.record_type) continue;
    if (filters.status && filters.status !== row.status && filters.status !== String(row.source_status || '').toLowerCase()) continue;
    if (filters.paymentMode && String(row.payment_mode || '').toLowerCase() !== filters.paymentMode) continue;
    if (!containsText(row.purpose, filters.purpose) && !containsText(row.description, filters.purpose)) continue;
    if (filters.payrollPeriod && row.payroll_period !== filters.payrollPeriod) continue;
    if (filters.invoiceStatus && String(row.invoice_status || '').toLowerCase() !== filters.invoiceStatus) continue;
    if (filters.financialYear && row.financial_year !== filters.financialYear) continue;
    if (transactionId && seenTransactions.has(transactionId)) continue;
    if (sourceDeduplicationKey && seenSourceRecords.has(sourceDeduplicationKey)) continue;
    if (transactionId) seenTransactions.add(transactionId);
    if (sourceDeduplicationKey) seenSourceRecords.add(sourceDeduplicationKey);
    rows.push(row);
  }

  return rows.sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));
}

function summarizeRows(rows) {
  const groupsByTrust = new Map();
  const byType = {};
  let credits = 0;
  let debits = 0;
  for (const row of rows) {
    credits += numberValue(row.credit);
    debits += numberValue(row.debit);
    byType[row.record_type] = byType[row.record_type] || { count: 0, credits: 0, debits: 0 };
    byType[row.record_type].count += 1;
    byType[row.record_type].credits += numberValue(row.credit);
    byType[row.record_type].debits += numberValue(row.debit);
    const group = groupsByTrust.get(row.trust_id) || {
      trust_id: row.trust_id,
      trust_name: row.trust_name,
      count: 0,
      credits: 0,
      debits: 0,
      net: 0,
    };
    group.count += 1;
    group.credits += numberValue(row.credit);
    group.debits += numberValue(row.debit);
    group.net = group.credits - group.debits;
    groupsByTrust.set(row.trust_id, group);
  }
  const normalizedGroups = [...groupsByTrust.values()].map((group) => ({
    ...group,
    credits: roundMoney(group.credits),
    debits: roundMoney(group.debits),
    net: roundMoney(group.net),
  }));
  return {
    totals: {
      count: rows.length,
      credits: roundMoney(credits),
      debits: roundMoney(debits),
      net: roundMoney(credits - debits),
    },
    groups: normalizedGroups,
    by_type: Object.fromEntries(Object.entries(byType).map(([key, value]) => [key, {
      ...value,
      credits: roundMoney(value.credits),
      debits: roundMoney(value.debits),
      net: roundMoney(value.credits - value.debits),
    }])),
  };
}

async function loadReportData(repository, filters) {
  if (!repository || typeof repository.loadReportData !== 'function') {
    throw new TypeError('operations reports repository must provide loadReportData');
  }
  return repository.loadReportData(filters);
}

function createOperationsReportsService({ repository } = {}) {
  let resolvedRepository = repository;
  const getRepository = () => {
    if (!resolvedRepository) resolvedRepository = createSupabaseOperationsReportsRepository();
    return resolvedRepository;
  };

  async function buildReport(filters) {
    const data = await loadReportData(getRepository(), filters);
    const rows = buildReportRows(data, filters);
    return {
      rows,
      ...summarizeRows(rows),
      filters,
    };
  }

  return {
    async getOperationsReport(input = {}) {
      return buildReport(normalizeReportFilters(input));
    },

    async getConsolidatedOperationsReport({ from, to, filters = {} } = {}) {
      return buildReport(normalizeReportFilters({ ...filters, from, to, trustId: filters.trustId ?? filters.trust_id }));
    },
  };
}

function createSupabaseOperationsReportsRepository(client) {
  const getClient = () => client || require('../config/supabaseAdmin');

  async function many(query, operation) {
    const { data, error } = await query;
    if (error) {
      const wrapped = new Error(`${operation}: ${error.message}`);
      wrapped.statusCode = 500;
      throw wrapped;
    }
    return data || [];
  }

  function queryRows(table, { trustId, dateColumn, from, to, statuses } = {}) {
    let query = getClient().from(table).select('*');
    if (trustId) query = query.eq('trust_id', trustId);
    if (statuses) query = query.in('status', statuses);
    if (dateColumn && from) query = query.gte(dateColumn, from);
    if (dateColumn && to) query = query.lte(dateColumn, to);
    return query.order(dateColumn || 'created_at', { ascending: false });
  }

  return {
    async loadReportData(filters = {}) {
      const clientInstance = getClient();
      const trustQuery = clientInstance.from('operations_trusts').select('id, name, legal_name, code, financial_year_start_month').eq('is_active', true);
      const queries = [
        trustQuery,
        queryRows('operations_transactions', { trustId: filters.trustId, dateColumn: 'transaction_date', from: filters.from, to: filters.to, statuses: ['posted', 'reversed'] }),
        queryRows('operations_journal_entries', { trustId: filters.trustId, dateColumn: 'entry_date', from: filters.from, to: filters.to, statuses: ['posted'] }),
        queryRows('operations_fund_allocations', { trustId: filters.trustId, statuses: ['approved', 'posted'] }),
        queryRows('operations_donation_allocations', { trustId: filters.trustId }),
        queryRows('operations_donations', { trustId: filters.trustId }),
        queryRows('operations_invoices', { trustId: filters.trustId }),
        queryRows('operations_payroll_runs', { trustId: filters.trustId }),
        queryRows('operations_payroll_periods', { trustId: filters.trustId }),
      ];
      const [trusts, transactions, journalEntries, fundAllocations, donationAllocations, donations, invoices, payrollRuns, payrollPeriods] = await Promise.all([
        many(queries[0], 'load trusts for operations report'),
        many(queries[1], 'load posted operations transactions'),
        many(queries[2], 'load posted operations journals'),
        many(queries[3], 'load posted fund allocations'),
        many(queries[4], 'load donation allocations'),
        many(queries[5], 'load donations for operations report'),
        many(queries[6], 'load invoices for operations report'),
        many(queries[7], 'load payroll runs for operations report'),
        many(queries[8], 'load payroll periods for operations report'),
      ]);
      return {
        trusts,
        transactions,
        journalEntries,
        fundAllocations,
        donationAllocations,
        donations,
        invoices,
        payrollRuns,
        payrollPeriods,
      };
    },
  };
}

function queryFilters(query = {}) {
  return {
    trustId: query.trust_id || query.trustId,
    from: query.from,
    to: query.to,
    fundId: query.fund_id || query.fundId,
    type: query.type,
    status: query.status,
    paymentMode: query.payment_mode || query.paymentMode,
    purpose: query.purpose,
    payrollPeriod: query.payroll_period || query.payrollPeriod,
    invoiceStatus: query.invoice_status || query.invoiceStatus,
    financialYear: query.financial_year || query.financialYear,
  };
}

function sendReportError(res, error) {
  return res.status(Number.isInteger(error?.statusCode) ? error.statusCode : 500).json({
    success: false,
    message: error?.message || 'Operations report request failed',
    ...(error?.details ? { errors: error.details } : {}),
  });
}

function createOperationsReportsRouter({ service } = {}) {
  const router = express.Router();
  let resolvedService = service;
  const getService = () => {
    if (!resolvedService) resolvedService = createOperationsReportsService();
    return resolvedService;
  };

  router.use(requireOperationsFeature('trusts'));

  router.get('/consolidated', requireOperationsRole('admin', 'accountant', 'viewer'), requireOperationsTrust({ required: false, allowAll: true }), async (req, res) => {
    try {
      const result = await getService().getConsolidatedOperationsReport({
        from: req.query.from,
        to: req.query.to,
        filters: { ...queryFilters(req.query), trustId: req.operationsTrustId },
      });
      return res.json({ success: true, result });
    } catch (error) {
      return sendReportError(res, error);
    }
  });

  router.get('/', requireOperationsRole('admin', 'accountant', 'viewer'), requireOperationsTrust({ required: false, allowAll: true }), async (req, res) => {
    try {
      const result = await getService().getOperationsReport({
        ...queryFilters(req.query),
        trustId: req.operationsTrustId,
      });
      return res.json({ success: true, result });
    } catch (error) {
      return sendReportError(res, error);
    }
  });

  return router;
}

const router = createOperationsReportsRouter();
router.createOperationsReportsRouter = createOperationsReportsRouter;

let defaultService;
function getDefaultService() {
  if (!defaultService) defaultService = createOperationsReportsService();
  return defaultService;
}

module.exports = router;
module.exports.createOperationsReportsRouter = createOperationsReportsRouter;
module.exports.createOperationsReportsService = createOperationsReportsService;
module.exports.createSupabaseOperationsReportsRepository = createSupabaseOperationsReportsRepository;
module.exports.normalizeReportFilters = normalizeReportFilters;
module.exports.financialYearFor = financialYearFor;
module.exports.getOperationsReport = (input) => getDefaultService().getOperationsReport(input);
module.exports.getConsolidatedOperationsReport = (input) => getDefaultService().getConsolidatedOperationsReport(input);
