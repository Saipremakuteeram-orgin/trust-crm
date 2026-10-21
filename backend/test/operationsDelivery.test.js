'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createDocumentDeliveryService } = require('../src/operations/documentDeliveryService');
const { processAutomationBatch, startOperationsAutomationMonitor } = require('../src/cron/operationsAutomation');

function memoryDocumentRepository({ email = 'asha@example.com', concurrentReads = false } = {}) {
  let sequence = 0;
  const nextId = (prefix) => `${prefix}-${++sequence}`;
  const pauseRead = async () => {
    if (concurrentReads) await new Promise((resolve) => setImmediate(resolve));
  };
  const repo = {
    uploads: [],
    receipts: new Map(),
    invoices: new Map(),
    deliveries: new Map(),
    async findDonationDocumentContext() {
      return {
        trust: { id: 'trust-a', name: 'Sundar Community Trust' },
        person: { id: 'person-a', full_name: 'Asha Donor', email },
        donation: {
          id: 'donation-a', trust_id: 'trust-a', person_id: 'person-a', transaction_id: 'transaction-a',
          amount: 1250, currency: 'INR', donation_date: '2026-10-20', purpose: 'Community kitchen',
        },
      };
    },
    async findReceiptByDonation({ donationId } = {}) {
      await pauseRead();
      return [...repo.receipts.values()].find((receipt) => receipt.donation_id === donationId) || null;
    },
    async findInvoiceByDonation({ donationId, transactionId } = {}) {
      await pauseRead();
      return [...repo.invoices.values()].find((invoice) => (
        (transactionId && invoice.transaction_id === transactionId)
        || invoice.metadata?.donation_id === donationId
      )) || null;
    },
    async createReceipt(input) {
      if ([...repo.receipts.values()].some((candidate) => candidate.donation_id === input.donationId)) {
        const error = new Error('receipt already exists');
        error.code = '23505';
        throw error;
      }
      const receipt = { id: nextId('receipt'), donation_id: input.donationId, receipt_number: input.receiptNumber, status: 'issued', amount: input.amount, currency: input.currency };
      repo.receipts.set(receipt.id, receipt);
      return receipt;
    },
    async updateReceipt({ id, ...patch }) {
      const receipt = repo.receipts.get(id);
      if (patch.documentPath !== undefined) receipt.document_path = patch.documentPath;
      if (patch.status !== undefined) receipt.status = patch.status;
      if (patch.sentAt !== undefined) receipt.sent_at = patch.sentAt;
      return receipt;
    },
    async createInvoice(input) {
      if ([...repo.invoices.values()].some((candidate) => (
        (input.transactionId && candidate.transaction_id === input.transactionId)
        || candidate.metadata?.donation_id === input.metadata?.donation_id
      ))) {
        const error = new Error('invoice already exists');
        error.code = '23505';
        throw error;
      }
      const invoice = {
        id: nextId('invoice'), transaction_id: input.transactionId, invoice_number: input.invoiceNumber, status: 'draft', total_amount: input.totalAmount,
        subtotal: input.subtotal, tax_amount: input.taxAmount, currency: input.currency, metadata: input.metadata || {},
      };
      repo.invoices.set(invoice.id, invoice);
      return invoice;
    },
    async updateInvoice({ id, ...patch }) {
      const invoice = repo.invoices.get(id);
      if (patch.documentPath !== undefined) {
        invoice.document_path = patch.documentPath;
        invoice.metadata = { ...(invoice.metadata || {}), ...(patch.metadata || {}), document_path: patch.documentPath };
      }
      if (patch.status !== undefined) invoice.status = patch.status;
      if (patch.sentAt !== undefined) invoice.sent_at = patch.sentAt;
      return invoice;
    },
    async findCombinedDelivery() {
      await pauseRead();
      return [...repo.deliveries.values()][0] || null;
    },
    async createDelivery(input) {
      if ([...repo.deliveries.values()].some((candidate) => candidate.receipt_id === input.receiptId && candidate.invoice_id === input.invoiceId)) {
        const error = new Error('delivery already exists');
        error.code = '23505';
        throw error;
      }
      const delivery = {
        id: nextId('delivery'), trust_id: input.trustId, receipt_id: input.receiptId, invoice_id: input.invoiceId,
        delivery_type: 'combined', recipient_email: input.recipientEmail, status: 'pending', attempt_count: 0,
      };
      repo.deliveries.set(delivery.id, delivery);
      return delivery;
    },
    async claimDelivery({ id }) {
      const delivery = repo.deliveries.get(id);
      if (!delivery || !['pending', 'retrying'].includes(delivery.status)) return null;
      delivery.status = 'processing';
      delivery.attempt_count += 1;
      return delivery;
    },
    async updateDelivery({ id, ...patch }) {
      const delivery = repo.deliveries.get(id);
      for (const [key, value] of Object.entries(patch)) {
        const snake = key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
        delivery[snake] = value instanceof Date ? value.toISOString() : value;
      }
      return delivery;
    },
  };
  return repo;
}

function deliveryFixture({ email = 'asha@example.com', mailResults = [{ ok: true, id: 'mail-1' }], concurrentReads = false } = {}) {
  const repository = memoryDocumentRepository({ email, concurrentReads });
  const mailCalls = [];
  const mailAdapter = {
    async send(input) {
      mailCalls.push(input);
      return mailResults.shift() || { ok: true, id: `mail-${mailCalls.length}` };
    },
  };
  const storageAdapter = {
    async uploadFile(path, buffer, contentType) {
      repository.uploads.push({ path, buffer, contentType });
    },
  };
  let receiptNumber = 0;
  let invoiceNumber = 0;
  const numberService = {
    async nextDocumentNumber({ documentType }) {
      if (documentType === 'receipt') return `RCT-2026-27-${String(++receiptNumber).padStart(6, '0')}`;
      return `INV-2026-27-${String(++invoiceNumber).padStart(6, '0')}`;
    },
  };
  const renderer = {
    async renderDonationReceipt() { return Buffer.from('%PDF-receipt'); },
    async renderDonationInvoice() { return Buffer.from('%PDF-invoice'); },
  };
  return { repository, mailAdapter, storageAdapter, numberService, renderer, mailCalls, counts: () => ({ receiptNumber, invoiceNumber }) };
}

test('operations delivery sends one combined email with two PDF attachments', async () => {
  const fixture = deliveryFixture();
  const service = createDocumentDeliveryService({ ...fixture, now: () => new Date('2026-10-20T10:00:00.000Z') });

  const result = await service.deliverDonationDocuments({ donationId: 'donation-a' });

  assert.deepEqual(result, { receiptId: 'receipt-1', invoiceId: 'invoice-2', deliveryId: 'delivery-3', status: 'sent' });
  assert.equal(fixture.mailCalls.length, 1);
  assert.equal(fixture.mailCalls[0].to, 'asha@example.com');
  assert.equal(fixture.mailCalls[0].subject, 'Donation receipt and invoice – Sundar Community Trust');
  assert.equal(fixture.mailCalls[0].attachments.length, 2);
  assert.deepEqual(fixture.mailCalls[0].attachments.map((attachment) => attachment.contentType), ['application/pdf', 'application/pdf']);
  assert.equal(fixture.repository.deliveries.get('delivery-3').status, 'sent');
  assert.equal(fixture.repository.receipts.size, 1);
  assert.equal(fixture.repository.invoices.size, 1);
});

test('concurrent delivery workers reuse unique donation documents and one delivery record', async () => {
  const fixture = deliveryFixture({ concurrentReads: true });
  const serviceOptions = { ...fixture, now: () => new Date('2026-10-20T10:00:00.000Z') };
  const services = [createDocumentDeliveryService(serviceOptions), createDocumentDeliveryService(serviceOptions)];

  const results = await Promise.all(services.map((service) => service.deliverDonationDocuments({ donationId: 'donation-a' })));

  assert.equal(fixture.repository.receipts.size, 1);
  assert.equal(fixture.repository.invoices.size, 1);
  assert.equal(fixture.repository.deliveries.size, 1);
  assert.equal(fixture.mailCalls.length, 1);
  assert.ok(results.every((result) => ['sent', 'processing'].includes(result.status)));
});

test('temporary mail failure retries with bounded backoff without duplicate documents', async () => {
  const fixture = deliveryFixture({ mailResults: [{ ok: false, reason: 'temporary provider outage' }, { ok: true, id: 'mail-2' }] });
  let current = new Date('2026-10-20T10:00:00.000Z');
  const service = createDocumentDeliveryService({ ...fixture, now: () => current });

  const first = await service.deliverDonationDocuments({ donationId: 'donation-a' });
  assert.equal(first.status, 'retrying');
  assert.equal(fixture.repository.deliveries.get('delivery-3').next_attempt_at, '2026-10-20T10:01:00.000Z');
  assert.equal(fixture.repository.receipts.size, 1);
  assert.equal(fixture.repository.invoices.size, 1);
  assert.deepEqual(fixture.counts(), { receiptNumber: 1, invoiceNumber: 1 });
  assert.equal(fixture.repository.uploads.length, 2);

  current = new Date('2026-10-20T10:02:00.000Z');
  const second = await service.deliverDonationDocuments({ donationId: 'donation-a' });
  assert.equal(second.status, 'sent');
  assert.equal(fixture.mailCalls.length, 2);
  assert.equal(fixture.repository.uploads.length, 2);
  assert.deepEqual(fixture.counts(), { receiptNumber: 1, invoiceNumber: 1 });
});

test('invalid recipient email is a permanent failure and is not retried', async () => {
  const fixture = deliveryFixture({ email: 'not-an-email' });
  const service = createDocumentDeliveryService({ ...fixture, now: () => new Date('2026-10-20T10:00:00.000Z') });

  const first = await service.deliverDonationDocuments({ donationId: 'donation-a' });
  const second = await service.deliverDonationDocuments({ donationId: 'donation-a' });

  assert.equal(first.status, 'failed');
  assert.equal(second.status, 'failed');
  assert.equal(fixture.mailCalls.length, 0);
  assert.equal(fixture.repository.deliveries.get('delivery-3').last_error, 'Recipient email is invalid');
});

test('automation worker caps claims and processing at 25 events', async () => {
  const state = { claimedLimit: null, completed: [], retrying: [], failed: [] };
  const events = Array.from({ length: 40 }, (_, index) => ({ id: `event-${index}`, aggregate_id: `donation-${index}`, attempt_count: 1 }));
  const repository = {
    async claimAutomationEvents({ limit }) {
      state.claimedLimit = limit;
      return events;
    },
    async completeAutomationEvent({ id }) { state.completed.push(id); },
    async retryAutomationEvent({ id }) { state.retrying.push(id); },
    async failAutomationEvent({ id }) { state.failed.push(id); },
  };
  const result = await processAutomationBatch({
    limit: 100,
    now: new Date('2026-10-20T10:00:00.000Z'),
    repository,
    deliveryService: async () => ({ status: 'sent' }),
  });

  assert.equal(state.claimedLimit, 25);
  assert.deepEqual(result, { processed: 25, completed: 25, retrying: 0, failed: 0 });
  assert.equal(state.completed.length, 25);
});

test('operations automation monitor is opt-in with the exact true flag', () => {
  const schedules = [];
  const cronImpl = { schedule(expression, callback) { schedules.push({ expression, callback }); return { stop() {} }; } };
  assert.equal(startOperationsAutomationMonitor({ env: { ENABLE_OPERATIONS_AUTOMATION_MONITOR: 'TRUE' }, cronImpl }), null);
  assert.equal(startOperationsAutomationMonitor({ env: { ENABLE_OPERATIONS_AUTOMATION_MONITOR: 'true' }, cronImpl, processBatch: async () => ({}) })?.constructor?.name, 'Object');
  assert.equal(schedules.length, 1);
  assert.equal(schedules[0].expression, '* * * * *');
});
