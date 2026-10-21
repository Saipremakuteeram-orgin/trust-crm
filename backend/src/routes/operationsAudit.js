'use strict';

const express = require('express');
const {
  requireOperationsFeature,
  requireOperationsRole,
  requireOperationsTrust,
} = require('../middlewares/operationsAuth');
const {
  boundedError,
  nextAttemptAt,
  deliverDonationDocuments,
  MAX_DELIVERY_ATTEMPTS,
} = require('../operations/documentDeliveryService');

const DELIVERY_STATUSES = new Set(['pending', 'processing', 'retrying', 'sent', 'completed', 'failed']);

function auditError(message, statusCode = 400, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = 'AUDIT_VALIDATION_ERROR';
  error.details = details;
  return error;
}

function text(value, field, { maxLength = 200 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw auditError(`${field} must be text`);
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw auditError(`${field} is too long`);
  return normalized;
}

function dateValue(value, field) {
  const normalized = text(value, field, { maxLength: 30 });
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw auditError(`${field} must use YYYY-MM-DD format`);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw auditError(`${field} must be a valid calendar date`);
  }
  return normalized;
}

function normalizeAuditFilters(input = {}) {
  const from = dateValue(input.from, 'from');
  const to = dateValue(input.to, 'to');
  if (from && to && from > to) throw auditError('from must be before to');
  return {
    trustId: text(input.trustId ?? input.trust_id, 'trustId', { maxLength: 120 }),
    entityType: text(input.entityType ?? input.entity_type, 'entityType', { maxLength: 120 }),
    entityId: text(input.entityId ?? input.entity_id, 'entityId', { maxLength: 120 }),
    actorId: text(input.actorId ?? input.actor_id, 'actorId', { maxLength: 120 }),
    status: text(input.status, 'status', { maxLength: 40 })?.toLowerCase() || null,
    from,
    to,
    limit: Math.min(Math.max(Number(input.limit) || 100, 1), 200),
  };
}

function normalizeDeliveryFilters(input = {}) {
  const filters = normalizeAuditFilters(input);
  if (filters.status && !DELIVERY_STATUSES.has(filters.status)) throw auditError(`Unsupported delivery status: ${filters.status}`);
  return filters;
}

function actorRole(actor) {
  return actor?.role || actor?.profile?.role || null;
}

function requireActorRole(actor, roles, action) {
  if (!roles.includes(actorRole(actor))) {
    throw auditError(`Insufficient permissions to ${action}`, 403);
  }
}

function rowId(row, ...keys) {
  if (typeof row === 'string') return row;
  for (const key of keys) if (row && row[key] !== undefined && row[key] !== null) return row[key];
  return null;
}

function rowTrustId(row) {
  return rowId(row, 'trust_id', 'trustId');
}

function eventStatus(row) {
  return String(row?.status || '').toLowerCase();
}

function eventAttempts(row) {
  return Number(row?.attempt_count ?? row?.attemptCount ?? 0) || 0;
}

function isoStart(date) {
  return date ? `${date}T00:00:00.000Z` : null;
}

function isoEnd(date) {
  return date ? `${date}T23:59:59.999Z` : null;
}

function withinDateRange(value, from, to) {
  if (!value) return true;
  const date = String(value).slice(0, 10);
  return (!from || date >= from) && (!to || date <= to);
}

function ensureTrustScope(rows, trustId) {
  return (rows || []).filter((row) => !trustId || rowTrustId(row) === trustId);
}

function safeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const sensitiveKey = /(payload|secret|token|password|credential|private|signature|raw)/i;
  return Object.fromEntries(Object.entries(metadata)
    .filter(([key]) => !sensitiveKey.test(key))
    .filter(([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value) || (Array.isArray(value) && value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item)))));
}

function safeAuditRow(row) {
  return {
    id: row.id,
    trust_id: rowTrustId(row),
    entity_type: row.entity_type || row.entityType || null,
    entity_id: row.entity_id || row.entityId || null,
    action: row.action || null,
    actor_id: row.actor_id || row.actorId || null,
    request_id: row.request_id || row.requestId || null,
    request_ip: row.request_ip || row.requestIp || null,
    reason: row.reason || null,
    metadata: safeMetadata(row.metadata),
    created_at: row.created_at || row.createdAt || null,
  };
}

function safeDeliveryRow(row) {
  const receipt = Array.isArray(row.receipt) ? row.receipt[0] : row.receipt;
  const invoice = Array.isArray(row.invoice) ? row.invoice[0] : row.invoice;
  const donationId = rowId(row, 'donation_id', 'donationId', 'aggregate_id', 'aggregateId')
    || rowId(receipt, 'donation_id', 'donationId')
    || row?.metadata?.donation_id
    || row?.metadata?.donationId
    || invoice?.metadata?.donation_id
    || invoice?.metadata?.donationId;
  return {
    id: row.id,
    trust_id: rowTrustId(row),
    event_type: row.event_type || row.eventType || null,
    aggregate_type: row.aggregate_type || row.aggregateType || null,
    aggregate_id: row.aggregate_id || row.aggregateId || null,
    delivery_type: row.delivery_type || row.deliveryType || null,
    donation_id: donationId || null,
    receipt_id: row.receipt_id || row.receiptId || receipt?.id || null,
    invoice_id: row.invoice_id || row.invoiceId || invoice?.id || null,
    status: eventStatus(row) || 'unknown',
    attempt_count: eventAttempts(row),
    next_attempt_at: row.next_attempt_at || row.nextAttemptAt || null,
    last_error: row.last_error || row.lastError ? boundedError(row.last_error || row.lastError) : null,
    sent_at: row.sent_at || row.sentAt || null,
    completed_at: row.completed_at || row.completedAt || null,
    created_at: row.created_at || row.createdAt || null,
    updated_at: row.updated_at || row.updatedAt || null,
  };
}

function countStatuses(rows) {
  return (rows || []).reduce((counts, row) => {
    const status = eventStatus(row) || 'unknown';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
}

function limitRows(rows, limit) {
  return Number.isInteger(limit) ? rows.slice(0, limit) : rows;
}

function normalizeAuditRows(rows, filters) {
  return ensureTrustScope(rows, filters.trustId)
    .filter((row) => !filters.entityType || (row.entity_type || row.entityType) === filters.entityType)
    .filter((row) => !filters.entityId || (row.entity_id || row.entityId) === filters.entityId)
    .filter((row) => !filters.actorId || (row.actor_id || row.actorId) === filters.actorId)
    .filter((row) => withinDateRange(row.created_at || row.createdAt, filters.from, filters.to))
    .slice(0, filters.limit)
    .map(safeAuditRow);
}

function normalizeAutomationRows(rows, filters, { applyLimit = true } = {}) {
  const normalized = ensureTrustScope(rows, filters.trustId)
    .filter((row) => !filters.status || eventStatus(row) === filters.status)
    .filter((row) => withinDateRange(row.created_at || row.createdAt, filters.from, filters.to))
    .map(safeDeliveryRow);
  return applyLimit ? limitRows(normalized, filters.limit) : normalized;
}

function normalizeDeliveryRows(rows, filters, { applyLimit = true } = {}) {
  const normalized = ensureTrustScope(rows, filters.trustId)
    .filter((row) => !filters.status || eventStatus(row) === filters.status)
    .filter((row) => withinDateRange(row.created_at || row.createdAt, filters.from, filters.to))
    .map(safeDeliveryRow);
  return applyLimit ? limitRows(normalized, filters.limit) : normalized;
}

function deliveryCorrelationKeys(row) {
  const trustId = rowTrustId(row) || 'unknown';
  const keys = new Set();
  const add = (kind, value) => {
    if (value !== undefined && value !== null && String(value) !== '') keys.add(`${trustId}:${kind}:${value}`);
  };
  add('donation', row.donation_id || row.donationId || row.aggregate_id || row.aggregateId);
  add('receipt', row.receipt_id || row.receiptId);
  add('invoice', row.invoice_id || row.invoiceId);
  const eventData = row.event_data || row.eventData || {};
  add('delivery', row.delivery_id || row.deliveryId || row.document_delivery_id || row.documentDeliveryId || eventData.delivery_id || eventData.deliveryId);
  return [...keys];
}

function rowTimestamp(row) {
  return String(row?.updated_at || row?.updatedAt || row?.created_at || row?.createdAt || '');
}

function correlatedStatus(record) {
  return [record.delivery, record.automation_event]
    .filter(Boolean)
    .sort((left, right) => rowTimestamp(right).localeCompare(rowTimestamp(left)))[0]?.status || 'unknown';
}

function correlateDeliveryRows(deliveries, automationEvents) {
  const records = [];
  const byKey = new Map();
  const addKeys = (record, row) => {
    for (const key of deliveryCorrelationKeys(row)) {
      if (!byKey.has(key)) byKey.set(key, record);
    }
  };

  for (const delivery of deliveries || []) {
    const record = { delivery, automation_event: null };
    records.push(record);
    addKeys(record, delivery);
  }
  for (const automationEvent of automationEvents || []) {
    const record = deliveryCorrelationKeys(automationEvent)
      .map((key) => byKey.get(key))
      .find(Boolean);
    if (record) {
      record.automation_event = automationEvent;
    } else {
      const next = { delivery: null, automation_event: automationEvent };
      records.push(next);
      addKeys(next, automationEvent);
    }
  }

  return records.map((record) => ({
    ...record,
    status: correlatedStatus(record),
  }));
}

function preferredDeliveryDetail(record) {
  return record.automation_event || record.delivery;
}

function deliveryErrorDetail(record) {
  return [record.delivery, record.automation_event]
    .filter((row) => row?.last_error || row?.lastError)
    .sort((left, right) => rowTimestamp(right).localeCompare(rowTimestamp(left)))[0] || null;
}

async function callDeliveryService(service, donationId) {
  if (typeof service === 'function') return service({ donationId });
  if (service && typeof service.deliverDonationDocuments === 'function') return service.deliverDonationDocuments({ donationId });
  throw new TypeError('deliveryService must provide deliverDonationDocuments');
}

function createOperationsAuditService({ repository, deliveryService, now = () => new Date() } = {}) {
  let resolvedRepository = repository;
  const getRepository = () => {
    if (!resolvedRepository) resolvedRepository = createSupabaseOperationsAuditRepository();
    return resolvedRepository;
  };
  const getDeliveryService = () => deliveryService || { deliverDonationDocuments };

  return {
    async getOperationsAudit(input = {}) {
      const actor = input.actor;
      requireActorRole(actor, ['admin', 'accountant', 'viewer'], 'read audit history');
      const filters = normalizeAuditFilters(input);
      const rows = await getRepository().listAuditEvents(filters);
      return normalizeAuditRows(rows, filters);
    },

    async getDeliveryHealth(input = {}) {
      const actor = input.actor;
      requireActorRole(actor, ['admin', 'accountant', 'viewer'], 'read delivery health');
      const filters = normalizeDeliveryFilters(input);
      const repositoryInstance = getRepository();
      const [deliveryRows, automationRows] = await Promise.all([
        repositoryInstance.listDocumentDeliveries({ ...filters, limit: null }),
        repositoryInstance.listAutomationEvents({ ...filters, limit: null }),
      ]);
      const allDeliveries = normalizeDeliveryRows(deliveryRows, filters, { applyLimit: false });
      const allAutomationEvents = normalizeAutomationRows(automationRows, filters, { applyLimit: false });
      const records = correlateDeliveryRows(allDeliveries, allAutomationEvents);
      const deliveries = limitRows(allDeliveries, filters.limit);
      const automationEvents = limitRows(allAutomationEvents, filters.limit);
      const retryableRecords = records.filter((record) => ['failed', 'retrying'].includes(record.status));
      const retryable = limitRows(retryableRecords.map(preferredDeliveryDetail), filters.limit);
      const lastErrors = limitRows(records
        .map((record) => ({ record, row: deliveryErrorDetail(record) }))
        .filter(({ row }) => row)
        .sort((left, right) => rowTimestamp(right.row).localeCompare(rowTimestamp(left.row)))
        .map((record) => {
          const row = record.row;
          return {
            id: row.id,
            trust_id: rowTrustId(row),
            status: record.record.status,
            error: row.last_error || row.lastError,
            created_at: row.created_at || row.createdAt || null,
            updated_at: row.updated_at || row.updatedAt || null,
          };
        }), filters.limit);
      const uniqueCounts = countStatuses(records);
      return {
        counts: {
          deliveries: countStatuses(allDeliveries),
          automation_events: countStatuses(allAutomationEvents),
          unique: uniqueCounts,
          failed: uniqueCounts.failed || 0,
          retryable: retryableRecords.length,
          total: records.length,
        },
        deliveries,
        automation_events: automationEvents,
        retryable,
        last_errors: lastErrors,
        filters,
      };
    },

    async getAutomationEvents(input = {}) {
      const actor = input.actor;
      requireActorRole(actor, ['admin', 'accountant', 'viewer'], 'read automation events');
      const filters = normalizeDeliveryFilters(input);
      const rows = await getRepository().listAutomationEvents(filters);
      return normalizeAutomationRows(rows, filters);
    },

    async retryAutomationEvent({ actor, trustId, eventId } = {}) {
      requireActorRole(actor, ['admin', 'accountant'], 'retry document delivery');
      const normalizedTrustId = text(trustId, 'trustId', { maxLength: 120 });
      const normalizedEventId = text(eventId, 'eventId', { maxLength: 120 });
      if (!normalizedTrustId || !normalizedEventId) throw auditError('A concrete trust and event ID are required to retry delivery');
      const repositoryInstance = getRepository();
      const event = await repositoryInstance.getAutomationEvent({ id: normalizedEventId, trustId: normalizedTrustId });
      if (!event || rowTrustId(event) !== normalizedTrustId) throw auditError('Automation event was not found', 404);
      if (!['failed', 'retrying'].includes(eventStatus(event))) {
        throw auditError('Only failed or retrying automation events can be retried', 409);
      }
      const donationId = rowId(event, 'aggregate_id', 'aggregateId') || event.event_data?.donationId || event.event_data?.donation_id;
      if (!donationId) throw auditError('Automation event does not identify a donation', 409);

      const currentTime = now instanceof Function ? now() : now;
      const currentDate = currentTime instanceof Date ? currentTime : new Date(currentTime);
      if (Number.isNaN(currentDate.getTime())) throw auditError('now must be a valid date');
      const nowIso = currentDate.toISOString();
      const attemptCount = eventAttempts(event) + 1;
      if (typeof repositoryInstance.resetDeliveryForRetry === 'function') {
        await repositoryInstance.resetDeliveryForRetry({ trustId: normalizedTrustId, donationId, now: nowIso });
      }
      if (typeof repositoryInstance.updateAutomationEvent === 'function') {
        await repositoryInstance.updateAutomationEvent({
          id: normalizedEventId,
          trustId: normalizedTrustId,
          status: 'retrying',
          nextAttemptAt: nowIso,
          lastError: null,
        });
      }

      let deliveryResult;
      try {
        deliveryResult = await callDeliveryService(getDeliveryService(), donationId);
      } catch (error) {
        const attempts = eventAttempts(event) + 1;
        const failed = attempts >= MAX_DELIVERY_ATTEMPTS || Boolean(error?.permanent);
        const nextStatus = failed ? 'failed' : 'retrying';
        if (typeof repositoryInstance.updateAutomationEvent === 'function') {
          await repositoryInstance.updateAutomationEvent({
            id: normalizedEventId,
            trustId: normalizedTrustId,
            status: nextStatus,
            attemptCount: attempts,
            nextAttemptAt: failed ? null : nextAttemptAt(attempts, currentDate),
            lastError: boundedError(error),
          });
        }
        throw error;
      }

      const deliveryStatus = String(deliveryResult?.status || '').toLowerCase();
      const completed = ['sent', 'completed'].includes(deliveryStatus);
      const retrying = ['pending', 'processing', 'retrying'].includes(deliveryStatus);
      const status = completed ? 'completed' : retrying ? 'retrying' : 'failed';
      const patch = {
        id: normalizedEventId,
        trustId: normalizedTrustId,
        status,
        attemptCount,
        nextAttemptAt: retrying ? nextAttemptAt(attemptCount, currentDate) : null,
        lastError: completed ? null : (deliveryResult?.lastError || `Document delivery ${status}`),
        completedAt: completed ? nowIso : null,
      };
      const updatedEvent = typeof repositoryInstance.updateAutomationEvent === 'function'
        ? await repositoryInstance.updateAutomationEvent(patch)
        : { ...event, status, last_error: patch.lastError };
      if (typeof repositoryInstance.appendAuditEvent === 'function') {
        await repositoryInstance.appendAuditEvent({
          trustId: normalizedTrustId,
          entityType: 'operations_automation_event',
          entityId: normalizedEventId,
          action: 'retry_delivery',
          actorId: actor?.id || null,
          requestId: actor?.requestId || actor?.request_id || null,
          requestIp: actor?.requestIp || actor?.request_ip || actor?.ip || null,
           metadata: { donationId, deliveryStatus },
        });
      }
      return { event: updatedEvent, delivery: deliveryResult, status };
    },
  };
}

function createSupabaseOperationsAuditRepository(client) {
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

  function scopedQuery(table, filters, { dateColumn = 'created_at', select = '*' } = {}) {
    let query = getClient().from(table).select(select);
    if (filters.trustId) query = query.eq('trust_id', filters.trustId);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.from) query = query.gte(dateColumn, isoStart(filters.from));
    if (filters.to) query = query.lte(dateColumn, isoEnd(filters.to));
    const ordered = query.order(dateColumn, { ascending: false });
    return filters.limit === null ? ordered : ordered.limit(filters.limit || 100);
  }

  return {
    async listAuditEvents(filters = {}) {
      let query = getClient().from('operations_audit_events').select('*');
      if (filters.trustId) query = query.eq('trust_id', filters.trustId);
      if (filters.entityType) query = query.eq('entity_type', filters.entityType);
      if (filters.entityId) query = query.eq('entity_id', filters.entityId);
      if (filters.actorId) query = query.eq('actor_id', filters.actorId);
      if (filters.from) query = query.gte('created_at', isoStart(filters.from));
      if (filters.to) query = query.lte('created_at', isoEnd(filters.to));
      return many(query.order('created_at', { ascending: false }).limit(filters.limit || 100), 'load operations audit events');
    },

    async listDocumentDeliveries(filters = {}) {
      return many(scopedQuery('operations_document_deliveries', filters, {
        select: '*, receipt:operations_receipts(id, donation_id), invoice:operations_invoices(id, metadata)',
      }), 'load document delivery health');
    },

    async listAutomationEvents(filters = {}) {
      return many(scopedQuery('operations_automation_events', filters), 'load automation event health');
    },

    async getAutomationEvent({ id, trustId }) {
      const { data, error } = await getClient().from('operations_automation_events').select('*').eq('id', id).eq('trust_id', trustId).maybeSingle();
      if (error) {
        const wrapped = new Error(`load automation event: ${error.message}`);
        wrapped.statusCode = 500;
        throw wrapped;
      }
      return data || null;
    },

    async resetDeliveryForRetry({ trustId, donationId, now }) {
      const receipts = await many(
        getClient().from('operations_receipts').select('id').eq('trust_id', trustId).eq('donation_id', donationId),
        'find donation receipt for retry',
      );
      const receiptIds = receipts.map((receipt) => receipt.id).filter(Boolean);
      if (receiptIds.length === 0) return [];
      return many(
        getClient().from('operations_document_deliveries')
          .update({ status: 'retrying', next_attempt_at: now, last_error: null, updated_at: now })
          .eq('trust_id', trustId)
          .in('receipt_id', receiptIds)
          .in('status', ['failed', 'retrying'])
          .select('*'),
        'reset document delivery for retry',
      );
    },

    async updateAutomationEvent({ id, trustId, status, attemptCount, nextAttemptAt: retryAt, lastError, completedAt }) {
      const patch = { status, updated_at: new Date().toISOString() };
      if (attemptCount !== undefined) patch.attempt_count = attemptCount;
      if (retryAt !== undefined) patch.next_attempt_at = retryAt instanceof Date ? retryAt.toISOString() : retryAt;
      if (lastError !== undefined) patch.last_error = lastError;
      if (completedAt !== undefined) patch.completed_at = completedAt instanceof Date ? completedAt.toISOString() : completedAt;
      const { data, error } = await getClient().from('operations_automation_events').update(patch).eq('id', id).eq('trust_id', trustId).select('*').single();
      if (error) {
        const wrapped = new Error(`update automation event: ${error.message}`);
        wrapped.statusCode = 500;
        throw wrapped;
      }
      return data;
    },

    async appendAuditEvent(input) {
      const { data, error } = await getClient().from('operations_audit_events').insert({
        trust_id: input.trustId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        action: input.action,
        actor_id: input.actorId || null,
        request_id: input.requestId || null,
        request_ip: input.requestIp || null,
        reason: input.reason || null,
        metadata: input.metadata || {},
      }).select('*').single();
      if (error) {
        const wrapped = new Error(`append operations audit event: ${error.message}`);
        wrapped.statusCode = 500;
        throw wrapped;
      }
      return data;
    },
  };
}

function actorFromRequest(req) {
  return {
    id: req.user?.id,
    role: req.profile?.role,
    requestId: typeof req.get === 'function' ? req.get('x-request-id') : req.headers?.['x-request-id'],
    requestIp: req.ip,
  };
}

function sendAuditError(res, error, fallback) {
  return res.status(Number.isInteger(error?.statusCode) ? error.statusCode : 500).json({
    success: false,
    message: error?.message || fallback,
    ...(error?.details ? { errors: error.details } : {}),
  });
}

function createOperationsAuditRouter({ service } = {}) {
  const router = express.Router();
  let resolvedService = service;
  const getService = () => {
    if (!resolvedService) resolvedService = createOperationsAuditService();
    return resolvedService;
  };

  router.use(requireOperationsFeature('trusts'));

  router.get('/', requireOperationsRole('admin', 'accountant', 'viewer'), requireOperationsTrust({ required: false, allowAll: true }), async (req, res) => {
    try {
      const result = await getService().getOperationsAudit({ ...req.query, trustId: req.operationsTrustId, actor: actorFromRequest(req) });
      return res.json({ success: true, result });
    } catch (error) {
      return sendAuditError(res, error, 'Operations audit request failed');
    }
  });

  router.get('/delivery-health', requireOperationsFeature('automationMonitor'), requireOperationsRole('admin', 'accountant', 'viewer'), requireOperationsTrust({ required: false, allowAll: true }), async (req, res) => {
    try {
      const result = await getService().getDeliveryHealth({ ...req.query, trustId: req.operationsTrustId, actor: actorFromRequest(req) });
      return res.json({ success: true, result });
    } catch (error) {
      return sendAuditError(res, error, 'Operations delivery health request failed');
    }
  });

  return router;
}

function createOperationsAutomationRouter({ service } = {}) {
  const router = express.Router();
  let resolvedService = service;
  const getService = () => {
    if (!resolvedService) resolvedService = createOperationsAuditService();
    return resolvedService;
  };

  router.use(requireOperationsFeature('automationMonitor'));

  router.get('/', requireOperationsRole('admin', 'accountant', 'viewer'), requireOperationsTrust({ required: false, allowAll: true }), async (req, res) => {
    try {
      const result = await getService().getAutomationEvents({ ...req.query, trustId: req.operationsTrustId, actor: actorFromRequest(req) });
      return res.json({ success: true, result });
    } catch (error) {
      return sendAuditError(res, error, 'Operations automation request failed');
    }
  });

  router.post('/:id/retry', requireOperationsRole('admin', 'accountant'), requireOperationsTrust({ required: true, write: true, sources: ['params', 'query', 'header', 'body'], paramNames: ['trust_id', 'trustId'] }), async (req, res) => {
    try {
      const result = await getService().retryAutomationEvent({
        actor: actorFromRequest(req),
        trustId: req.operationsTrustId,
        eventId: req.params.id,
      });
      return res.json({ success: true, result });
    } catch (error) {
      return sendAuditError(res, error, 'Operations automation retry failed');
    }
  });

  return router;
}

const router = createOperationsAuditRouter();
router.createOperationsAuditRouter = createOperationsAuditRouter;
router.createOperationsAutomationRouter = createOperationsAutomationRouter;

let defaultService;
function getDefaultService() {
  if (!defaultService) defaultService = createOperationsAuditService();
  return defaultService;
}

module.exports = router;
module.exports.createOperationsAuditRouter = createOperationsAuditRouter;
module.exports.createOperationsAutomationRouter = createOperationsAutomationRouter;
module.exports.createOperationsAuditService = createOperationsAuditService;
module.exports.createSupabaseOperationsAuditRepository = createSupabaseOperationsAuditRepository;
module.exports.normalizeAuditFilters = normalizeAuditFilters;
module.exports.getOperationsAudit = (input) => getDefaultService().getOperationsAudit(input);
module.exports.getDeliveryHealth = (input) => getDefaultService().getDeliveryHealth(input);
