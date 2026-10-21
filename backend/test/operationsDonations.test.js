'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createDonationService,
  normalizeEmail,
  normalizePhone,
  paymentIdempotencyKey,
} = require('../src/operations/donationService');

const TRUST_A = 'trust-a';
const TRUST_B = 'trust-b';

function memoryRepository() {
  let sequence = 0;
  const nextId = (prefix) => `${prefix}-${++sequence}`;
  const repository = {
    paymentEvents: new Map(),
    paymentEventUpdates: [],
    people: new Map(),
    trustPeople: new Map(),
    donations: new Map(),
    transactions: new Map(),
    approvals: new Map(),
    automationEvents: new Map(),
    journals: [],

    async findPaymentEvent({ idempotencyKey }) {
      return repository.paymentEvents.get(idempotencyKey) || null;
    },

    async createPaymentEvent(input) {
      if (repository.paymentEvents.has(input.idempotencyKey)) {
        const error = new Error('payment event already exists');
        error.code = '23505';
        throw error;
      }
      const event = {
        id: nextId('payment-event'),
        ...input,
        trust_id: input.trustId,
        payment_id: input.paymentId,
        status: 'received',
      };
      repository.paymentEvents.set(input.idempotencyKey, event);
      return event;
    },

    async updatePaymentEvent({ id, status, verifiedAt, completedAt }) {
      const event = [...repository.paymentEvents.values()].find((candidate) => candidate.id === id);
      repository.paymentEventUpdates.push({ id, status });
      event.status = status;
      event.verified_at = verifiedAt;
      event.completed_at = completedAt;
      return event;
    },

    async findPersonByNormalizedIdentity({ normalizedEmail, normalizedPhone }) {
      return [...repository.people.values()].find((person) => (
        (normalizedEmail && person.normalized_email === normalizedEmail)
        || (normalizedPhone && person.normalized_phone === normalizedPhone)
      )) || null;
    },

    async createPerson({ donor, normalizedEmail, normalizedPhone }) {
      const existing = await repository.findPersonByNormalizedIdentity({ normalizedEmail, normalizedPhone });
      if (existing) {
        const error = new Error('person already exists');
        error.code = '23505';
        throw error;
      }
      const person = {
        id: nextId('person'),
        full_name: donor.fullName,
        email: donor.email,
        phone: donor.phone,
        normalized_email: normalizedEmail,
        normalized_phone: normalizedPhone,
      };
      repository.people.set(person.id, person);
      return person;
    },

    async ensureTrustPerson({ trustId, personId }) {
      const key = `${trustId}:${personId}:donor`;
      if (!repository.trustPeople.has(key)) {
        repository.trustPeople.set(key, { id: nextId('trust-person'), trust_id: trustId, person_id: personId });
      }
      return repository.trustPeople.get(key);
    },

    async findDonationByPaymentEvent({ paymentEventId }) {
      return [...repository.donations.values()].find((donation) => donation.payment_event_id === paymentEventId) || null;
    },

    async createDonation(input) {
      const donation = {
        id: nextId('donation'),
        trust_id: input.trustId,
        person_id: input.personId,
        payment_event_id: input.paymentEventId,
        transaction_id: null,
        amount: input.amount,
        currency: input.currency,
        purpose: input.purpose,
        payment_mode: input.paymentMode,
        status: input.status,
        donation_date: input.donationDate,
        metadata: input.metadata,
      };
      repository.donations.set(donation.id, donation);
      return donation;
    },

    async postVerifiedDonation({ donation, paymentEvent }) {
      if (donation.transaction_id) return { transactionId: donation.transaction_id, status: 'posted' };
      const transaction = {
        id: nextId('transaction'),
        trust_id: donation.trust_id,
        person_id: donation.person_id,
        payment_event_id: paymentEvent.id,
        status: 'posted',
        transaction_type: 'credit',
        amount: donation.amount,
        currency: donation.currency,
      };
      repository.transactions.set(transaction.id, transaction);
      donation.transaction_id = transaction.id;
      donation.status = 'posted';
      repository.journals.push({ id: nextId('journal'), transaction_id: transaction.id, balanced: true });
      return { transactionId: transaction.id, status: 'posted' };
    },

    async findAutomationEvent({ donationId }) {
      return repository.automationEvents.get(donationId) || null;
    },

    async enqueueAutomationEvent(input) {
      const event = { id: nextId('automation'), ...input, status: 'pending' };
      repository.automationEvents.set(input.donationId, event);
      return event;
    },

    async createOfflineDonation(input) {
      const transaction = {
        id: nextId('transaction'),
        trust_id: input.trustId,
        person_id: input.personId,
        transaction_type: 'credit',
        status: 'pending_approval',
        amount: input.amount,
        currency: input.currency,
      };
      const donation = {
        id: nextId('donation'),
        trust_id: input.trustId,
        person_id: input.personId,
        transaction_id: transaction.id,
        status: 'pending_approval',
        amount: input.amount,
        currency: input.currency,
        payment_mode: input.paymentMode,
      };
      const approval = {
        id: nextId('approval'),
        donation_id: donation.id,
        transaction_id: transaction.id,
        status: 'pending_approval',
        requested_by: input.actorId,
      };
      repository.transactions.set(transaction.id, transaction);
      repository.donations.set(donation.id, donation);
      repository.approvals.set(approval.id, approval);
      return { transaction, donation, approval };
    },

    async listDonations() {
      return [...repository.donations.values()];
    },

    async getDonation({ id }) {
      return repository.donations.get(id) || null;
    },
  };
  return repository;
}

function verifiedPayload({ paymentId = 'pay-1', gateway = 'Razorpay', trustId = TRUST_A, donor = {}, amount = 250, currency = 'INR' } = {}) {
  return {
    donation: {
      trust_id: trustId,
      gateway,
      payment_id: paymentId,
      amount,
      currency,
      purpose: 'General seva',
      donor_name: donor.name || 'Asha Donor',
      donor_email: donor.email || 'ASHA@example.com',
      donor_phone: donor.phone || '+91 (98765) 43210',
    },
  };
}

test('operations donation idempotency returns one payment event, transaction, and automation event', async () => {
  const repository = memoryRepository();
  const service = createDonationService({ repository, now: () => new Date('2026-10-20T10:00:00.000Z') });
  const payload = verifiedPayload();

  const first = await service.processVerifiedDonation({ payload });
  const second = await service.processVerifiedDonation({ payload });

  assert.deepEqual(second, first);
  assert.equal(repository.paymentEvents.size, 1);
  assert.equal(repository.donations.size, 1);
  assert.equal(repository.transactions.size, 1);
  assert.equal(repository.journals.length, 1);
  assert.equal(repository.automationEvents.size, 1);
  assert.equal(repository.paymentEventUpdates.length, 2);
  assert.equal(first.status, 'posted');
});

test('operations donation gateway and payment ID form a distinct idempotency key', async () => {
  const repository = memoryRepository();
  const service = createDonationService({ repository });

  const razorpay = await service.processVerifiedDonation({
    payload: verifiedPayload({ gateway: 'razorpay', paymentId: 'same-payment' }),
  });
  const stripe = await service.processVerifiedDonation({
    payload: verifiedPayload({ gateway: 'stripe', paymentId: 'same-payment' }),
  });

  assert.notEqual(razorpay.donationId, stripe.donationId);
  assert.notEqual(razorpay.transactionId, stripe.transactionId);
  assert.equal(repository.paymentEvents.size, 2);
  assert.equal(repository.automationEvents.size, 2);
  assert.equal(paymentIdempotencyKey({ gateway: 'Razorpay', paymentId: ' same-payment ' }), 'razorpay:same-payment');
});

test('operations donation rejects a reused payment key with different payment data', async () => {
  const repository = memoryRepository();
  const service = createDonationService({ repository });

  await service.processVerifiedDonation({
    payload: verifiedPayload({ paymentId: 'fixed-payment', amount: 250 }),
  });

  await assert.rejects(
    () => service.processVerifiedDonation({
      payload: verifiedPayload({ paymentId: 'fixed-payment', amount: 275 }),
    }),
    (error) => error.code === 'IDEMPOTENCY_CONFLICT' && error.statusCode === 409,
  );
  assert.equal(repository.paymentEvents.size, 1);
  assert.equal(repository.donations.size, 1);
  assert.equal(repository.transactions.size, 1);
});

test('operations donation rejects malformed currency instead of truncating it', async () => {
  const repository = memoryRepository();
  const service = createDonationService({ repository });

  await assert.rejects(
    () => service.processVerifiedDonation({
      payload: verifiedPayload({ paymentId: 'bad-currency', currency: 'INRXXX' }),
    }),
    (error) => error.code === 'VALIDATION_ERROR' && error.statusCode === 400,
  );
  assert.equal(repository.paymentEvents.size, 0);
});

test('operations donation shared-person matching normalizes email and phone and links each trust once', async () => {
  const repository = memoryRepository();
  const service = createDonationService({ repository });

  const first = await service.findOrCreateSharedPerson({
    trustId: TRUST_A,
    donor: { name: 'Asha', email: ' Donor@Example.COM ', phone: '+91 (98765) 43210' },
  });
  const second = await service.findOrCreateSharedPerson({
    trustId: TRUST_B,
    donor: { name: 'Asha Updated', email: 'donor@example.com', phone: '0091-98765-43210' },
  });

  assert.equal(normalizeEmail(' Donor@Example.COM '), 'donor@example.com');
  assert.equal(normalizePhone('+91 (98765) 43210'), '+919876543210');
  assert.equal(first.personId, second.personId);
  assert.equal(repository.people.size, 1);
  assert.equal(repository.trustPeople.size, 2);
});

test('operations offline donation is pending Admin approval and has no posted journal', async () => {
  const repository = memoryRepository();
  const service = createDonationService({ repository, now: () => new Date('2026-10-20T10:00:00.000Z') });

  const result = await service.recordOfflineDonation({
    trustId: TRUST_A,
    amount: 500,
    currency: 'INR',
    paymentMode: 'cash',
    donor: { name: 'Offline Donor', email: 'offline@example.com' },
    purpose: 'Temple seva',
    actor: { id: 'accountant-1', role: 'accountant' },
  });

  assert.equal(result.status, 'pending_approval');
  assert.ok(result.approvalId);
  assert.equal(result.postedJournalId, null);
  assert.equal(repository.transactions.get(result.transactionId).status, 'pending_approval');
  assert.equal(repository.donations.get(result.donationId).status, 'pending_approval');
  assert.equal(repository.approvals.get(result.approvalId).status, 'pending_approval');
  assert.equal(repository.journals.length, 0);
});

test('operations offline donation rejects Viewer writes before persistence', async () => {
  const repository = memoryRepository();
  const service = createDonationService({ repository });

  await assert.rejects(
    () => service.recordOfflineDonation({
      trustId: TRUST_A,
      amount: 500,
      donor: { name: 'Viewer Donor' },
      actor: { id: 'viewer-1', role: 'viewer' },
    }),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
  assert.equal(repository.transactions.size, 0);
  assert.equal(repository.donations.size, 0);
});
