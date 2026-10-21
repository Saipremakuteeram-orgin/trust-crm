'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { validateFinancialDraft } = require('../src/operations/validation');
const {
  OperationsServiceError,
  createPostingService,
} = require('../src/operations/postingService');
const { createApprovalService } = require('../src/operations/approvalService');

const TRUST_ID = 'trust-1';
const ACCOUNT_ID = 'account-1';
const FUND_ID = 'fund-1';

function createMemoryRepository() {
  let nextId = 1;
  const id = (prefix) => `${prefix}-${nextId++}`;
  const repository = {
    transactions: new Map(),
    transactionAccounts: new Map(),
    approvals: new Map(),
    journals: new Map(),
    lines: new Map(),
    allocations: new Map(),
    audits: [],

    async createDraft({ actorId, draft }) {
      const transactionId = id('transaction');
      repository.transactions.set(transactionId, {
        id: transactionId,
        trustId: draft.trustId,
        type: draft.type,
        amount: draft.amount,
        currency: draft.currency,
        fundId: draft.fundId,
        partyId: draft.partyId,
        source: draft.source,
        metadata: draft.metadata,
        status: 'draft',
        createdBy: actorId,
      });
      repository.transactionAccounts.set(transactionId, draft.accountId);
      repository.audits.push({ action: 'create_draft', transactionId, actorId });
      return { id: transactionId, transactionId, status: 'draft' };
    },

    async submitForApproval({ actorId, recordId }) {
      const transaction = repository.transactions.get(recordId);
      if (!transaction) throw new OperationsServiceError('Financial record was not found', { statusCode: 404 });
      if (transaction.status !== 'draft') throw new OperationsServiceError('Only draft records can be submitted for approval');
      const approvalId = id('approval');
      const approval = {
        id: approvalId,
        approvalId,
        recordId,
        transactionId: recordId,
        requestedBy: actorId,
        status: 'pending_approval',
      };
      repository.approvals.set(approvalId, approval);
      transaction.status = 'pending_approval';
      repository.audits.push({ action: 'submit_for_approval', transactionId: recordId, actorId });
      return approval;
    },

    async approveAndPost({ actorId, approvalId }) {
      const approval = repository.approvals.get(approvalId);
      if (!approval) throw new OperationsServiceError('Approval request was not found', { statusCode: 404 });
      if (approval.status !== 'pending_approval') throw new OperationsServiceError('Only pending approvals can be approved');
      const transaction = repository.transactions.get(approval.transactionId);
      if (transaction.status !== 'pending_approval') throw new OperationsServiceError('Only pending financial records can be posted');

      const journalEntryId = id('journal');
      const accountCode = repository.transactionAccounts.get(transaction.id);
      const target = transaction.type === 'debit'
        ? { debit: transaction.amount, credit: 0 }
        : { debit: 0, credit: transaction.amount };
      const offset = { debit: target.credit, credit: target.debit };
      repository.journals.set(journalEntryId, { id: journalEntryId, transactionId: transaction.id, status: 'posted' });
      repository.lines.set(journalEntryId, [
        { accountCode, ...target },
        { accountCode: 'OPERATIONS_OFFSET', ...offset },
      ]);

      let fundAllocationId = null;
      if (transaction.fundId) {
        fundAllocationId = id('allocation');
        repository.allocations.set(fundAllocationId, {
          id: fundAllocationId,
          transactionId: transaction.id,
          fundId: transaction.fundId,
          status: 'posted',
          amount: transaction.amount,
        });
      }
      approval.status = 'approved';
      transaction.status = 'posted';
      transaction.journalEntryId = journalEntryId;
      repository.audits.push({ action: 'approve_and_post', transactionId: transaction.id, actorId });
      return { transactionId: transaction.id, journalEntryId, fundAllocationId };
    },

    async rejectApproval({ actorId, approvalId, reason }) {
      const approval = repository.approvals.get(approvalId);
      if (!approval) throw new OperationsServiceError('Approval request was not found', { statusCode: 404 });
      const transaction = repository.transactions.get(approval.transactionId);
      approval.status = 'rejected';
      approval.reason = reason;
      transaction.status = 'rejected';
      repository.audits.push({ action: 'reject_approval', transactionId: transaction.id, actorId, reason });
      return approval;
    },

    async reversePostedRecord({ actorId, recordId, reason }) {
      const original = repository.transactions.get(recordId);
      if (!original || original.status !== 'posted') throw new OperationsServiceError('Only posted records can be reversed');
      const reversalId = id('transaction');
      const reversal = {
        ...original,
        id: reversalId,
        type: original.type === 'debit' ? 'credit' : 'debit',
        status: 'posted',
        source: 'reversal',
        sourceId: original.id,
        metadata: { ...original.metadata, reversesRecordId: original.id, reversalReason: reason },
      };
      repository.transactions.set(reversalId, reversal);
      repository.transactionAccounts.set(reversalId, repository.transactionAccounts.get(original.id));
      original.status = 'reversed';
      const journalEntryId = id('journal');
      const target = reversal.type === 'debit'
        ? { debit: reversal.amount, credit: 0 }
        : { debit: 0, credit: reversal.amount };
      repository.journals.set(journalEntryId, { id: journalEntryId, transactionId: reversalId, status: 'posted' });
      repository.lines.set(journalEntryId, [
        { accountCode: repository.transactionAccounts.get(reversalId), ...target },
        { accountCode: 'OPERATIONS_OFFSET', debit: target.credit, credit: target.debit },
      ]);
      repository.audits.push({ action: 'reverse', transactionId: original.id, actorId, reason });
      return {
        transactionId: reversalId,
        journalEntryId,
        fundAllocationId: null,
        reversalTransactionId: reversalId,
        reversedRecordId: original.id,
      };
    },

    async listApprovals() {
      return [...repository.approvals.values()];
    },
  };
  return repository;
}

function actor(id, role) {
  return { id, role };
}

test('operations posting validation rejects invalid amounts and missing trust/account', () => {
  assert.equal(validateFinancialDraft({ amount: 0 }).valid, false);
  assert.equal(validateFinancialDraft({ amount: 100, type: 'debit' }).valid, false);

  const validDraft = validateFinancialDraft({
    trustId: TRUST_ID,
    type: 'debit',
    amount: 100,
    accountId: ACCOUNT_ID,
  });
  assert.equal(validDraft.valid, true);
  assert.equal(validDraft.value.status, 'draft');
  assert.equal(validDraft.value.currency, 'INR');
});

test('operations posting creates balanced journal lines and optional fund allocation atomically', async () => {
  const repository = createMemoryRepository();
  const posting = createPostingService({ repository });
  const approvals = createApprovalService({ repository });
  const accountant = actor('accountant-1', 'accountant');
  const admin = actor('admin-1', 'admin');

  const recordId = await posting.createDraft({
    actor: accountant,
    trustId: TRUST_ID,
    type: 'debit',
    amount: 125.5,
    currency: 'INR',
    accountId: ACCOUNT_ID,
    fundId: FUND_ID,
    source: 'manual-expense',
    metadata: { reference: 'fixture' },
  });
  const approval = await approvals.submitForApproval({ actor: accountant, recordId });
  const result = await approvals.approveAndPost({ actor: admin, approvalId: approval.id });

  assert.equal(repository.transactions.get(recordId).status, 'posted');
  assert.equal(result.transactionId, recordId);
  assert.ok(repository.journals.has(result.journalEntryId));
  assert.ok(repository.allocations.has(result.fundAllocationId));
  const lines = repository.lines.get(result.journalEntryId);
  assert.equal(lines.length, 2);
  assert.equal(lines.reduce((sum, line) => sum + line.debit, 0), 125.5);
  assert.equal(lines.reduce((sum, line) => sum + line.credit, 0), 125.5);
});

test('operations posting never treats an unavailable adapter as success', async () => {
  const posting = createPostingService({
    repository: {
      async createDraft() {
        throw new Error('Supabase unavailable');
      },
    },
  });

  await assert.rejects(
    () => posting.createDraft({
      actor: actor('accountant-1', 'accountant'),
      trustId: TRUST_ID,
      type: 'credit',
      amount: 10,
      accountId: ACCOUNT_ID,
    }),
    (error) => error.code === 'DATABASE_ERROR' && error.statusCode === 400,
  );
});

test('operations posting reverses with a separate posted entry and preserves the original journal', async () => {
  const repository = createMemoryRepository();
  const posting = createPostingService({ repository });
  const approvals = createApprovalService({ repository });
  const accountant = actor('accountant-1', 'accountant');
  const admin = actor('admin-1', 'admin');
  const recordId = await posting.createDraft({
    actor: accountant,
    trustId: TRUST_ID,
    type: 'credit',
    amount: 80,
    accountId: ACCOUNT_ID,
  });
  const approval = await approvals.submitForApproval({ actor: accountant, recordId });
  const posted = await approvals.approveAndPost({ actor: admin, approvalId: approval.id });
  const originalLines = repository.lines.get(posted.journalEntryId).map((line) => ({ ...line }));

  const reversal = await approvals.reversePostedRecord({ actor: admin, recordId, reason: 'Correction' });

  assert.equal(repository.transactions.get(recordId).status, 'reversed');
  assert.equal(repository.transactions.get(reversal.reversalTransactionId).status, 'posted');
  assert.deepEqual(repository.lines.get(posted.journalEntryId), originalLines);
  assert.notEqual(reversal.journalEntryId, posted.journalEntryId);
});
