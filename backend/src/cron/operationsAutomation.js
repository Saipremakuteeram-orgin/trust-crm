'use strict';

const {
  AUTOMATION_EVENT_TYPE,
  MAX_BACKOFF_MS,
  MAX_DELIVERY_ATTEMPTS,
  boundedError,
  createDocumentDeliveryService,
  nextAttemptAt,
} = require('../operations/documentDeliveryService');
const { isOperationsEnabled } = require('../operations/featureFlags');

const MAX_BATCH_SIZE = 25;

function eventDonationId(event) {
  return event?.aggregate_id
    || event?.aggregateId
    || event?.event_data?.donationId
    || event?.event_data?.donation_id
    || event?.eventData?.donationId;
}

function createSupabaseAutomationRepository(client) {
  const getClient = () => client || require('../config/supabaseAdmin');

  async function updateEvent(id, patch) {
    const dbPatch = { updated_at: new Date().toISOString() };
    const fields = {
      status: 'status', attemptCount: 'attempt_count', nextAttemptAt: 'next_attempt_at',
      lastError: 'last_error', completedAt: 'completed_at',
    };
    for (const [key, value] of Object.entries(patch)) {
      if (fields[key]) dbPatch[fields[key]] = value instanceof Date ? value.toISOString() : value;
    }
    const { data, error } = await getClient().from('operations_automation_events')
      .update(dbPatch).eq('id', id).select('*').single();
    if (error) throw error;
    return data;
  }

  return {
    async claimAutomationEvents({ limit, now }) {
      const nowIso = now.toISOString();
      const { data, error } = await getClient().from('operations_automation_events')
        .select('*')
        .eq('event_type', AUTOMATION_EVENT_TYPE)
        .in('status', ['pending', 'retrying'])
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
        .order('created_at', { ascending: true })
        .limit(limit);
      if (error) throw error;

      const claimed = [];
      for (const candidate of data || []) {
        const attemptCount = Number(candidate.attempt_count || 0) + 1;
        const { data: locked, error: lockError } = await getClient().from('operations_automation_events')
          .update({ status: 'processing', attempt_count: attemptCount, updated_at: nowIso })
          .eq('id', candidate.id)
          .eq('status', candidate.status)
          .select('*')
          .maybeSingle();
        if (lockError) throw lockError;
        if (locked) claimed.push(locked);
      }
      return claimed;
    },

    async completeAutomationEvent({ id, now }) {
      return updateEvent(id, { status: 'completed', completedAt: now });
    },

    async retryAutomationEvent({ id, nextAttemptAt: retryAt, lastError, attemptCount }) {
      return updateEvent(id, {
        status: 'retrying',
        nextAttemptAt: retryAt,
        lastError,
        attemptCount,
      });
    },

    async failAutomationEvent({ id, lastError, attemptCount }) {
      return updateEvent(id, { status: 'failed', lastError, attemptCount });
    },
  };
}

function repositoryMethod(repository, ...names) {
  const name = names.find((candidate) => typeof repository?.[candidate] === 'function');
  if (!name) throw new TypeError(`automation repository must provide ${names.join(' or ')}`);
  return repository[name].bind(repository);
}

function callDelivery(service, donationId) {
  if (typeof service === 'function') return service({ donationId });
  if (service && typeof service.deliverDonationDocuments === 'function') return service.deliverDonationDocuments({ donationId });
  throw new TypeError('deliveryService must provide deliverDonationDocuments');
}

function safeBatchLimit(value) {
  if (value === undefined || value === null) return MAX_BATCH_SIZE;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(Math.floor(parsed), MAX_BATCH_SIZE);
}

async function processAutomationBatch({ limit = MAX_BATCH_SIZE, now = new Date(), repository, deliveryService } = {}) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) throw new TypeError('now must be a valid date');
  const batchLimit = safeBatchLimit(limit);
  if (batchLimit === 0) return { processed: 0, completed: 0, retrying: 0, failed: 0 };

  const adapter = repository || createSupabaseAutomationRepository();
  const delivery = deliveryService || createDocumentDeliveryService();
  const claim = repositoryMethod(adapter, 'claimAutomationEvents', 'claimPendingEvents');
  const complete = repositoryMethod(adapter, 'completeAutomationEvent', 'markCompleted');
  const retry = repositoryMethod(adapter, 'retryAutomationEvent', 'markRetrying');
  const fail = repositoryMethod(adapter, 'failAutomationEvent', 'markFailed');
  const events = (await claim({ limit: batchLimit, now: date }) || []).slice(0, batchLimit);
  const result = { processed: 0, completed: 0, retrying: 0, failed: 0 };

  for (const event of events || []) {
    result.processed += 1;
    const donationId = eventDonationId(event);
    const attemptCount = Number(event.attempt_count || event.attemptCount || 1);
    try {
      if (!donationId) {
        await fail({ id: event.id, lastError: 'Automation event has no donation ID', attemptCount });
        result.failed += 1;
        continue;
      }

      const deliveryResult = await callDelivery(delivery, donationId);
      const status = String(deliveryResult?.status || '').toLowerCase();
      if (status === 'sent' || status === 'completed') {
        await complete({ id: event.id, now: date });
        result.completed += 1;
      } else if (status === 'retrying' || status === 'pending' || status === 'processing') {
        const retryAt = nextAttemptAt(attemptCount, date);
        await retry({
          id: event.id,
          nextAttemptAt: retryAt,
          lastError: 'Document delivery is pending retry',
          attemptCount,
        });
        result.retrying += 1;
      } else {
        await fail({ id: event.id, lastError: 'Document delivery permanently failed', attemptCount });
        result.failed += 1;
      }
    } catch (error) {
      const permanent = Boolean(error?.permanent || error?.code === 'INVALID_RECIPIENT' || error?.code === 'INVALID_EMAIL');
      const exhausted = attemptCount >= MAX_DELIVERY_ATTEMPTS;
      if (permanent || exhausted) {
        await fail({ id: event.id, lastError: boundedError(error), attemptCount });
        result.failed += 1;
      } else {
        const retryAt = nextAttemptAt(attemptCount, date);
        await retry({
          id: event.id,
          nextAttemptAt: retryAt,
          lastError: boundedError(error),
          attemptCount,
        });
        result.retrying += 1;
      }
    }
  }
  return result;
}

function startOperationsAutomationMonitor({ env = process.env, cronImpl, processBatch = processAutomationBatch } = {}) {
  if (!isOperationsEnabled('automationMonitor', env)) return null;
  const cron = cronImpl || require('node-cron');
  const task = cron.schedule('* * * * *', () => {
    Promise.resolve()
      .then(() => processBatch({ limit: MAX_BATCH_SIZE, now: new Date() }))
      .catch((error) => console.error('[operations automation] worker failed:', boundedError(error)));
  });
  console.log('Operations automation monitor started (every minute, max 25 events)');
  return task;
}

module.exports = {
  MAX_BATCH_SIZE,
  createSupabaseAutomationRepository,
  eventDonationId,
  processAutomationBatch,
  safeBatchLimit,
  startOperationsAutomationMonitor,
};
