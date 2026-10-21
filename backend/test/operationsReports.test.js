'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createOperationsReportsService } = require('../src/routes/operationsReports');

const TRUST_A = 'trust-a';
const TRUST_B = 'trust-b';
const TRUST_C = 'trust-c';

function createReportRepository() {
  const calls = [];
  const data = {
    trusts: [
      { id: TRUST_A, name: 'Trust A' },
      { id: TRUST_B, name: 'Trust B' },
      { id: TRUST_C, name: 'Trust C', financial_year_start_month: 7 },
    ],
    transactions: [
      {
        id: 'transaction-a', trust_id: TRUST_A, transaction_type: 'credit', amount: 100,
        status: 'reversed', transaction_date: '2026-04-02', source_type: 'donation', source_id: 'donation-a', fund_id: 'fund-a',
      },
      {
        id: 'transaction-a-duplicate-source', trust_id: TRUST_A, transaction_type: 'credit', amount: 100,
        status: 'posted', transaction_date: '2026-04-02', source_type: 'donation', source_id: 'donation-a', fund_id: 'fund-a',
      },
      {
        id: 'transaction-a-reversal', trust_id: TRUST_A, transaction_type: 'debit', amount: 100,
        status: 'posted', transaction_date: '2026-04-05', source_type: 'reversal', source_id: 'transaction-a', metadata: { reverses_record_id: 'transaction-a' },
      },
      {
        id: 'transaction-b', trust_id: TRUST_B, transaction_type: 'debit', amount: 200,
        status: 'posted', transaction_date: '2026-05-02', source_type: 'invoice', source_id: 'invoice-b', fund_id: 'fund-b',
      },
      {
        id: 'transaction-c', trust_id: TRUST_C, transaction_type: 'debit', amount: 75,
        status: 'posted', transaction_date: '2026-05-03', source_type: 'payroll', source_id: 'payroll-c', fund_id: 'fund-c',
      },
    ],
    journalEntries: [
      { id: 'journal-a', trust_id: TRUST_A, transaction_id: 'transaction-a', entry_date: '2026-04-02', status: 'posted', total_debit: 0, total_credit: 100 },
      // A duplicate journal reference must not double-count the source transaction.
      { id: 'journal-a-duplicate', trust_id: TRUST_A, transaction_id: 'transaction-a', entry_date: '2026-04-02', status: 'posted', total_debit: 0, total_credit: 100 },
      // A duplicate source record with another transaction reference must also be counted once.
      { id: 'journal-a-source-duplicate', trust_id: TRUST_A, transaction_id: 'transaction-a-duplicate-source', entry_date: '2026-04-02', status: 'posted', total_debit: 0, total_credit: 100 },
      { id: 'journal-a-reversal', trust_id: TRUST_A, transaction_id: 'transaction-a-reversal', entry_date: '2026-04-05', status: 'posted', total_debit: 100, total_credit: 0 },
      { id: 'journal-b', trust_id: TRUST_B, transaction_id: 'transaction-b', entry_date: '2026-05-02', status: 'posted', total_debit: 200, total_credit: 0 },
      { id: 'journal-c', trust_id: TRUST_C, transaction_id: 'transaction-c', entry_date: '2026-05-03', status: 'posted', total_debit: 75, total_credit: 0 },
    ],
    fundAllocations: [
      { id: 'allocation-a', trust_id: TRUST_A, transaction_id: 'transaction-a', fund_id: 'fund-a', amount: 100, status: 'posted' },
      // The transaction ID is intentionally shared with Trust A; this row must be ignored.
      { id: 'allocation-cross-trust', trust_id: TRUST_B, transaction_id: 'transaction-a', fund_id: 'fund-b', amount: 999, status: 'posted' },
      { id: 'allocation-b', trust_id: TRUST_B, transaction_id: 'transaction-b', fund_id: 'fund-b', amount: 200, status: 'posted' },
      { id: 'allocation-c', trust_id: TRUST_C, transaction_id: 'transaction-c', fund_id: 'fund-c', amount: 75, status: 'posted' },
    ],
    donationAllocations: [],
    donations: [
      { id: 'donation-a', trust_id: TRUST_A, transaction_id: 'transaction-a', amount: 100, status: 'verified', purpose: 'Community kitchen', payment_mode: 'digital' },
      { id: 'donation-b', trust_id: TRUST_B, amount: 1_000, status: 'verified', purpose: 'Trust B donation', payment_mode: 'cash' },
    ],
    invoices: [
      { id: 'invoice-b', trust_id: TRUST_B, transaction_id: 'transaction-b', status: 'paid', purpose: 'Vendor invoice' },
    ],
    payrollRuns: [
      { id: 'payroll-c', trust_id: TRUST_C, payroll_period_id: 'period-c', status: 'posted' },
    ],
    payrollPeriods: [
      { id: 'period-c', trust_id: TRUST_C, period_name: 'October 2026' },
    ],
  };

  return {
    calls,
    async loadReportData(filters) {
      calls.push(filters);
      return data;
    },
  };
}

test('operations report isolates a concrete trust and does not leak joined source or allocation rows', async () => {
  const repository = createReportRepository();
  const service = createOperationsReportsService({ repository });

  const result = await service.getOperationsReport({ trustId: TRUST_A, from: '2026-04-01', to: '2026-04-30' });

  assert.equal(result.rows.length, 2);
  assert.deepEqual([...new Set(result.rows.map((row) => row.trust_id))], [TRUST_A]);
  assert.equal(result.totals.credits, 100);
  assert.equal(result.totals.debits, 100);
  assert.equal(result.rows.some((row) => row.transaction_id === 'transaction-a'), true);
  assert.equal(result.rows.find((row) => row.record_type === 'donation').allocated_amount, 100);
  assert.equal(result.rows.some((row) => row.fund_ids.includes('fund-b')), false);
  assert.deepEqual(repository.calls[0], {
    trustId: TRUST_A,
    from: '2026-04-01',
    to: '2026-04-30',
    fundId: null,
    type: null,
    status: null,
    paymentMode: null,
    purpose: null,
    payrollPeriod: null,
    invoiceStatus: null,
    financialYear: null,
  });
});

test('consolidated operations report keeps trust identity and groups without double-counting duplicate journals', async () => {
  const service = createOperationsReportsService({ repository: createReportRepository() });

  const result = await service.getConsolidatedOperationsReport({ from: '2026-04-01', to: '2026-05-31', filters: {} });

  assert.equal(result.rows.length, 4);
  assert.deepEqual(result.rows.map((row) => row.trust_id).sort(), [TRUST_A, TRUST_A, TRUST_B, TRUST_C].sort());
  assert.deepEqual(result.groups.map((group) => group.trust_id).sort(), [TRUST_A, TRUST_B, TRUST_C].sort());
  assert.equal(result.groups.find((group) => group.trust_id === TRUST_A).count, 2);
  assert.equal(result.groups.find((group) => group.trust_id === TRUST_A).trust_name, 'Trust A');
  assert.equal(result.totals.credits, 100);
  assert.equal(result.totals.debits, 375);
});

test('operations report supports fund, payment, purpose, payroll, and invoice filters', async () => {
  const service = createOperationsReportsService({ repository: createReportRepository() });

  const donation = await service.getConsolidatedOperationsReport({
    filters: { paymentMode: 'digital', purpose: 'kitchen' },
  });
  assert.deepEqual(donation.rows.map((row) => row.record_id), ['donation-a']);

  const invoice = await service.getOperationsReport({ fundId: 'fund-b', invoiceStatus: 'paid' });
  assert.deepEqual(invoice.rows.map((row) => row.record_id), ['invoice-b']);

  const payroll = await service.getOperationsReport({ payrollPeriod: 'October 2026' });
  assert.deepEqual(payroll.rows.map((row) => row.record_id), ['payroll-c']);
});

test('operations report uses each trust financial-year start month', async () => {
  const service = createOperationsReportsService({ repository: createReportRepository() });

  const julyTrustYear = await service.getOperationsReport({ trustId: TRUST_C, financialYear: '2025-26' });
  const aprilTrustYear = await service.getOperationsReport({ trustId: TRUST_C, financialYear: '2026-27' });

  assert.deepEqual(julyTrustYear.rows.map((row) => row.financial_year), ['2025-26']);
  assert.equal(aprilTrustYear.rows.length, 0);
});
