'use strict';

const crypto = require('crypto');
const {
  OperationsServiceError,
  getActorId,
  getActorRole,
  requireActor,
} = require('./postingService');

const ONLINE_GATEWAY = 'razorpay';
const AUTOMATION_EVENT_TYPE = 'donation_documents';
const DONATION_ACCOUNT_CODE = 'DONATION_INCOME';
const SUPPORTED_PAYMENT_MODES = new Set(['cash', 'digital', 'bank_transfer', 'cheque', 'other']);

function requiredText(value, field) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new OperationsServiceError(`${field} is required`, {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details: { [field]: `${field} is required` },
    });
  }
  return String(value).trim();
}

function optionalText(value, maxLength = 500) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function positiveAmount(value) {
  const amount = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new OperationsServiceError('Donation amount must be a positive number', {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details: { amount: 'must be a positive number' },
    });
  }
  return amount;
}

function normalizeEmail(value) {
  const email = optionalText(value, 320);
  return email ? email.toLowerCase() : null;
}

function normalizePhone(value) {
  const phone = optionalText(value, 80);
  if (!phone) return null;

  const hasLeadingPlus = phone.trim().startsWith('+');
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!digits) return null;
  return `${hasLeadingPlus || phone.trim().startsWith('00') ? '+' : ''}${digits}`;
}

function normalizeDonor(donor = {}) {
  const source = donor && typeof donor === 'object' && !Array.isArray(donor) ? donor : {};
  const fullName = optionalText(source.fullName ?? source.full_name ?? source.name, 200);
  const email = normalizeEmail(source.email ?? source.donor_email);
  const phone = normalizePhone(source.phone ?? source.donor_phone);
  const pan = optionalText(source.pan, 40);

  if (!fullName && !email && !phone) {
    throw new OperationsServiceError('A donor name, email, or phone is required', {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details: { donor: 'name, email, or phone is required' },
    });
  }

  return {
    fullName: fullName || email || phone || 'Website Donor',
    email,
    phone,
    pan,
    address: source.address && typeof source.address === 'object' && !Array.isArray(source.address)
      ? { ...source.address }
      : {},
  };
}

function normalizeGateway(value) {
  return (optionalText(value, 80) || ONLINE_GATEWAY).toLowerCase();
}

function paymentIdempotencyKey({ gateway, paymentId }) {
  const normalizedGateway = requiredText(gateway || ONLINE_GATEWAY, 'gateway').toLowerCase();
  const normalizedPaymentId = requiredText(paymentId, 'paymentId');
  return `${normalizedGateway}:${normalizedPaymentId}`;
}

function getDonationPayload(payload = {}) {
  const donation = payload && typeof payload.donation === 'object' && !Array.isArray(payload.donation)
    ? payload.donation
    : payload;
  const donor = donation?.donor && typeof donation.donor === 'object'
    ? { ...donation.donor }
    : {
      name: donation?.donor_name,
      email: donation?.donor_email,
      phone: donation?.donor_phone,
      pan: donation?.donor_pan,
    };

  return {
    donation,
    trustId: donation?.trust_id || donation?.trustId || payload?.trust_id || payload?.trustId || process.env.OPERATIONS_DEFAULT_TRUST_ID,
    gateway: normalizeGateway(donation?.gateway || payload?.gateway),
    paymentId: donation?.payment_id || donation?.paymentId,
    amount: donation?.amount,
    currency: donation?.currency || payload?.currency || 'INR',
    purpose: optionalText(donation?.purpose || donation?.description || 'Seva', 500) || 'Seva',
    donor,
    providerReference: optionalText(donation?.provider_reference || donation?.providerReference, 200),
    paymentMode: donation?.method === 'auto' ? 'digital' : 'digital',
  };
}

function normalizeCurrency(value) {
  const currency = (value === undefined || value === null || String(value).trim() === ''
    ? 'INR'
    : String(value).trim()).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new OperationsServiceError('Currency must be a three-letter uppercase code', {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details: { currency: 'must be a three-letter uppercase code' },
    });
  }
  return currency;
}

function payloadHash(input) {
  const canonical = JSON.stringify({
    trustId: input.trustId,
    gateway: input.gateway,
    paymentId: input.paymentId,
    amount: input.amount,
    currency: input.currency,
    purpose: input.purpose,
    donor: {
      email: input.donor.email,
      phone: input.donor.phone,
    },
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function requestContext(request) {
  return {
    requestId: typeof request?.get === 'function' ? request.get('x-request-id') : request?.requestId || null,
    requestIp: request?.ip || request?.requestIp || null,
  };
}

function idOf(value, ...keys) {
  if (typeof value === 'string') return value;
  for (const key of keys) {
    if (value?.[key]) return value[key];
  }
  return null;
}

function rowAmount(row) {
  return row?.amount === undefined || row?.amount === null ? null : Number(row.amount);
}

function databaseError(error, operation) {
  if (error instanceof OperationsServiceError) throw error;
  const code = error?.code || 'DATABASE_ERROR';
  throw new OperationsServiceError(error?.message || `Failed to ${operation}`, {
    code,
    statusCode: error?.statusCode || (code === 'PGRST116' ? 404 : 400),
  });
}

function getSupabaseClient(client) {
  return client || require('../config/supabaseAdmin');
}

function singleResult(data, operation) {
  if (!data) {
    throw new OperationsServiceError(`Database did not return a result for ${operation}`, {
      code: 'EMPTY_DATABASE_RESULT',
      statusCode: 502,
    });
  }
  return data;
}

function createSupabaseDonationRepository(client) {
  const getClient = () => getSupabaseClient(client);

  return {
    async findPaymentEvent({ idempotencyKey }) {
      const { data, error } = await getClient()
        .from('operations_payment_events')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (error) databaseError(error, 'find payment event');
      return data;
    },

    async createPaymentEvent(input) {
      const row = {
        trust_id: input.trustId,
        gateway: input.gateway,
        payment_id: input.paymentId,
        idempotency_key: input.idempotencyKey,
        event_type: 'payment',
        status: 'received',
        amount: input.amount,
        currency: input.currency,
        payload_hash: input.payloadHash,
        provider_reference: input.providerReference,
        metadata: {},
      };
      const { data, error } = await getClient()
        .from('operations_payment_events')
        .insert(row)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },

    async updatePaymentEvent({ id, status, verifiedAt, completedAt, personId }) {
      const patch = { status, updated_at: new Date().toISOString() };
      if (verifiedAt) patch.verified_at = verifiedAt;
      if (completedAt) patch.completed_at = completedAt;
      if (personId) patch.person_id = personId;
      const { data, error } = await getClient()
        .from('operations_payment_events')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) databaseError(error, 'update payment event');
      return singleResult(data, 'update payment event');
    },

    async findPersonByNormalizedIdentity({ normalizedEmail, normalizedPhone }) {
      if (normalizedEmail) {
        const { data, error } = await getClient()
          .from('operations_people')
          .select('*')
          .eq('normalized_email', normalizedEmail)
          .maybeSingle();
        if (error) databaseError(error, 'find donor by email');
        if (data) return data;
      }
      if (normalizedPhone) {
        const { data, error } = await getClient()
          .from('operations_people')
          .select('*')
          .eq('normalized_phone', normalizedPhone)
          .limit(1)
          .maybeSingle();
        if (error) databaseError(error, 'find donor by phone');
        if (data) return data;
      }
      return null;
    },

    async createPerson({ donor, normalizedEmail, normalizedPhone, actorId }) {
      const { data, error } = await getClient()
        .from('operations_people')
        .insert({
          full_name: donor.fullName,
          email: donor.email,
          phone: donor.phone,
          normalized_email: normalizedEmail,
          normalized_phone: normalizedPhone,
          pan: donor.pan,
          address: donor.address,
          created_by: actorId || null,
          updated_by: actorId || null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return singleResult(data, 'create shared donor');
    },

    async ensureTrustPerson({ trustId, personId, actorId }) {
      const row = {
        trust_id: trustId,
        person_id: personId,
        relationship_type: 'donor',
        is_active: true,
        created_by: actorId || null,
        updated_by: actorId || null,
      };
      const { data, error } = await getClient()
        .from('operations_trust_people')
        .upsert(row, { onConflict: 'trust_id,person_id,relationship_type', ignoreDuplicates: true })
        .select('*')
        .maybeSingle();
      if (error) databaseError(error, 'link donor to trust');
      return data || row;
    },

    async findDonationByPaymentEvent({ paymentEventId }) {
      const { data, error } = await getClient()
        .from('operations_donations')
        .select('*')
        .eq('payment_event_id', paymentEventId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) databaseError(error, 'find donation by payment event');
      return data;
    },

    async createDonation(input) {
      const { data, error } = await getClient()
        .from('operations_donations')
        .insert({
          trust_id: input.trustId,
          person_id: input.personId,
          payment_event_id: input.paymentEventId || null,
          transaction_id: input.transactionId || null,
          status: input.status,
          amount: input.amount,
          currency: input.currency,
          donation_date: input.donationDate,
          purpose: input.purpose,
          payment_mode: input.paymentMode,
          created_by: input.actorId || null,
          verified_at: input.verifiedAt || null,
          metadata: input.metadata || {},
        })
        .select('*')
        .single();
      if (error) throw error;
      return singleResult(data, 'create donation');
    },

    async createOfflineDonation(input) {
      const transactionInsert = {
        trust_id: input.trustId,
        person_id: input.personId,
        transaction_type: 'credit',
        status: 'pending_approval',
        amount: input.amount,
        currency: input.currency,
        transaction_date: input.donationDate,
        description: input.purpose,
        source_type: 'offline_donation',
        created_by: input.actorId,
        updated_by: input.actorId,
        metadata: input.metadata || {},
      };
      const { data: transaction, error: transactionError } = await getClient()
        .from('operations_transactions')
        .insert(transactionInsert)
        .select('*')
        .single();
      if (transactionError) databaseError(transactionError, 'create offline donation transaction');

      let donation;
      try {
        const { data, error } = await getClient()
          .from('operations_donations')
          .insert({
            trust_id: input.trustId,
            person_id: input.personId,
            transaction_id: transaction.id,
            status: 'pending_approval',
            amount: input.amount,
            currency: input.currency,
            donation_date: input.donationDate,
            purpose: input.purpose,
            payment_mode: input.paymentMode,
            created_by: input.actorId,
            metadata: input.metadata || {},
          })
          .select('*')
          .single();
        if (error) databaseError(error, 'create offline donation');
        donation = singleResult(data, 'create offline donation');
      } catch (error) {
        throw error instanceof OperationsServiceError ? error : databaseError(error, 'create offline donation');
      }

      const { error: transactionLinkError } = await getClient()
        .from('operations_transactions')
        .update({ source_id: donation.id, updated_at: new Date().toISOString() })
        .eq('id', transaction.id);
      if (transactionLinkError) databaseError(transactionLinkError, 'link offline donation transaction');

      const { data: approval, error: approvalError } = await getClient()
        .from('operations_approval_requests')
        .insert({
          trust_id: input.trustId,
          record_type: 'operations_donation',
          record_id: donation.id,
          transaction_id: transaction.id,
          status: 'pending_approval',
          requested_by: input.actorId,
          reason: 'Offline donation requires Admin approval',
        })
        .select('*')
        .single();
      if (approvalError) databaseError(approvalError, 'create offline donation approval');

      const { error: actionError } = await getClient()
        .from('operations_approval_actions')
        .insert({
          trust_id: input.trustId,
          approval_request_id: approval.id,
          action: 'submit',
          actor_id: input.actorId,
          comment: 'Offline donation submitted for Admin approval',
        });
      if (actionError) databaseError(actionError, 'record offline donation approval action');

      return { donation, transaction: { ...transaction, source_id: donation.id }, approval };
    },

    async postVerifiedDonation({ donation, paymentEvent, postedAt }) {
      const existingTransactionId = idOf(donation, 'transaction_id', 'transactionId');
      if (existingTransactionId) {
        return { transactionId: existingTransactionId, status: 'posted' };
      }

      const { data: existingTransaction, error: existingTransactionError } = await getClient()
        .from('operations_transactions')
        .select('*')
        .eq('source_type', 'operations_donation')
        .eq('source_id', donation.id)
        .limit(1)
        .maybeSingle();
      if (existingTransactionError) databaseError(existingTransactionError, 'find posted donation transaction');

      const transaction = existingTransaction || await (async () => {
        const { data, error } = await getClient()
          .from('operations_transactions')
          .insert({
            trust_id: donation.trust_id || donation.trustId,
            person_id: donation.person_id || donation.personId,
            payment_event_id: paymentEvent.id,
            transaction_type: 'credit',
            status: 'posted',
            amount: donation.amount,
            currency: donation.currency,
            transaction_date: donation.donation_date || new Date(postedAt).toISOString().slice(0, 10),
            description: donation.purpose || 'Verified online donation',
            source_type: 'operations_donation',
            source_id: donation.id,
            posted_at: postedAt,
            metadata: { gateway: paymentEvent.gateway, paymentEventId: paymentEvent.id },
          })
          .select('*')
          .single();
        if (error) databaseError(error, 'post donation transaction');
        return singleResult(data, 'post donation transaction');
      })();

      const { data: existingJournal, error: existingJournalError } = await getClient()
        .from('operations_journal_entries')
        .select('id')
        .eq('transaction_id', transaction.id)
        .eq('status', 'posted')
        .limit(1)
        .maybeSingle();
      if (existingJournalError) databaseError(existingJournalError, 'find posted donation journal');

      if (!existingJournal) {
        const entryNumber = `DON-${donation.id}`;
        const { data: journal, error: journalError } = await getClient()
          .from('operations_journal_entries')
          .insert({
            trust_id: donation.trust_id || donation.trustId,
            transaction_id: transaction.id,
            entry_number: entryNumber,
            entry_date: donation.donation_date || new Date(postedAt).toISOString().slice(0, 10),
            description: donation.purpose || 'Verified online donation',
            reference: paymentEvent.payment_id,
            status: 'posted',
            currency: donation.currency,
            total_debit: donation.amount,
            total_credit: donation.amount,
            posted_at: postedAt,
          })
          .select('*')
          .single();
        if (journalError) databaseError(journalError, 'post donation journal');
        const { error: linesError } = await getClient()
          .from('operations_journal_lines')
          .insert([
            {
              trust_id: donation.trust_id || donation.trustId,
              journal_entry_id: journal.id,
              line_number: 1,
              account_code: 'OPERATIONS_OFFSET',
              description: 'Verified donation balancing line',
              debit: donation.amount,
              credit: 0,
              currency: donation.currency,
            },
            {
              trust_id: donation.trust_id || donation.trustId,
              journal_entry_id: journal.id,
              line_number: 2,
              account_code: DONATION_ACCOUNT_CODE,
              description: 'Verified online donation income',
              debit: 0,
              credit: donation.amount,
              currency: donation.currency,
            },
          ]);
        if (linesError) databaseError(linesError, 'post donation journal lines');
      }

      const { error: donationError } = await getClient()
        .from('operations_donations')
        .update({
          transaction_id: transaction.id,
          status: 'posted',
          posted_at: postedAt,
          updated_at: postedAt,
        })
        .eq('id', donation.id);
      if (donationError) databaseError(donationError, 'link posted donation');

      return { transactionId: transaction.id, status: 'posted' };
    },

    async findAutomationEvent({ donationId }) {
      const { data, error } = await getClient()
        .from('operations_automation_events')
        .select('*')
        .eq('event_type', AUTOMATION_EVENT_TYPE)
        .eq('aggregate_type', 'operations_donation')
        .eq('aggregate_id', donationId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) databaseError(error, 'find donation automation event');
      return data;
    },

    async enqueueAutomationEvent(input) {
      const { data, error } = await getClient()
        .from('operations_automation_events')
        .insert({
          trust_id: input.trustId,
          event_type: AUTOMATION_EVENT_TYPE,
          aggregate_type: 'operations_donation',
          aggregate_id: input.donationId,
          status: 'pending',
          event_data: {
            donationId: input.donationId,
            transactionId: input.transactionId,
            paymentEventId: input.paymentEventId,
          },
        })
        .select('*')
        .single();
      if (error) throw error;
      return singleResult(data, 'enqueue donation automation event');
    },

    async listDonations({ trustId, status, limit, offset }) {
      let query = getClient()
        .from('operations_donations')
        .select('id, trust_id, person_id, payment_event_id, transaction_id, donation_number, status, amount, currency, donation_date, purpose, payment_mode, verified_at, posted_at, created_at, updated_at')
        .order('donation_date', { ascending: false })
        .range(offset, offset + limit - 1);
      if (trustId) query = query.eq('trust_id', trustId);
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) databaseError(error, 'list donations');
      return data || [];
    },

    async getDonation({ id, trustId }) {
      let query = getClient()
        .from('operations_donations')
        .select('id, trust_id, person_id, payment_event_id, transaction_id, donation_number, status, amount, currency, donation_date, purpose, payment_mode, verified_at, posted_at, created_at, updated_at')
        .eq('id', id)
        .limit(1)
        .maybeSingle();
      if (trustId) query = query.eq('trust_id', trustId);
      const { data, error } = await query;
      if (error) databaseError(error, 'get donation');
      return data;
    },
  };
}

function ensureTrustId(value) {
  return requiredText(value, 'trustId');
}

function ensureOfflinePaymentMode(value) {
  const mode = optionalText(value, 30) || 'cash';
  if (!SUPPORTED_PAYMENT_MODES.has(mode)) {
    throw new OperationsServiceError('Unsupported donation payment mode', {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details: { paymentMode: 'must be cash, digital, bank_transfer, cheque, or other' },
    });
  }
  return mode;
}

function donationResult(donation, transactionId, automationEventId) {
  return {
    donationId: idOf(donation, 'id', 'donationId'),
    transactionId: transactionId || idOf(donation, 'transaction_id', 'transactionId'),
    status: donation?.status || 'posted',
    automationEventId: automationEventId || null,
  };
}

function createDonationService({ repository, postingAdapter, now = () => new Date() } = {}) {
  const adapter = repository || createSupabaseDonationRepository();
  const poster = postingAdapter || adapter;
  const locks = new Map();

  async function withPaymentLock(key, operation) {
    const previous = locks.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    locks.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (locks.get(key) === current) locks.delete(key);
    }
  }

  async function findOrCreateSharedPerson({ donor, trustId, actor } = {}) {
    const normalizedTrustId = ensureTrustId(trustId);
    const normalizedDonor = normalizeDonor(donor);
    const normalizedEmail = normalizedDonor.email;
    const normalizedPhone = normalizedDonor.phone;
    const actorId = getActorId(actor);

    let person = await adapter.findPersonByNormalizedIdentity({ normalizedEmail, normalizedPhone });
    if (!person) {
      try {
        person = await adapter.createPerson({
          donor: normalizedDonor,
          normalizedEmail,
          normalizedPhone,
          actorId,
        });
      } catch (error) {
        if (error?.code !== '23505') databaseError(error, 'create shared donor');
        person = await adapter.findPersonByNormalizedIdentity({ normalizedEmail, normalizedPhone });
        if (!person) databaseError(error, 'create shared donor');
      }
    }

    const personId = idOf(person, 'id', 'personId');
    if (!personId) {
      throw new OperationsServiceError('Shared donor record did not return an ID', {
        code: 'EMPTY_DATABASE_RESULT',
        statusCode: 502,
      });
    }
    const trustPerson = await adapter.ensureTrustPerson({
      trustId: normalizedTrustId,
      personId,
      actorId,
    });
    return { person, personId, trustPerson, donor: normalizedDonor };
  }

  async function getOrCreatePaymentEvent(input) {
    const found = await adapter.findPaymentEvent({ idempotencyKey: input.idempotencyKey });
    if (found) return { event: found, created: false };
    try {
      return {
        event: await adapter.createPaymentEvent(input),
        created: true,
      };
    } catch (error) {
      if (error?.code !== '23505') databaseError(error, 'create payment event');
      const existing = await adapter.findPaymentEvent({ idempotencyKey: input.idempotencyKey });
      if (!existing) databaseError(error, 'create payment event');
      return { event: existing, created: false };
    }
  }

  async function ensureAutomationEvent({ donation, transactionId, paymentEvent, nowValue }) {
    const donationId = idOf(donation, 'id', 'donationId');
    const existing = await adapter.findAutomationEvent({ donationId });
    if (existing) return existing;
    try {
      return await adapter.enqueueAutomationEvent({
        trustId: donation.trust_id || donation.trustId,
        donationId,
        transactionId,
        paymentEventId: idOf(paymentEvent, 'id', 'paymentEventId'),
        createdAt: nowValue,
      });
    } catch (error) {
      if (error?.code !== '23505') databaseError(error, 'enqueue donation automation event');
      const retry = await adapter.findAutomationEvent({ donationId });
      if (!retry) databaseError(error, 'enqueue donation automation event');
      return retry;
    }
  }

  async function processVerifiedDonation({ payload, request, existingTransactionId } = {}) {
    const input = getDonationPayload(payload);
    const trustId = ensureTrustId(input.trustId);
    const paymentId = requiredText(input.paymentId, 'paymentId');
    const amount = positiveAmount(input.amount);
    const currency = normalizeCurrency(input.currency);
    const donor = normalizeDonor(input.donor);
    const idempotencyKey = paymentIdempotencyKey({ gateway: input.gateway, paymentId });

    return withPaymentLock(idempotencyKey, async () => {
      const eventResult = await getOrCreatePaymentEvent({
        trustId,
        gateway: input.gateway,
        paymentId,
        idempotencyKey,
        amount,
        currency,
        payloadHash: payloadHash({ ...input, trustId, paymentId, amount, currency, donor }),
        providerReference: input.providerReference,
      });
      const paymentEvent = eventResult.event;

      const recordedAmount = rowAmount(paymentEvent);
      const recordedTrustId = paymentEvent.trust_id || paymentEvent.trustId;
      const recordedCurrency = paymentEvent.currency && String(paymentEvent.currency).toUpperCase();
      if ((recordedAmount !== null && recordedAmount !== amount)
        || (recordedTrustId && recordedTrustId !== trustId)
        || (paymentEvent.gateway && paymentEvent.gateway !== input.gateway)
        || (paymentEvent.payment_id && paymentEvent.payment_id !== paymentId)
        || (recordedCurrency && recordedCurrency !== currency)) {
        throw new OperationsServiceError('Payment idempotency key was already used with different payment data', {
          code: 'IDEMPOTENCY_CONFLICT',
          statusCode: 409,
        });
      }

      let donation = await adapter.findDonationByPaymentEvent({ paymentEventId: paymentEvent.id });
      let transactionId = idOf(donation, 'transaction_id', 'transactionId');
      if (!donation) {
        const person = await findOrCreateSharedPerson({ donor, trustId });
        const donationInput = {
          trustId,
          personId: person.personId,
          paymentEventId: paymentEvent.id,
          amount,
          currency,
          purpose: input.purpose,
          paymentMode: input.paymentMode,
          status: 'verified',
          verifiedAt: now().toISOString(),
          donationDate: now().toISOString().slice(0, 10),
          actorId: null,
          metadata: {
            gateway: input.gateway,
            providerReference: input.providerReference,
            legacyTransactionId: existingTransactionId || null,
          },
        };
        try {
          donation = await adapter.createDonation(donationInput);
        } catch (error) {
          if (error?.code !== '23505') databaseError(error, 'create donation');
          donation = await adapter.findDonationByPaymentEvent({ paymentEventId: paymentEvent.id });
          if (!donation) databaseError(error, 'create donation');
        }

        if (typeof adapter.updatePaymentEvent === 'function') {
          await adapter.updatePaymentEvent({
            id: paymentEvent.id,
            status: 'verified',
            verifiedAt: paymentEvent.verified_at || donationInput.verifiedAt,
            personId: person.personId,
          });
        }
      }

      const donationId = idOf(donation, 'id', 'donationId');
      if (!donationId) {
        throw new OperationsServiceError('Donation record did not return an ID', {
          code: 'EMPTY_DATABASE_RESULT',
          statusCode: 502,
        });
      }

      if (!transactionId || donation.status !== 'posted') {
        const postedAt = now().toISOString();
        // The posting adapter is the persistence boundary. Keep the same row
        // object when an injectable adapter uses an in-memory repository; the
        // Supabase adapter also persists the link before returning.
        Object.assign(donation, {
          id: donationId,
          trust_id: donation.trust_id || trustId,
          person_id: donation.person_id,
          amount: rowAmount(donation) || amount,
          currency: donation.currency || currency,
          purpose: donation.purpose || input.purpose,
          donation_date: donation.donation_date,
        });
        const posted = await poster.postVerifiedDonation({
          donation,
          paymentEvent,
          existingTransactionId,
          postedAt,
        });
        transactionId = idOf(posted, 'transactionId', 'transaction_id') || transactionId;
        donation = { ...donation, transaction_id: transactionId, status: posted?.status || 'posted' };
      }

      if (!transactionId) {
        throw new OperationsServiceError('Posted donation did not return a transaction ID', {
          code: 'EMPTY_DATABASE_RESULT',
          statusCode: 502,
        });
      }

      const automationEvent = await ensureAutomationEvent({
        donation,
        transactionId,
        paymentEvent,
        nowValue: now().toISOString(),
      });
      if (paymentEvent.status !== 'completed') {
        await adapter.updatePaymentEvent({
          id: paymentEvent.id,
          status: 'completed',
          verifiedAt: paymentEvent.verified_at || now().toISOString(),
          completedAt: now().toISOString(),
        });
      }

      return donationResult(donation, transactionId, idOf(automationEvent, 'id', 'automationEventId'));
    });
  }

  async function recordOfflineDonation(input = {}) {
    const actor = input.actor;
    requireActor(actor, ['admin', 'accountant'], 'record offline donations');
    const trustId = ensureTrustId(input.trustId || input.trust_id);
    const amount = positiveAmount(input.amount);
    const currency = normalizeCurrency(input.currency);
    const donor = normalizeDonor(input.donor || {
      name: input.donorName || input.donor_name,
      email: input.email || input.donorEmail || input.donor_email,
      phone: input.phone || input.donorPhone || input.donor_phone,
      pan: input.pan,
    });
    const person = await findOrCreateSharedPerson({ donor, trustId, actor });
    const donationDate = optionalText(input.donationDate || input.donation_date, 10)
      || now().toISOString().slice(0, 10);
    const purpose = optionalText(input.purpose, 500) || 'Offline donation';
    const paymentMode = ensureOfflinePaymentMode(input.paymentMode || input.payment_mode);
    const result = await adapter.createOfflineDonation({
      trustId,
      personId: person.personId,
      amount,
      currency,
      donationDate,
      purpose,
      paymentMode,
      actorId: getActorId(actor),
      metadata: {
        source: 'offline_donation',
        requestId: requestContext(input.request).requestId,
      },
    });
    return {
      donationId: idOf(result.donation, 'id', 'donationId'),
      transactionId: idOf(result.transaction, 'id', 'transactionId'),
      approvalId: idOf(result.approval, 'id', 'approvalId'),
      status: 'pending_approval',
      postedJournalId: null,
    };
  }

  async function listDonations({ actor, trustId, status, limit = 50, offset = 0 } = {}) {
    requireActor(actor, ['admin', 'accountant', 'viewer'], 'read donations');
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    if (status && !['draft', 'pending_approval', 'verified', 'posted', 'refunded', 'cancelled'].includes(status)) {
      throw new OperationsServiceError('Unsupported donation status', { code: 'VALIDATION_ERROR', statusCode: 400 });
    }
    return adapter.listDonations({ trustId: trustId || null, status: status || null, limit: safeLimit, offset: safeOffset });
  }

  async function getDonation({ actor, id, trustId } = {}) {
    requireActor(actor, ['admin', 'accountant', 'viewer'], 'read donations');
    const donationId = requiredText(id, 'id');
    const result = await adapter.getDonation({ id: donationId, trustId: trustId || null });
    if (!result) {
      throw new OperationsServiceError('Donation was not found', { code: 'NOT_FOUND', statusCode: 404 });
    }
    return result;
  }

  return {
    findOrCreateSharedPerson,
    processVerifiedDonation,
    recordOfflineDonation,
    listDonations,
    getDonation,
  };
}

let defaultService;
function getDefaultService() {
  if (!defaultService) defaultService = createDonationService();
  return defaultService;
}

module.exports = {
  AUTOMATION_EVENT_TYPE,
  createDonationService,
  createSupabaseDonationRepository,
  normalizeEmail,
  normalizePhone,
  normalizeDonor,
  paymentIdempotencyKey,
  findOrCreateSharedPerson: (input) => getDefaultService().findOrCreateSharedPerson(input),
  processVerifiedDonation: (input) => getDefaultService().processVerifiedDonation(input),
  recordOfflineDonation: (input) => getDefaultService().recordOfflineDonation(input),
};
