'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  OperationsServiceError,
} = require('../src/operations/postingService');
const { createFundService } = require('../src/operations/fundService');

const TRUST_A = 'trust-a';
const TRUST_B = 'trust-b';

function actor(id, role) {
  return { id, role };
}

function createMemoryRepository() {
  let nextId = 1;
  const id = (prefix) => `${prefix}-${nextId++}`;
  const repository = {
    funds: new Map(),
    budgets: [],
    allocations: [],
    donationAllocations: [],
    commitments: [],
    transfers: new Map(),
    transactions: new Map(),
    approvals: new Map(),
    approvalActions: [],
    audits: [],

    async listFunds({ trustId } = {}) {
      return [...repository.funds.values()].filter((fund) => !trustId || fund.trust_id === trustId);
    },

    async getFund({ fundId }) {
      return repository.funds.get(fundId) || null;
    },

    async listBudgets({ trustId, fundId } = {}) {
      return repository.budgets.filter((budget) => (
        (!trustId || budget.trust_id === trustId) && (!fundId || budget.fund_id === fundId)
      ));
    },

    async listAllocations({ trustId, fundId } = {}) {
      return repository.allocations.filter((allocation) => (
        (!trustId || allocation.trust_id === trustId) && (!fundId || allocation.fund_id === fundId)
      ));
    },

    async listCommitments({ trustId, fundId } = {}) {
      return repository.commitments.filter((commitment) => (
        (!trustId || commitment.trust_id === trustId) && (!fundId || commitment.fund_id === fundId)
      ));
    },

    async listTransfers({ trustId, fundId } = {}) {
      return [...repository.transfers.values()].filter((transfer) => (
        (!trustId || transfer.trust_id === trustId)
        && (!fundId || transfer.from_fund_id === fundId || transfer.to_fund_id === fundId)
      ));
    },

    async getTransaction({ recordId }) {
      return repository.transactions.get(recordId) || null;
    },

    async createFund(input) {
      const fund = {
        id: id('fund'),
        trust_id: input.trustId,
        code: input.code,
        name: input.name,
        fund_type: input.type,
        status: 'draft',
        currency: input.currency,
        opening_balance: input.openingBalance,
        created_by: input.actorId,
      };
      repository.funds.set(fund.id, fund);
      return fund;
    },

    async createBudget(input) {
      const budget = {
        id: id('budget'),
        trust_id: input.trustId,
        fund_id: input.fundId,
        financial_year: input.financialYear,
        amount: input.amount,
        status: 'draft',
      };
      repository.budgets.push(budget);
      return budget;
    },

    async createApproval(input) {
      const approval = {
        id: id('approval'),
        trust_id: input.trustId,
        record_type: input.recordType,
        record_id: input.recordId,
        status: 'pending_approval',
        requested_by: input.actorId,
        reason: input.reason,
      };
      repository.approvals.set(approval.id, approval);
      return approval;
    },

    async createApprovalAction(input) {
      const action = { id: id('action'), ...input };
      repository.approvalActions.push(action);
      return action;
    },

    async getApproval({ recordId, recordType }) {
      return [...repository.approvals.values()]
        .reverse()
        .find((approval) => approval.record_id === recordId && approval.record_type === recordType) || null;
    },

    async updateApproval({ approvalId, actorId, status, reason }) {
      const approval = repository.approvals.get(approvalId);
      if (!approval) throw new OperationsServiceError('Approval was not found', { statusCode: 404 });
      Object.assign(approval, { status, reviewed_by: actorId, reason: reason || approval.reason });
      return approval;
    },

    async activateFund({ fundId, actorId }) {
      const fund = repository.funds.get(fundId);
      Object.assign(fund, { status: 'active', updated_by: actorId });
      return fund;
    },

    async approveBudget({ fundId }) {
      for (const budget of repository.budgets) {
        if (budget.fund_id === fundId && budget.status === 'draft') budget.status = 'approved';
      }
      return repository.budgets.filter((budget) => budget.fund_id === fundId);
    },

    async createAllocation(input) {
      const allocation = {
        id: id('allocation'),
        trust_id: input.trustId,
        fund_id: input.fundId,
        transaction_id: input.transactionId,
        donation_id: input.donationId || null,
        allocation_type: input.allocationType,
        status: input.status,
        amount: input.amount,
        currency: input.currency,
        overrideReason: input.overrideReason || null,
      };
      repository.allocations.push(allocation);
      return allocation;
    },

    async createDonationAllocation(input) {
      const allocation = { id: id('donation-allocation'), ...input };
      repository.donationAllocations.push(allocation);
      return allocation;
    },

    async createTransfer(input) {
      const transfer = {
        id: id('transfer'),
        trust_id: input.trustId,
        from_fund_id: input.fromFundId,
        to_fund_id: input.toFundId,
        amount: input.amount,
        currency: input.currency,
        reason: input.reason,
        status: 'pending_approval',
        created_by: input.actorId,
        overrideReason: input.overrideReason || null,
      };
      repository.transfers.set(transfer.id, transfer);
      return transfer;
    },

    async getTransfer({ transferId }) {
      return repository.transfers.get(transferId) || null;
    },

    async postTransfer(input) {
      const transfer = repository.transfers.get(input.transferId);
      Object.assign(transfer, {
        status: 'posted',
        approved_by: input.actorId,
        posted_at: input.postedAt,
      });
      return transfer;
    },

    async createAuditEvent(input) {
      repository.audits.push(input);
      return input;
    },
  };
  return repository;
}

function seedFund(repository, { id, trustId = TRUST_A, opening = 0, status = 'active', type = 'general' } = {}) {
  repository.funds.set(id, {
    id,
    trust_id: trustId,
    code: id.toUpperCase(),
    name: id,
    fund_type: type,
    status,
    currency: 'INR',
    opening_balance: opening,
  });
}

function seedTransaction(repository, { id, trustId = TRUST_A, type, amount, status = 'posted', metadata = {} } = {}) {
  repository.transactions.set(id, {
    id,
    trust_id: trustId,
    transaction_type: type,
    amount,
    currency: 'INR',
    status,
    metadata,
  });
}

test('operations fund creation returns a draft and requires Admin approval for opening balance', async () => {
  const repository = createMemoryRepository();
  const service = createFundService({ repository, now: () => new Date('2026-10-21T00:00:00Z') });

  const created = await service.createFund({
    actor: actor('accountant-1', 'accountant'),
    trustId: TRUST_A,
    name: 'Food Program',
    type: 'program',
    openingBalance: 250,
    budget: 1_000,
  });

  assert.equal(created.fund.status, 'draft');
  assert.equal(created.fund.fund_type, 'project');
  assert.equal(created.budget.status, 'draft');
  assert.equal(created.approval.status, 'pending_approval');

  const approved = await service.approveFund({
    actor: actor('admin-1', 'admin'),
    fundId: created.fund.id,
    approvalId: created.approval.id,
  });
  assert.equal(approved.fund.status, 'active');
  assert.equal(approved.approval.status, 'approved');

  const summary = await service.getFundSummary({ trustId: TRUST_A, fundId: created.fund.id });
  assert.equal(summary.opening, 250);
  assert.equal(summary.budget, 1_000);
});

test('operations fund allocation records donation income and recalculates available from allocation rows', async () => {
  const repository = createMemoryRepository();
  seedFund(repository, { id: 'fund-income' });
  seedTransaction(repository, {
    id: 'donation-record',
    type: 'credit',
    amount: 500,
  });
  const service = createFundService({ repository });

  const result = await service.allocateToFund({
    actor: actor('accountant-1', 'accountant'),
    recordId: 'donation-record',
    fundId: 'fund-income',
    amount: 325,
  });

  assert.equal(result.allocation.allocation_type, 'donation');
  assert.equal(result.allocation.status, 'posted');
  const summary = await service.getFundSummary({ trustId: TRUST_A, fundId: 'fund-income' });
  assert.equal(summary.received, 325);
  assert.equal(summary.spent, 0);
  assert.equal(summary.available, 325);
});

test('operations fund expense allocation decreases available and commitments reduce it without changing spent', async () => {
  const repository = createMemoryRepository();
  seedFund(repository, { id: 'fund-expense', opening: 1_000 });
  seedTransaction(repository, { id: 'expense-record', type: 'debit', amount: 275 });
  repository.commitments.push({
    id: 'commitment-1',
    trust_id: TRUST_A,
    fund_id: 'fund-expense',
    amount: 125,
    status: 'approved',
  });
  const service = createFundService({ repository });

  await service.allocateToFund({
    actor: actor('accountant-1', 'accountant'),
    recordId: 'expense-record',
    fundId: 'fund-expense',
    amount: 275,
  });

  const summary = await service.getFundSummary({ trustId: TRUST_A, fundId: 'fund-expense' });
  assert.equal(summary.spent, 275);
  assert.equal(summary.committed, 125);
  assert.equal(summary.available, 600);
  assert.equal(summary.budgetVsActual.actual, 275);
});

test('operations fund validation rejects negative values, ineligible expenses, and cross-trust allocations', async () => {
  const repository = createMemoryRepository();
  seedFund(repository, { id: 'fund-a', trustId: TRUST_A, opening: 100 });
  seedFund(repository, { id: 'fund-b', trustId: TRUST_B, opening: 100 });
  seedTransaction(repository, { id: 'expense-b', trustId: TRUST_B, type: 'debit', amount: 10 });
  seedTransaction(repository, {
    id: 'ineligible-expense',
    type: 'debit',
    amount: 10,
    metadata: { fundEligible: false },
  });
  const service = createFundService({ repository });
  const accountant = actor('accountant-1', 'accountant');

  await assert.rejects(
    () => service.createFund({ actor: accountant, trustId: TRUST_A, name: 'Bad fund', openingBalance: -1 }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  await assert.rejects(
    () => service.createFund({ actor: accountant, trustId: TRUST_A, name: 'Bad budget', budget: -1 }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  await assert.rejects(
    () => service.allocateToFund({ actor: accountant, recordId: 'expense-b', fundId: 'fund-a', amount: 10 }),
    (error) => error.code === 'CROSS_TRUST_OPERATION',
  );
  await assert.rejects(
    () => service.allocateToFund({ actor: accountant, recordId: 'ineligible-expense', fundId: 'fund-a', amount: 10 }),
    (error) => error.code === 'INELIGIBLE_EXPENSE',
  );
  await assert.rejects(
    () => service.allocateToFund({ actor: accountant, recordId: 'expense-b', fundId: 'fund-a', amount: -1 }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('operations fund insufficient balance requires an Admin override reason', async () => {
  const repository = createMemoryRepository();
  seedFund(repository, { id: 'fund-limited', opening: 100 });
  seedTransaction(repository, { id: 'large-expense', type: 'debit', amount: 150 });
  const service = createFundService({ repository });
  const accountant = actor('accountant-1', 'accountant');
  const admin = actor('admin-1', 'admin');

  await assert.rejects(
    () => service.allocateToFund({ actor: accountant, recordId: 'large-expense', fundId: 'fund-limited', amount: 150 }),
    (error) => error.code === 'INSUFFICIENT_FUND_BALANCE',
  );
  await assert.rejects(
    () => service.allocateToFund({ actor: admin, recordId: 'large-expense', fundId: 'fund-limited', amount: 150 }),
    (error) => error.code === 'INSUFFICIENT_FUND_BALANCE',
  );

  const result = await service.allocateToFund({
    actor: admin,
    recordId: 'large-expense',
    fundId: 'fund-limited',
    amount: 150,
    overrideReason: 'Emergency response approved by the board',
  });
  assert.equal(result.overrideReason, 'Emergency response approved by the board');
  const summary = await service.getFundSummary({ trustId: TRUST_A, fundId: 'fund-limited' });
  assert.equal(summary.spent, 150);
  assert.equal(summary.available, -50);
});

test('operations fund transfers are pending until Admin approval and update both funds', async () => {
  const repository = createMemoryRepository();
  seedFund(repository, { id: 'fund-source', opening: 500 });
  seedFund(repository, { id: 'fund-destination', opening: 25 });
  seedFund(repository, { id: 'fund-b', trustId: TRUST_B, opening: 25 });
  const service = createFundService({ repository, now: () => new Date('2026-10-21T00:00:00Z') });
  const accountant = actor('accountant-1', 'accountant');

  const pending = await service.createFundTransfer({
    actor: accountant,
    fromFundId: 'fund-source',
    toFundId: 'fund-destination',
    amount: 175,
    reason: 'Move program allocation',
  });
  assert.equal(pending.status, 'pending_approval');
  assert.equal((await service.getFundSummary({ trustId: TRUST_A, fundId: 'fund-source' })).available, 500);

  const posted = await service.approveFundTransfer({
    actor: actor('admin-1', 'admin'),
    transferId: pending.transfer.id,
  });
  assert.equal(posted.status, 'posted');
  assert.equal((await service.getFundSummary({ trustId: TRUST_A, fundId: 'fund-source' })).available, 325);
  const destination = await service.getFundSummary({ trustId: TRUST_A, fundId: 'fund-destination' });
  assert.equal(destination.available, 200);

  await assert.rejects(
    () => service.createFundTransfer({
      actor: accountant,
      fromFundId: 'fund-source',
      toFundId: 'fund-b',
      amount: 10,
      reason: 'Cross-trust transfer',
    }),
    (error) => error.code === 'CROSS_TRUST_OPERATION',
  );
  await assert.rejects(
    () => service.createFundTransfer({
      actor: accountant,
      fromFundId: 'fund-source',
      toFundId: 'fund-destination',
      amount: -10,
      reason: 'Negative transfer',
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('operations fund viewers are read-only', async () => {
  const repository = createMemoryRepository();
  seedFund(repository, { id: 'fund-viewer' });
  const service = createFundService({ repository });

  await assert.rejects(
    () => service.createFund({ actor: actor('viewer-1', 'viewer'), trustId: TRUST_A, name: 'No write' }),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
  const funds = await service.listFunds({ actor: actor('viewer-1', 'viewer'), trustId: TRUST_A });
  assert.equal(funds.length, 1);
});
