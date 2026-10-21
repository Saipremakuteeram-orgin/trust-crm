'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createPostingService } = require('../src/operations/postingService');
const { createApprovalService } = require('../src/operations/approvalService');

function memoryRepository() {
  let sequence = 0;
  const nextId = (prefix) => `${prefix}-${++sequence}`;
  const transactions = new Map();
  const approvals = new Map();
  const repository = {
    transactions,
    approvals,
    journals: [],

    async createDraft({ actorId, draft }) {
      const id = nextId('record');
      transactions.set(id, { id, ...draft, createdBy: actorId });
      return { id, status: 'draft' };
    },

    async submitForApproval({ actorId, recordId }) {
      const transaction = transactions.get(recordId);
      if (!transaction || transaction.status !== 'draft') throw new Error('Record is not a draft');
      const approval = {
        id: nextId('approval'),
        recordId,
        transactionId: recordId,
        requestedBy: actorId,
        status: 'pending_approval',
      };
      approvals.set(approval.id, approval);
      transaction.status = 'pending_approval';
      return approval;
    },

    async approveAndPost({ approvalId }) {
      const approval = approvals.get(approvalId);
      if (!approval || approval.status !== 'pending_approval') throw new Error('Approval is not pending');
      const transaction = transactions.get(approval.recordId);
      if (transaction.status !== 'pending_approval') throw new Error('Record is not pending');
      approval.status = 'approved';
      transaction.status = 'posted';
      const journalEntryId = nextId('journal');
      repository.journals.push({ id: journalEntryId, transactionId: transaction.id, balanced: true });
      return { transactionId: transaction.id, journalEntryId, fundAllocationId: null };
    },

    async rejectApproval({ approvalId, reason }) {
      const approval = approvals.get(approvalId);
      const transaction = transactions.get(approval.recordId);
      approval.status = 'rejected';
      approval.reason = reason;
      transaction.status = 'rejected';
      return approval;
    },

    async reversePostedRecord({ recordId, reason }) {
      const original = transactions.get(recordId);
      if (!original || original.status !== 'posted') throw new Error('Record is not posted');
      original.status = 'reversed';
      const reversalId = nextId('record');
      transactions.set(reversalId, { ...original, id: reversalId, status: 'posted', reversalReason: reason });
      return {
        transactionId: reversalId,
        reversalTransactionId: reversalId,
        journalEntryId: nextId('journal'),
        fundAllocationId: null,
        reversedRecordId: recordId,
      };
    },

    async listApprovals() {
      return [...approvals.values()];
    },
  };
  return repository;
}

const baseDraft = {
  trustId: 'trust-1',
  type: 'credit',
  amount: 250,
  currency: 'INR',
  accountId: 'account-1',
};

function actor(id, role) {
  return { id, role };
}

test('operations approval state machine transitions draft to pending approval', async () => {
  const repository = memoryRepository();
  const posting = createPostingService({ repository });
  const approvals = createApprovalService({ repository });
  const accountant = actor('accountant-1', 'accountant');

  const recordId = await posting.createDraft({ actor: accountant, ...baseDraft });
  assert.equal(repository.transactions.get(recordId).status, 'draft');
  const pending = await approvals.submitForApproval({ actor: accountant, recordId });

  assert.equal(pending.status, 'pending_approval');
  assert.equal(repository.transactions.get(recordId).status, 'pending_approval');
});

test('operations approval enforces viewer and accountant boundaries', async () => {
  const repository = memoryRepository();
  const posting = createPostingService({ repository });
  const approvals = createApprovalService({ repository });
  const viewer = actor('viewer-1', 'viewer');
  const accountant = actor('accountant-1', 'accountant');

  await assert.rejects(
    () => posting.createDraft({ actor: viewer, ...baseDraft }),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );

  const recordId = await posting.createDraft({ actor: accountant, ...baseDraft });
  const pending = await approvals.submitForApproval({ actor: accountant, recordId });

  await assert.rejects(
    () => approvals.submitForApproval({ actor: viewer, recordId }),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
  await assert.rejects(
    () => approvals.approveAndPost({ actor: accountant, approvalId: pending.id }),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
});

test('operations approval requires Admin approval and rejection reasons', async () => {
  const repository = memoryRepository();
  const posting = createPostingService({ repository });
  const approvals = createApprovalService({ repository });
  const accountant = actor('accountant-1', 'accountant');
  const admin = actor('admin-1', 'admin');
  const recordId = await posting.createDraft({ actor: accountant, ...baseDraft });
  const pending = await approvals.submitForApproval({ actor: accountant, recordId });

  await assert.rejects(
    () => approvals.rejectApproval({ actor: admin, approvalId: pending.id, reason: '' }),
    (error) => error.code === 'VALIDATION_ERROR' && error.statusCode === 400,
  );

  const rejected = await approvals.rejectApproval({
    actor: admin,
    approvalId: pending.id,
    reason: 'Missing supporting document',
  });
  assert.equal(rejected.status, 'rejected');
  assert.equal(repository.transactions.get(recordId).status, 'rejected');
  assert.equal(repository.journals.length, 0);
});

test('operations approval only Admin can post and reverse', async () => {
  const repository = memoryRepository();
  const posting = createPostingService({ repository });
  const approvals = createApprovalService({ repository });
  const accountant = actor('accountant-1', 'accountant');
  const admin = actor('admin-1', 'admin');
  const recordId = await posting.createDraft({ actor: accountant, ...baseDraft });
  const pending = await approvals.submitForApproval({ actor: accountant, recordId });

  const posted = await approvals.approveAndPost({ actor: admin, approvalId: pending.id });
  assert.equal(repository.transactions.get(recordId).status, 'posted');
  assert.equal(posted.transactionId, recordId);

  await assert.rejects(
    () => approvals.reversePostedRecord({ actor: accountant, recordId, reason: 'Correction' }),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
  const reversed = await approvals.reversePostedRecord({ actor: admin, recordId, reason: 'Correction' });
  assert.equal(reversed.reversedRecordId, recordId);
  assert.equal(repository.transactions.get(recordId).status, 'reversed');
});
