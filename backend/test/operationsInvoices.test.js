'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createInvoiceService } = require('../src/operations/invoiceService');

const TRUST_A = 'trust-a';
const PERSON_A = 'person-a';

function actor(id, role) {
  return { id, role };
}

function createMemoryRepository() {
  let nextId = 1;
  const id = (prefix) => `${prefix}-${nextId++}`;
  const repository = {
    invoices: new Map(),
    lines: new Map(),
    approvals: new Map(),
    deliveries: [],
    auditEvents: [],
    approvalActions: [],
    paymentCalls: [],
    identities: new Map([[`${TRUST_A}:${PERSON_A}`, {
      trust: { id: TRUST_A, name: 'Trust A', is_active: true },
      person: { id: PERSON_A, full_name: 'Asha Customer', email: 'asha@example.com' },
      relationship: { trust_id: TRUST_A, person_id: PERSON_A, is_active: true },
    }]]),

    async getInvoiceIdentity({ trustId, personId }) {
      return repository.identities.get(`${trustId}:${personId}`) || { trust: null, person: null, relationship: null };
    },

    async createInvoice(input) {
      const invoice = {
        id: id('invoice'),
        trust_id: input.trustId,
        person_id: input.personId,
        invoice_number: input.invoiceNumber,
        status: 'draft',
        issue_date: input.issueDate,
        due_date: input.dueDate,
        subtotal: input.subtotal,
        tax_amount: input.taxAmount,
        total_amount: input.totalAmount,
        paid_amount: 0,
        currency: input.currency,
        metadata: input.metadata,
        created_by: input.actorId,
      };
      repository.invoices.set(invoice.id, invoice);
      return invoice;
    },

    async createInvoiceLines({ invoiceId, lines }) {
      const stored = lines.map((line) => ({ id: id('line'), ...line }));
      repository.lines.set(invoiceId, stored);
      return stored;
    },

    async listInvoices({ trustId } = {}) {
      return [...repository.invoices.values()].filter((invoice) => !trustId || invoice.trust_id === trustId);
    },

    async getInvoice({ invoiceId }) {
      const invoice = repository.invoices.get(invoiceId);
      if (!invoice) return null;
      const identity = repository.identities.get(`${invoice.trust_id}:${invoice.person_id}`) || {};
      return {
        ...invoice,
        lines: repository.lines.get(invoiceId) || [],
        person: identity.person,
        trust: identity.trust,
      };
    },

    async updateInvoiceStatus({ invoiceId, ...patch }) {
      const invoice = repository.invoices.get(invoiceId);
      if (!invoice) throw new OperationsServiceError('Invoice was not found', { code: 'NOT_FOUND', statusCode: 404 });
      Object.entries(patch).forEach(([key, value]) => {
        const column = {
          paidAmount: 'paid_amount',
          approvedBy: 'approved_by',
          sentAt: 'sent_at',
          paidAt: 'paid_at',
        }[key] || key;
        if (value !== undefined && key !== 'actorId' && key !== 'paymentReference') invoice[column] = value;
      });
      return repository.getInvoice({ invoiceId });
    },

    async createApproval(input) {
      const approval = {
        id: id('approval'),
        trust_id: input.trustId,
        record_id: input.recordId,
        record_type: 'operations_invoice',
        status: 'pending_approval',
        requested_by: input.actorId,
        reason: input.reason,
      };
      repository.approvals.set(approval.id, approval);
      return approval;
    },

    async getApproval({ recordId }) {
      return [...repository.approvals.values()].reverse().find((approval) => approval.record_id === recordId) || null;
    },

    async updateApproval({ approvalId, ...patch }) {
      const approval = repository.approvals.get(approvalId);
      if (!approval) throw new OperationsServiceError('Approval was not found', { code: 'NOT_FOUND', statusCode: 404 });
      Object.assign(approval, patch);
      return approval;
    },

    async createApprovalAction(input) {
      const action = { id: id('action'), ...input };
      repository.approvalActions.push(action);
      return action;
    },

    async createDocumentDelivery(input) {
      const delivery = { id: id('delivery'), status: 'pending', ...input };
      repository.deliveries.push(delivery);
      return delivery;
    },

    async createAuditEvent(input) {
      repository.auditEvents.push(input);
      return input;
    },
  };
  return repository;
}

function createFixtures({ now = '2026-10-21T00:00:00.000Z' } = {}) {
  let current = new Date(now);
  const repository = createMemoryRepository();
  const numberService = {
    sequence: 0,
    async nextDocumentNumber({ financialYear }) {
      this.sequence += 1;
      return `INV-${financialYear}-${String(this.sequence).padStart(4, '0')}`;
    },
  };
  const deliveryAdapter = {
    async queueInvoice(input) {
      return repository.createDocumentDelivery(input);
    },
  };
  const paymentAdapter = {
    async recordInvoicePayment(input) {
      repository.paymentCalls.push(input);
      return {
        paymentEventId: `payment-${repository.paymentCalls.length}`,
        transactionId: `transaction-${repository.paymentCalls.length}`,
        journalEntryId: `journal-${repository.paymentCalls.length}`,
        journalIds: [`journal-${repository.paymentCalls.length}`],
      };
    },
  };
  const service = createInvoiceService({
    repository,
    numberService,
    deliveryAdapter,
    paymentAdapter,
    now: () => current,
  });
  return {
    repository,
    service,
    setNow(value) { current = new Date(value); },
  };
}

function baseInput(overrides = {}) {
  return {
    trustId: TRUST_A,
    personId: PERSON_A,
    issueDate: '2026-10-21',
    dueDate: '2026-11-20',
    currency: 'INR',
    lines: [
      { description: 'Consulting', quantity: 2, rate: 100, lineTotal: 200, taxAmount: 18 },
      { description: 'Support', quantity: 1, rate: 50, lineTotal: 50, taxAmount: 0 },
    ],
    subtotal: 250,
    taxAmount: 18,
    totalAmount: 268,
    ...overrides,
  };
}

async function createDraft(fixtures, overrides = {}, invoiceActor = actor('accountant-1', 'accountant')) {
  return fixtures.service.createInvoiceDraft({ ...baseInput(overrides), actor: invoiceActor });
}

test('operations invoice validates exact line, subtotal, tax, and total amounts', async () => {
  const fixtures = createFixtures();
  const draft = await createDraft(fixtures);

  assert.equal(draft.status, 'draft');
  assert.equal(draft.subtotal, 250);
  assert.equal(draft.tax_amount, 18);
  assert.equal(draft.total_amount, 268);
  assert.equal(draft.lines[0].line_amount, 200);

  const invoiceTax = await createDraft(fixtures, {
    lines: [{ description: 'Service', quantity: 1, rate: 100, lineTotal: 100 }],
    subtotal: 100,
    taxAmount: 18,
    totalAmount: 118,
  });
  assert.equal(invoiceTax.tax_amount, 18);
  assert.equal(invoiceTax.lines[0].tax_amount, 0);

  await assert.rejects(
    () => createDraft(fixtures, { lines: [{ description: 'Bad', quantity: 2, rate: 100, lineTotal: 201 }], subtotal: 200, taxAmount: 0, totalAmount: 200 }),
    (error) => error.code === 'VALIDATION_ERROR' && /lineTotal/.test(error.message),
  );
  await assert.rejects(
    () => createDraft(fixtures, { subtotal: 251 }),
    (error) => error.code === 'VALIDATION_ERROR' && /subtotal/.test(error.message),
  );
  await assert.rejects(
    () => createDraft(fixtures, { lines: [{ description: 'Bad', quantity: 0, rate: 100 }], subtotal: 0, totalAmount: 0 }),
    (error) => error.code === 'VALIDATION_ERROR' && /quantity/.test(error.message),
  );
});

test('operations invoice lifecycle requires Admin approval and allocates payment journals without mutating lines', async () => {
  const fixtures = createFixtures();
  const draft = await createDraft(fixtures);
  const originalLines = JSON.parse(JSON.stringify(draft.lines));

  const pending = await fixtures.service.submitInvoiceForApproval({
    actor: actor('accountant-1', 'accountant'),
    invoiceId: draft.id,
  });
  assert.equal(pending.status, 'pending_approval');

  await assert.rejects(
    () => fixtures.service.approveAndSendInvoice({ actor: actor('accountant-1', 'accountant'), invoiceId: draft.id }),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );

  const sent = await fixtures.service.approveAndSendInvoice({ actor: actor('admin-1', 'admin'), invoiceId: draft.id });
  assert.equal(sent.invoiceId, draft.id);
  assert.ok(sent.documentDeliveryId);
  assert.equal(fixtures.repository.invoices.get(draft.id).status, 'sent');
  assert.equal(fixtures.repository.approvals.values().next().value.status, 'approved');

  const partial = await fixtures.service.recordInvoicePayment({
    actor: actor('accountant-1', 'accountant'),
    invoiceId: draft.id,
    amount: 100,
    paymentReference: 'receipt-100',
  });
  assert.equal(partial.status, 'partially_paid');
  assert.equal(partial.paidAmount, 100);
  assert.deepEqual(partial.journalIds, ['journal-1']);
  assert.deepEqual(fixtures.repository.lines.get(draft.id), originalLines.map((line) => ({ ...line })));

  const paid = await fixtures.service.recordInvoicePayment({
    actor: actor('admin-1', 'admin'),
    invoiceId: draft.id,
    amount: 168,
    paymentReference: 'receipt-168',
  });
  assert.equal(paid.status, 'paid');
  assert.equal(paid.remainingAmount, 0);

  await assert.rejects(
    () => fixtures.service.recordInvoicePayment({ actor: actor('accountant-1', 'accountant'), invoiceId: draft.id, amount: 1, paymentReference: 'overpay' }),
    (error) => error.code === 'INVALID_STATE' && error.statusCode === 409,
  );
});

test('operations invoice verified donation automation can use the sending exception without bypassing manual approval', async () => {
  const fixtures = createFixtures();
  const automationService = createInvoiceService({
    repository: fixtures.repository,
    numberService: {
      async nextDocumentNumber({ financialYear }) { return `INV-AUTO-${financialYear}`; },
    },
    deliveryAdapter: {
      async queueInvoice() { return { id: 'delivery-automation' }; },
    },
    allowVerifiedPaymentException: true,
  });

  const draft = await automationService.createInvoiceDraft({
    ...baseInput({
      lines: [{ description: 'Verified donation', quantity: 1, rate: 250 }],
      subtotal: 250,
      taxAmount: 0,
      totalAmount: 250,
      sourceType: 'donation_automation',
      verifiedPayment: true,
    }),
  });
  assert.equal(draft.status, 'draft');
  assert.equal(draft.metadata.verified_payment_exception, true);
  const sent = await automationService.approveAndSendInvoice({ invoiceId: draft.id });
  assert.deepEqual(sent, { invoiceId: draft.id, documentDeliveryId: 'delivery-automation' });
  assert.equal(fixtures.repository.invoices.get(draft.id).status, 'sent');
});

test('operations invoice marks an unpaid invoice overdue by due date and rejects overpayment before accounting', async () => {
  const fixtures = createFixtures({ now: '2026-10-21T00:00:00.000Z' });
  const draft = await createDraft(fixtures, { dueDate: '2026-10-22' });
  await fixtures.service.submitInvoiceForApproval({ actor: actor('accountant-1', 'accountant'), invoiceId: draft.id });
  await fixtures.service.approveAndSendInvoice({ actor: actor('admin-1', 'admin'), invoiceId: draft.id });

  fixtures.setNow('2026-10-23T00:00:00.000Z');
  const overdue = await fixtures.service.getInvoice({ actor: actor('viewer-1', 'viewer'), invoiceId: draft.id });
  assert.equal(overdue.status, 'overdue');

  await assert.rejects(
    () => fixtures.service.recordInvoicePayment({ actor: actor('accountant-1', 'accountant'), invoiceId: draft.id, amount: 269, paymentReference: 'too-much' }),
    (error) => error.code === 'OVERPAYMENT' && error.statusCode === 409,
  );
  assert.equal(fixtures.repository.paymentCalls.length, 0);

  const partial = await fixtures.service.recordInvoicePayment({ actor: actor('accountant-1', 'accountant'), invoiceId: draft.id, amount: 100, paymentReference: 'overdue-partial' });
  assert.equal(partial.status, 'overdue');
});

test('operations invoice rejection returns the invoice to draft and requires an Admin reason', async () => {
  const fixtures = createFixtures();
  const draft = await createDraft(fixtures);
  await fixtures.service.submitInvoiceForApproval({ actor: actor('accountant-1', 'accountant'), invoiceId: draft.id });

  await assert.rejects(
    () => fixtures.service.rejectInvoiceApproval({ actor: actor('accountant-1', 'accountant'), invoiceId: draft.id, reason: 'No' }),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
  await assert.rejects(
    () => fixtures.service.rejectInvoiceApproval({ actor: actor('admin-1', 'admin'), invoiceId: draft.id, reason: '' }),
    (error) => error.code === 'VALIDATION_ERROR' && error.statusCode === 400,
  );

  const rejected = await fixtures.service.rejectInvoiceApproval({ actor: actor('admin-1', 'admin'), invoiceId: draft.id, reason: 'Add supporting contract' });
  assert.equal(rejected.status, 'draft');
  assert.equal(rejected.approvalStatus, 'rejected');
  assert.equal(fixtures.repository.invoices.get(draft.id).status, 'draft');
  assert.equal([...fixtures.repository.approvals.values()][0].status, 'rejected');
});

test('operations invoice cancellation creates a new draft and leaves sent invoice lines untouched', async () => {
  const fixtures = createFixtures();
  const draft = await createDraft(fixtures);
  await fixtures.service.submitInvoiceForApproval({ actor: actor('accountant-1', 'accountant'), invoiceId: draft.id });
  await fixtures.service.approveAndSendInvoice({ actor: actor('admin-1', 'admin'), invoiceId: draft.id });
  const beforeLines = JSON.parse(JSON.stringify(fixtures.repository.lines.get(draft.id)));

  await assert.rejects(
    () => fixtures.service.cancelAndReissueInvoice({ actor: actor('accountant-1', 'accountant'), invoiceId: draft.id, reason: 'Correction' }),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );

  const result = await fixtures.service.cancelAndReissueInvoice({ actor: actor('admin-1', 'admin'), invoiceId: draft.id, reason: 'Correct customer address' });
  assert.equal(result.cancelledInvoiceId, draft.id);
  assert.ok(result.replacementInvoiceId);
  assert.notEqual(result.replacementInvoiceId, draft.id);
  assert.equal(fixtures.repository.invoices.get(draft.id).status, 'cancelled');
  assert.deepEqual(fixtures.repository.lines.get(draft.id), beforeLines);
  assert.equal(fixtures.repository.invoices.get(result.replacementInvoiceId).status, 'draft');
  assert.equal(fixtures.repository.invoices.get(result.replacementInvoiceId).metadata.reissued_from_invoice_id, draft.id);
});

test('operations invoice validates the trust/person relationship and keeps viewers read-only', async () => {
  const fixtures = createFixtures();
  await assert.rejects(
    () => createDraft(fixtures, { personId: 'person-from-another-trust' }),
    (error) => error.code === 'IDENTITY_NOT_FOUND' && error.statusCode === 404,
  );
  await assert.rejects(
    () => createDraft(fixtures, {}, actor('viewer-1', 'viewer')),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );

  const draft = await createDraft(fixtures);
  const invoices = await fixtures.service.listInvoices({ actor: actor('viewer-1', 'viewer'), trustId: TRUST_A });
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].id, draft.id);
});
