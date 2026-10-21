'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createOperationsAuditService } = require('../src/routes/operationsAudit');

const TRUST_A = 'trust-a';
const TRUST_B = 'trust-b';
const TRUST_C = 'trust-c';

function actor(id, role) {
  return { id, role, requestId: `request-${id}`, requestIp: '127.0.0.1' };
}

function createAuditRepository() {
  const events = new Map([
    ['event-a', { id: 'event-a', trust_id: TRUST_A, event_type: 'donation_documents', aggregate_type: 'donation', aggregate_id: 'donation-a', status: 'failed', attempt_count: 2, last_error: 'Provider unavailable', created_at: '2026-10-20T08:00:00.000Z', updated_at: '2026-10-20T08:10:00.000Z', event_data: {} }],
    ['event-b', { id: 'event-b', trust_id: TRUST_B, event_type: 'donation_documents', aggregate_type: 'donation', aggregate_id: 'donation-b', status: 'retrying', attempt_count: 1, last_error: 'Temporary failure', created_at: '2026-10-20T09:00:00.000Z', updated_at: '2026-10-20T09:05:00.000Z', event_data: {} }],
    ['event-c', { id: 'event-c', trust_id: TRUST_C, event_type: 'donation_documents', aggregate_type: 'donation', aggregate_id: 'donation-c', status: 'completed', attempt_count: 1, created_at: '2026-10-20T10:00:00.000Z', updated_at: '2026-10-20T10:05:00.000Z', event_data: {} }],
  ]);
  const auditEvents = [
    { id: 'audit-a', trust_id: TRUST_A, entity_type: 'operations_transaction', entity_id: 'transaction-a', actor_id: 'admin-a', action: 'approve_and_post', created_at: '2026-10-20T08:00:00.000Z' },
    { id: 'audit-b', trust_id: TRUST_B, entity_type: 'operations_invoice', entity_id: 'invoice-b', actor_id: 'accountant-b', action: 'create', created_at: '2026-10-20T09:00:00.000Z' },
    { id: 'audit-c', trust_id: TRUST_C, entity_type: 'operations_payroll_run', entity_id: 'payroll-c', actor_id: 'admin-c', action: 'approve', created_at: '2026-10-20T10:00:00.000Z' },
  ];
  const deliveries = [
    { id: 'delivery-a-failed', trust_id: TRUST_A, donation_id: 'donation-a', status: 'failed', attempt_count: 2, last_error: 'Provider unavailable', created_at: '2026-10-20T08:00:00.000Z', updated_at: '2026-10-20T08:10:00.000Z' },
    { id: 'delivery-a-sent', trust_id: TRUST_A, status: 'sent', attempt_count: 1, created_at: '2026-10-20T07:00:00.000Z', updated_at: '2026-10-20T07:05:00.000Z' },
    { id: 'delivery-b-retrying', trust_id: TRUST_B, status: 'retrying', attempt_count: 1, last_error: 'Temporary failure', created_at: '2026-10-20T09:00:00.000Z', updated_at: '2026-10-20T09:05:00.000Z' },
  ];
  const repository = {
    auditEvents,
    deliveries,
    events,
    appendedAuditEvents: [],
    resetCalls: [],
    async listAuditEvents() { return auditEvents; },
    async listDocumentDeliveries() { return deliveries; },
    async listAutomationEvents() { return [...events.values()]; },
    async getAutomationEvent({ id, trustId }) {
      const event = events.get(id);
      return event && event.trust_id === trustId ? event : null;
    },
    async resetDeliveryForRetry(input) {
      repository.resetCalls.push(input);
    },
    async updateAutomationEvent({ id, trustId, ...patch }) {
      const event = events.get(id);
      if (!event || event.trust_id !== trustId) return null;
      if (patch.attemptCount !== undefined) event.attempt_count = patch.attemptCount;
      if (patch.nextAttemptAt !== undefined) event.next_attempt_at = patch.nextAttemptAt;
      if (patch.lastError !== undefined) event.last_error = patch.lastError;
      if (patch.status !== undefined) event.status = patch.status;
      if (patch.completedAt !== undefined) event.completed_at = patch.completedAt;
      return event;
    },
    async appendAuditEvent(input) {
      repository.appendedAuditEvents.push(input);
      return input;
    },
  };
  return repository;
}

test('operations audit reads are trust-scoped for Viewer and support entity and actor filters', async () => {
  const service = createOperationsAuditService({ repository: createAuditRepository() });

  const trustRows = await service.getOperationsAudit({
    actor: actor('viewer-a', 'viewer'),
    trustId: TRUST_A,
    entityType: 'operations_transaction',
    actorId: 'admin-a',
  });
  assert.deepEqual(trustRows.map((row) => row.id), ['audit-a']);
  assert.equal(trustRows.every((row) => row.trust_id === TRUST_A), true);

  const consolidatedRows = await service.getOperationsAudit({ actor: actor('viewer-a', 'viewer') });
  assert.deepEqual(consolidatedRows.map((row) => row.trust_id).sort(), [TRUST_A, TRUST_B, TRUST_C].sort());
});

test('delivery health reports trust-safe counts, retryable rows, and bounded last errors', async () => {
  const service = createOperationsAuditService({ repository: createAuditRepository() });

  const result = await service.getDeliveryHealth({ actor: actor('viewer-a', 'viewer'), trustId: TRUST_A });

  assert.deepEqual(result.counts.deliveries, { failed: 1, sent: 1 });
  assert.deepEqual(result.counts.automation_events, { failed: 1 });
  assert.deepEqual(result.counts.unique, { failed: 1, sent: 1 });
  assert.equal(result.counts.failed, 1);
  assert.equal(result.counts.retryable, 1);
  assert.equal(result.counts.total, 2);
  assert.equal(result.deliveries.every((row) => row.trust_id === TRUST_A), true);
  assert.equal(result.automation_events.every((row) => row.trust_id === TRUST_A), true);
  assert.equal(result.last_errors.every((row) => row.trust_id === TRUST_A), true);
});

test('delivery health correlates paired automation and document rows without losing detail', async () => {
  const repository = createAuditRepository();
  const service = createOperationsAuditService({ repository });

  const result = await service.getDeliveryHealth({ actor: actor('viewer-a', 'viewer'), trustId: TRUST_A });

  assert.equal(result.deliveries.some((row) => row.id === 'delivery-a-failed'), true);
  assert.equal(result.automation_events.some((row) => row.id === 'event-a'), true);
  assert.equal(result.counts.total, 2);
  assert.equal(result.counts.retryable, 1);
  assert.equal(result.retryable.length, 1);
  assert.equal(result.retryable[0].id, 'event-a');
});

test('delivery health counts all filtered records while limiting detail rows', async () => {
  const repository = createAuditRepository();
  for (let index = 0; index < 105; index += 1) {
    repository.deliveries.push({
      id: `delivery-a-extra-${index}`,
      trust_id: TRUST_A,
      status: 'failed',
      attempt_count: 1,
      created_at: `2026-10-19T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
      updated_at: `2026-10-19T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
    });
  }

  const service = createOperationsAuditService({ repository });
  const result = await service.getDeliveryHealth({ actor: actor('viewer-a', 'viewer'), trustId: TRUST_A, limit: 2 });

  assert.equal(result.deliveries.length, 2);
  assert.equal(result.counts.deliveries.failed, 106);
  assert.equal(result.counts.total, 107);
  assert.equal(result.counts.failed, 106);
});

test('retry actions allow Admin and Accountant, deny Viewer, and preserve trust isolation', async () => {
  const repository = createAuditRepository();
  const deliveryCalls = [];
  const service = createOperationsAuditService({
    repository,
    deliveryService: async ({ donationId }) => {
      deliveryCalls.push(donationId);
      return { status: 'sent', deliveryId: 'delivery-a-failed' };
    },
    now: () => new Date('2026-10-20T11:00:00.000Z'),
  });

  await assert.rejects(
    () => service.retryAutomationEvent({ actor: actor('viewer-a', 'viewer'), trustId: TRUST_A, eventId: 'event-a' }),
    (error) => error.statusCode === 403,
  );
  await assert.rejects(
    () => service.retryAutomationEvent({ actor: actor('accountant-a', 'accountant'), trustId: TRUST_A, eventId: 'event-b' }),
    (error) => error.statusCode === 404,
  );

  const result = await service.retryAutomationEvent({ actor: actor('accountant-a', 'accountant'), trustId: TRUST_A, eventId: 'event-a' });
  assert.equal(result.status, 'completed');
  assert.deepEqual(deliveryCalls, ['donation-a']);
  assert.deepEqual(repository.resetCalls, [{ trustId: TRUST_A, donationId: 'donation-a', now: '2026-10-20T11:00:00.000Z' }]);
  assert.equal(repository.events.get('event-a').status, 'completed');
  assert.equal(repository.appendedAuditEvents[0].trustId, TRUST_A);
  assert.equal(repository.appendedAuditEvents[0].actorId, 'accountant-a');
});

test('manual retry persists the incremented attempt count while still retrying', async () => {
  const repository = createAuditRepository();
  const service = createOperationsAuditService({
    repository,
    deliveryService: async () => ({ status: 'retrying', lastError: 'Still unavailable' }),
    now: () => new Date('2026-10-20T11:00:00.000Z'),
  });

  const result = await service.retryAutomationEvent({
    actor: actor('admin-a', 'admin'),
    trustId: TRUST_A,
    eventId: 'event-a',
  });

  assert.equal(result.status, 'retrying');
  assert.equal(repository.events.get('event-a').attempt_count, 3);
  assert.equal(repository.events.get('event-a').status, 'retrying');
});
