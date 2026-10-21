'use strict';

const { nextDocumentNumber } = require('./documentNumberService');
const { renderDonationReceipt, renderDonationInvoice } = require('./documentRenderer');

const MAX_DELIVERY_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const AUTOMATION_EVENT_TYPE = 'donation_documents';

function idOf(value, ...keys) {
  if (typeof value === 'string') return value;
  for (const key of keys) if (value && value[key]) return value[key];
  return null;
}

function field(value, ...keys) {
  for (const key of keys) {
    if (value && value[key] !== undefined && value[key] !== null) return value[key];
  }
  return null;
}

function text(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value).trim() || fallback;
}

function nowDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) throw new TypeError('now must be a valid date');
  return date;
}

function dateString(value, fallbackDate) {
  const source = value || fallbackDate;
  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? new Date(fallbackDate).toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function financialYearFor({ donation, trust, date }) {
  const explicit = field(donation, 'financialYear', 'financial_year')
    || field(donation?.metadata, 'financialYear', 'financial_year')
    || field(trust, 'financialYear', 'financial_year');
  if (explicit) return text(explicit);

  const source = new Date(field(donation, 'donationDate', 'donation_date') || date);
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth() + 1;
  const startYear = month >= Number(field(trust, 'financialYearStartMonth', 'financial_year_start_month') || 4)
    ? year
    : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value).toLowerCase());
}

function boundedError(error) {
  const message = text(error?.message || error, 'Document delivery failed')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 300);
  return message || 'Document delivery failed';
}

function isPermanentError(error) {
  return Boolean(error?.permanent || error?.code === 'INVALID_RECIPIENT' || error?.code === 'INVALID_EMAIL');
}

function isUniqueViolation(error) {
  return error?.code === '23505' || /duplicate key|unique constraint/i.test(text(error?.message));
}

function nextAttemptAt(attemptCount, date) {
  const exponent = Math.max(0, Math.min(Number(attemptCount) || 1, 10) - 1);
  const delay = Math.min(MAX_BACKOFF_MS, 60 * 1000 * (2 ** exponent));
  return new Date(date.getTime() + delay);
}

function getInvoicePath(invoice) {
  return field(invoice, 'documentPath', 'document_path')
    || field(invoice?.metadata, 'documentPath', 'document_path');
}

function getReceiptPath(receipt) {
  return field(receipt, 'documentPath', 'document_path');
}

function getStatus(row) {
  return text(field(row, 'status'), 'pending').toLowerCase();
}

function getNextAttempt(row) {
  const value = field(row, 'nextAttemptAt', 'next_attempt_at');
  return value ? new Date(value) : null;
}

function ensureRowId(row, label) {
  const id = idOf(row, 'id', `${label}Id`);
  if (!id) throw new Error(`${label} persistence did not return an ID`);
  return id;
}

function createSupabaseDocumentRepository(client) {
  const getClient = () => client || require('../config/supabaseAdmin');

  async function singleOrNull(query, operation) {
    const { data, error } = await query;
    if (error) throw new Error(`${operation}: ${error.message}`);
    return data || null;
  }

  return {
    async findDonationDocumentContext({ donationId }) {
      const donation = await singleOrNull(
        getClient().from('operations_donations').select('*').eq('id', donationId).maybeSingle(),
        'find donation',
      );
      if (!donation) return null;

      const [person, trust] = await Promise.all([
        singleOrNull(
          getClient().from('operations_people').select('*').eq('id', donation.person_id).maybeSingle(),
          'find donor',
        ),
        singleOrNull(
          getClient().from('operations_trusts').select('*').eq('id', donation.trust_id).maybeSingle(),
          'find trust',
        ),
      ]);
      return { donation, person, trust };
    },

    async findReceiptByDonation({ donationId }) {
      return singleOrNull(
        getClient().from('operations_receipts').select('*').eq('donation_id', donationId)
          .order('created_at', { ascending: true }).limit(1).maybeSingle(),
        'find receipt',
      );
    },

    async findInvoiceByDonation({ donationId, transactionId }) {
      let invoice = null;
      if (transactionId) {
        invoice = await singleOrNull(
          getClient().from('operations_invoices').select('*').eq('transaction_id', transactionId)
            .order('created_at', { ascending: true }).limit(1).maybeSingle(),
          'find invoice',
        );
      }
      if (invoice || !donationId) return invoice;
      return singleOrNull(
        getClient().from('operations_invoices').select('*')
          .contains('metadata', { donation_id: donationId })
          .order('created_at', { ascending: true }).limit(1).maybeSingle(),
        'find donation invoice',
      );
    },

    async createReceipt(input) {
      const { data, error } = await getClient().from('operations_receipts').insert({
        trust_id: input.trustId,
        donation_id: input.donationId,
        receipt_number: input.receiptNumber,
        status: 'issued',
        amount: input.amount,
        currency: input.currency,
        issued_at: input.issuedAt,
        created_by: null,
      }).select('*').single();
      if (error) throw error;
      return data;
    },

    async updateReceipt({ id, documentPath, status, sentAt }) {
      const patch = { updated_at: new Date().toISOString() };
      if (documentPath !== undefined) patch.document_path = documentPath;
      if (status !== undefined) patch.status = status;
      if (sentAt !== undefined) patch.sent_at = sentAt;
      const { data, error } = await getClient().from('operations_receipts').update(patch).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },

    async createInvoice(input) {
      const { data, error } = await getClient().from('operations_invoices').insert({
        trust_id: input.trustId,
        person_id: input.personId,
        transaction_id: input.transactionId || null,
        invoice_number: input.invoiceNumber,
        status: 'draft',
        issue_date: input.issueDate,
        subtotal: input.subtotal,
        tax_amount: input.taxAmount,
        total_amount: input.totalAmount,
        paid_amount: 0,
        currency: input.currency,
        metadata: input.metadata || {},
      }).select('*').single();
      if (error) throw error;

      const line = {
        trust_id: input.trustId,
        invoice_id: data.id,
        line_number: 1,
        description: input.lineDescription || 'Donation',
        quantity: 1,
        unit_price: input.totalAmount,
        line_amount: input.totalAmount,
        tax_amount: input.taxAmount || 0,
        currency: input.currency,
      };
      const { error: lineError } = await getClient().from('operations_invoice_lines').insert(line);
      if (lineError) throw lineError;
      return data;
    },

    async updateInvoice({ id, documentPath, status, sentAt, metadata }) {
      const patch = { updated_at: new Date().toISOString() };
      if (documentPath !== undefined) {
        patch.metadata = { ...(metadata || {}), document_path: documentPath };
      } else if (metadata !== undefined) {
        patch.metadata = metadata;
      }
      if (status !== undefined) patch.status = status;
      if (sentAt !== undefined) patch.sent_at = sentAt;
      const { data, error } = await getClient().from('operations_invoices').update(patch).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },

    async findCombinedDelivery({ receiptId, invoiceId }) {
      return singleOrNull(
        getClient().from('operations_document_deliveries').select('*')
          .eq('receipt_id', receiptId).eq('invoice_id', invoiceId).eq('delivery_type', 'combined')
          .order('created_at', { ascending: true }).limit(1).maybeSingle(),
        'find document delivery',
      );
    },

    async createDelivery(input) {
      const { data, error } = await getClient().from('operations_document_deliveries').insert({
        trust_id: input.trustId,
        receipt_id: input.receiptId,
        invoice_id: input.invoiceId,
        delivery_type: 'combined',
        recipient_email: input.recipientEmail,
        status: 'pending',
        attempt_count: 0,
        next_attempt_at: input.nextAttemptAt || null,
      }).select('*').single();
      if (error) throw error;
      return data;
    },

    async claimDelivery({ id, now }) {
      const current = await singleOrNull(
        getClient().from('operations_document_deliveries').select('*').eq('id', id).maybeSingle(),
        'read document delivery',
      );
      if (!current || !['pending', 'retrying'].includes(getStatus(current))) return null;
      const attemptCount = Number(field(current, 'attempt_count', 'attemptCount') || 0) + 1;
      const { data, error } = await getClient().from('operations_document_deliveries').update({
        status: 'processing',
        attempt_count: attemptCount,
        updated_at: now.toISOString(),
      }).eq('id', id).in('status', ['pending', 'retrying']).select('*').maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async updateDelivery({ id, ...patch }) {
      const dbPatch = { updated_at: new Date().toISOString() };
      const mappings = {
        status: 'status', nextAttemptAt: 'next_attempt_at', lastError: 'last_error',
        sentAt: 'sent_at', providerMessageId: 'provider_message_id', attemptCount: 'attempt_count',
      };
      for (const [key, value] of Object.entries(patch)) {
        if (mappings[key]) dbPatch[mappings[key]] = value instanceof Date ? value.toISOString() : value;
      }
      const { data, error } = await getClient().from('operations_document_deliveries').update(dbPatch).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
  };
}

function defaultMailAdapter() {
  return {
    async send(input) {
      const { sendDonationDocumentsEmail } = require('../services/notify');
      return sendDonationDocumentsEmail(input);
    },
  };
}

function defaultStorageAdapter() {
  // storage.js is the existing private Supabase storage abstraction. Loading it
  // lazily keeps offline document and renderer tests independent of credentials.
  return {
    async uploadFile(path, buffer, contentType) {
      require('module-alias/register');
      const storage = require('../services/storage');
      return storage.uploadFile(path, buffer, contentType);
    },
  };
}

function callRenderer(renderer, name, input) {
  if (typeof renderer === 'function') return renderer(input);
  if (renderer && typeof renderer[name] === 'function') return renderer[name](input);
  throw new TypeError(`renderer must provide ${name}`);
}

async function persistArtifact(storage, path, buffer) {
  if (typeof storage.upload === 'function') return storage.upload({ path, buffer, contentType: 'application/pdf' });
  if (typeof storage.uploadFile === 'function') return storage.uploadFile(path, buffer, 'application/pdf');
  if (typeof storage.put === 'function') return storage.put({ path, buffer, contentType: 'application/pdf' });
  throw new TypeError('storageAdapter must provide upload({ path, buffer, contentType }) or uploadFile(path, buffer, contentType)');
}

function callNumberService(service, input) {
  if (typeof service === 'function') return service(input);
  if (service && typeof service.nextDocumentNumber === 'function') return service.nextDocumentNumber(input);
  throw new TypeError('numberService must provide nextDocumentNumber');
}

function callRepository(repository, method, input) {
  if (typeof repository[method] !== 'function') throw new TypeError(`repository must provide ${method}`);
  return repository[method](input);
}

function createDocumentDeliveryService({
  repository,
  mailAdapter,
  storageAdapter,
  numberService,
  renderer,
  now = () => new Date(),
  maxAttempts = MAX_DELIVERY_ATTEMPTS,
} = {}) {
  const adapter = repository || createSupabaseDocumentRepository();
  const mail = mailAdapter || defaultMailAdapter();
  const storage = storageAdapter || defaultStorageAdapter();
  const numbers = numberService || { nextDocumentNumber };
  const documentRenderer = renderer || { renderDonationReceipt, renderDonationInvoice };
  const donationLocks = new Map();

  async function withDonationLock(donationId, operation) {
    const previous = donationLocks.get(donationId) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    donationLocks.set(donationId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (donationLocks.get(donationId) === current) donationLocks.delete(donationId);
    }
  }

  async function ensureReceiptAndInvoice({ context, issuedAt }) {
    const donation = context.donation;
    const trust = context.trust || {};
    const trustId = idOf(donation, 'trust_id', 'trustId') || idOf(trust, 'id', 'trustId');
    const donationId = ensureRowId(donation, 'donation');
    const person = context.person || context.donor || donation.donor || donation.person || {};
    const personId = idOf(donation, 'person_id', 'personId') || idOf(person, 'id', 'personId');
    const amount = Number(field(donation, 'amount') || 0);
    const currency = text(field(donation, 'currency'), 'INR').toUpperCase();
    const issueDate = dateString(field(donation, 'donation_date', 'donationDate'), issuedAt);
    const financialYear = financialYearFor({ donation, trust, date: issuedAt });

    let receipt = await callRepository(adapter, 'findReceiptByDonation', { donationId });
    if (!receipt) {
      const receiptNumber = await callNumberService(numbers, { trustId, documentType: 'receipt', financialYear });
      try {
        receipt = await callRepository(adapter, 'createReceipt', {
          trustId,
          donationId,
          receiptNumber,
          amount,
          currency,
          issuedAt: issuedAt.toISOString(),
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        receipt = await callRepository(adapter, 'findReceiptByDonation', { donationId });
        if (!receipt) throw error;
      }
    }

    const transactionId = idOf(donation, 'transaction_id', 'transactionId');
    let invoice = await callRepository(adapter, 'findInvoiceByDonation', {
      donationId,
      transactionId,
    });
    if (!invoice) {
      const invoiceNumber = await callNumberService(numbers, { trustId, documentType: 'invoice', financialYear });
      try {
        invoice = await callRepository(adapter, 'createInvoice', {
          trustId,
          personId,
          transactionId,
          invoiceNumber,
          issueDate,
          subtotal: amount,
          taxAmount: 0,
          totalAmount: amount,
          currency,
          lineDescription: field(donation, 'purpose', 'description') || 'Donation',
          metadata: { donation_id: donationId, document_type: 'donation_invoice' },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        invoice = await callRepository(adapter, 'findInvoiceByDonation', { donationId, transactionId });
        if (!invoice) throw error;
      }
    }

    ensureRowId(receipt, 'receipt');
    ensureRowId(invoice, 'invoice');
    return { donation, trust, person, receipt, invoice, trustId, donationId, financialYear };
  }

  async function ensureArtifacts(data) {
    const receiptBuffer = await callRenderer(documentRenderer, 'renderDonationReceipt', {
      trust: data.trust,
      donation: { ...data.donation, donor: data.person },
      receipt: data.receipt,
    });
    const invoiceBuffer = await callRenderer(documentRenderer, 'renderDonationInvoice', {
      trust: data.trust,
      donation: { ...data.donation, donor: data.person },
      invoice: data.invoice,
    });
    if (!Buffer.isBuffer(receiptBuffer) || receiptBuffer.length === 0) throw new Error('Receipt renderer returned an empty PDF');
    if (!Buffer.isBuffer(invoiceBuffer) || invoiceBuffer.length === 0) throw new Error('Invoice renderer returned an empty PDF');

    const receiptId = ensureRowId(data.receipt, 'receipt');
    const invoiceId = ensureRowId(data.invoice, 'invoice');
    const receiptNumber = text(field(data.receipt, 'receipt_number', 'receiptNumber'), receiptId);
    const invoiceNumber = text(field(data.invoice, 'invoice_number', 'invoiceNumber'), invoiceId);
    const receiptPath = getReceiptPath(data.receipt)
      || `operations/${data.trustId}/receipts/${receiptId}-${receiptNumber}.pdf`;
    const invoicePath = getInvoicePath(data.invoice)
      || `operations/${data.trustId}/invoices/${invoiceId}-${invoiceNumber}.pdf`;

    if (!getReceiptPath(data.receipt)) {
      await persistArtifact(data.storage, receiptPath, receiptBuffer);
      data.receipt = await callRepository(data.repository, 'updateReceipt', { id: receiptId, documentPath: receiptPath }) || data.receipt;
    }
    if (!getInvoicePath(data.invoice)) {
      await persistArtifact(data.storage, invoicePath, invoiceBuffer);
      const metadata = { ...(data.invoice.metadata || {}), document_path: invoicePath };
      data.invoice = await callRepository(data.repository, 'updateInvoice', {
        id: invoiceId,
        documentPath: invoicePath,
        metadata,
      }) || data.invoice;
    }
    return { ...data, receiptBuffer, invoiceBuffer, receiptPath, invoicePath };
  }

  async function processDonationDocuments({ donationId } = {}) {
    const normalizedDonationId = text(donationId);
    if (!normalizedDonationId) throw new TypeError('donationId is required');
    const issuedAt = nowDate(now());
    const context = await callRepository(adapter, 'findDonationDocumentContext', { donationId: normalizedDonationId });
    if (!context || !context.donation) {
      const error = new Error('Donation was not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    const prepared = await ensureReceiptAndInvoice({ context, issuedAt });
    const artifactData = await ensureArtifacts({
      ...prepared,
      repository: adapter,
      storage,
    });
    const donor = artifactData.person || artifactData.donation.donor || {};
    const recipientEmail = text(field(donor, 'email') || field(artifactData.donation, 'donor_email', 'donorEmail')).toLowerCase();
    const receiptId = ensureRowId(artifactData.receipt, 'receipt');
    const invoiceId = ensureRowId(artifactData.invoice, 'invoice');

    let delivery = await callRepository(adapter, 'findCombinedDelivery', { receiptId, invoiceId });
    if (!delivery) {
      try {
        delivery = await callRepository(adapter, 'createDelivery', {
          trustId: artifactData.trustId,
          receiptId,
          invoiceId,
          recipientEmail,
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        delivery = await callRepository(adapter, 'findCombinedDelivery', { receiptId, invoiceId });
        if (!delivery) throw error;
      }
    }
    const deliveryId = ensureRowId(delivery, 'delivery');
    const currentStatus = getStatus(delivery);
    if (['sent', 'completed', 'failed', 'processing'].includes(currentStatus)) {
      return { receiptId, invoiceId, deliveryId, status: currentStatus };
    }

    if (!validEmail(recipientEmail)) {
      const failed = await callRepository(adapter, 'updateDelivery', {
        id: deliveryId,
        status: 'failed',
        lastError: 'Recipient email is invalid',
      });
      return { receiptId, invoiceId, deliveryId, status: getStatus(failed || { status: 'failed' }) };
    }

    const due = getNextAttempt(delivery);
    if (due && due > issuedAt) return { receiptId, invoiceId, deliveryId, status: currentStatus };

    const claimed = typeof adapter.claimDelivery === 'function'
      ? await adapter.claimDelivery({ id: deliveryId, now: issuedAt })
      : await callRepository(adapter, 'updateDelivery', { id: deliveryId, status: 'processing', attemptCount: Number(field(delivery, 'attempt_count', 'attemptCount') || 0) + 1 });
    if (!claimed) {
      const latest = typeof adapter.findCombinedDelivery === 'function'
        ? await adapter.findCombinedDelivery({ receiptId, invoiceId })
        : delivery;
      return { receiptId, invoiceId, deliveryId, status: getStatus(latest || delivery) };
    }

    const attemptCount = Number(field(claimed, 'attempt_count', 'attemptCount') || 1);
    if (attemptCount > Number(maxAttempts)) {
      const failed = await callRepository(adapter, 'updateDelivery', {
        id: deliveryId,
        status: 'failed',
        lastError: 'Maximum document delivery attempts exceeded',
      });
      return { receiptId, invoiceId, deliveryId, status: getStatus(failed || { status: 'failed' }) };
    }

    try {
      const result = await (typeof mail.send === 'function' ? mail.send({
        to: recipientEmail,
        trustName: text(field(artifactData.trust, 'name', 'legal_name'), 'Trust'),
        subject: `Donation receipt and invoice – ${text(field(artifactData.trust, 'name', 'legal_name'), 'Trust')}`,
        receiptNumber: text(field(artifactData.receipt, 'receipt_number', 'receiptNumber'), receiptId),
        invoiceNumber: text(field(artifactData.invoice, 'invoice_number', 'invoiceNumber'), invoiceId),
        receiptBuffer: artifactData.receiptBuffer,
        invoiceBuffer: artifactData.invoiceBuffer,
        attachments: [
          { filename: `receipt-${text(field(artifactData.receipt, 'receipt_number', 'receiptNumber'), receiptId)}.pdf`, content: artifactData.receiptBuffer, contentType: 'application/pdf' },
          { filename: `invoice-${text(field(artifactData.invoice, 'invoice_number', 'invoiceNumber'), invoiceId)}.pdf`, content: artifactData.invoiceBuffer, contentType: 'application/pdf' },
        ],
      }) : mail({
        to: recipientEmail,
        receiptBuffer: artifactData.receiptBuffer,
        invoiceBuffer: artifactData.invoiceBuffer,
      }));
      if (result && result.ok === false) {
        const error = new Error(result.reason || 'Mail provider rejected the message');
        error.providerMessageId = result.id;
        throw error;
      }

      const sentAt = issuedAt.toISOString();
      await callRepository(adapter, 'updateReceipt', { id: receiptId, status: 'sent', sentAt });
      await callRepository(adapter, 'updateInvoice', { id: invoiceId, status: 'sent', sentAt });
      const sent = await callRepository(adapter, 'updateDelivery', {
        id: deliveryId,
        status: 'sent',
        sentAt,
        providerMessageId: result?.id || result?.messageId || null,
        lastError: null,
      });
      return { receiptId, invoiceId, deliveryId, status: getStatus(sent || { status: 'sent' }) };
    } catch (error) {
      const permanent = isPermanentError(error);
      const exhausted = attemptCount >= Number(maxAttempts);
      const status = permanent || exhausted ? 'failed' : 'retrying';
      const patch = {
        id: deliveryId,
        status,
        lastError: boundedError(error),
      };
      if (status === 'retrying') patch.nextAttemptAt = nextAttemptAt(attemptCount, issuedAt);
      const updated = await callRepository(adapter, 'updateDelivery', patch);
      return { receiptId, invoiceId, deliveryId, status: getStatus(updated || { status }) };
    }
  }

  async function deliverDonationDocuments({ donationId } = {}) {
    const normalizedDonationId = text(donationId);
    if (!normalizedDonationId) throw new TypeError('donationId is required');
    return withDonationLock(normalizedDonationId, () => processDonationDocuments({ donationId: normalizedDonationId }));
  }

  return { deliverDonationDocuments };
}

let defaultService;
function getDefaultService() {
  if (!defaultService) defaultService = createDocumentDeliveryService();
  return defaultService;
}

function deliverDonationDocuments(input) {
  const normalizedInput = input ? {
    ...input,
    repository: input.repository || input.documentRepository,
    mailAdapter: input.mailAdapter || input.mail,
    storageAdapter: input.storageAdapter || input.storage,
    numberService: input.numberService || input.numberRepository,
  } : input;
  const hasInjection = normalizedInput && (normalizedInput.repository || normalizedInput.mailAdapter || normalizedInput.storageAdapter || normalizedInput.numberService || normalizedInput.renderer || normalizedInput.now);
  return (hasInjection
    ? createDocumentDeliveryService(normalizedInput)
    : getDefaultService()).deliverDonationDocuments(normalizedInput);
}

module.exports = {
  AUTOMATION_EVENT_TYPE,
  MAX_BACKOFF_MS,
  MAX_DELIVERY_ATTEMPTS,
  boundedError,
  createDocumentDeliveryService,
  createSupabaseDocumentRepository,
  deliverDonationDocuments,
  financialYearFor,
  isPermanentError,
  isUniqueViolation,
  nextAttemptAt,
  validEmail,
};
