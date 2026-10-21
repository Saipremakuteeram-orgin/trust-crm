'use strict';

const {
  OperationsServiceError,
  getActorId,
  getActorRole,
  requireActor,
} = require('./postingService');
const { nextDocumentNumber } = require('./documentNumberService');

const MONEY_SCALE = 10_000;
const MAX_TEXT_LENGTH = 500;
const INVOICE_STATUSES = Object.freeze([
  'draft',
  'pending_approval',
  'approved',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
]);
const PAYMENTABLE_STATUSES = new Set(['sent', 'partially_paid', 'overdue']);
const CANCELLABLE_STATUSES = new Set(['sent', 'partially_paid', 'paid', 'overdue']);

function invoiceError(message, code = 'VALIDATION_ERROR', statusCode = 400, details) {
  return new OperationsServiceError(message, { code, statusCode, details });
}

function requiredText(value, field, maxLength = MAX_TEXT_LENGTH) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw invoiceError(`${field} is required`, 'VALIDATION_ERROR', 400, { [field]: `${field} is required` });
  }
  const normalized = String(value).trim();
  if (normalized.length > maxLength) {
    throw invoiceError(`${field} must be ${maxLength} characters or fewer`, 'VALIDATION_ERROR', 400, { [field]: 'too long' });
  }
  return normalized;
}

function optionalText(value, field, maxLength = MAX_TEXT_LENGTH) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return requiredText(value, field, maxLength);
}

function normalizeCurrency(value) {
  const currency = String(value === undefined || value === null || value === '' ? 'INR' : value).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw invoiceError('currency must be an uppercase three-letter code', 'VALIDATION_ERROR', 400, {
      currency: 'must be an uppercase three-letter code',
    });
  }
  return currency;
}

function parseUnits(value, field, { positive = false, nonNegative = false } = {}) {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw invoiceError(`${field} must be a finite number`, 'VALIDATION_ERROR', 400, { [field]: 'must be finite' });
  }
  if (value === undefined || value === null || String(value).trim() === '') {
    throw invoiceError(`${field} is required`, 'VALIDATION_ERROR', 400, { [field]: `${field} is required` });
  }

  const source = String(value).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(source)) {
    throw invoiceError(`${field} must be a number with at most four decimal places`, 'VALIDATION_ERROR', 400, {
      [field]: 'must have at most four decimal places',
    });
  }
  const [whole, fraction = ''] = source.split('.');
  const units = (Number(whole) * MONEY_SCALE) + Number(fraction.padEnd(4, '0') || 0);
  if (!Number.isSafeInteger(units) || (positive && units <= 0) || (nonNegative && units < 0)) {
    const rule = positive ? 'a positive number' : 'a non-negative number';
    throw invoiceError(`${field} must be ${rule}`, 'VALIDATION_ERROR', 400, { [field]: rule });
  }
  return units;
}

function unitsToNumber(units) {
  return Number((units / MONEY_SCALE).toFixed(4));
}

function multiplyUnits(left, right, field) {
  const product = left * right;
  if (!Number.isSafeInteger(product) || product % MONEY_SCALE !== 0) {
    throw invoiceError(`${field} does not produce an exact invoice amount`, 'VALIDATION_ERROR', 400, {
      [field]: 'quantity multiplied by rate must have at most four decimal places',
    });
  }
  return product / MONEY_SCALE;
}

function normalizeDate(value, field, fallback) {
  const source = value === undefined || value === null || value === '' ? fallback : value;
  if (source === undefined || source === null || source === '') {
    throw invoiceError(`${field} is required`, 'VALIDATION_ERROR', 400, { [field]: `${field} is required` });
  }
  const normalized = String(source).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw invoiceError(`${field} must use YYYY-MM-DD format`, 'VALIDATION_ERROR', 400, { [field]: 'invalid date' });
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw invoiceError(`${field} must be a valid calendar date`, 'VALIDATION_ERROR', 400, { [field]: 'invalid date' });
  }
  return normalized;
}

function dateOnly(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function financialYearFor(date) {
  const year = Number(String(date).slice(0, 4));
  const month = Number(String(date).slice(5, 7));
  return month >= 4 ? `${year}-${String(year + 1).slice(-2)}` : `${year - 1}-${String(year).slice(-2)}`;
}

function rowId(row, ...keys) {
  if (typeof row === 'string') return row;
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null) return row[key];
  }
  return null;
}

function rowTrustId(row) {
  return row?.trust_id || row?.trustId || null;
}

function rowPersonId(row) {
  return row?.person_id || row?.personId || null;
}

function rowStatus(row) {
  return String(row?.status || 'draft').toLowerCase();
}

function rowDueDate(row) {
  return row?.due_date || row?.dueDate || null;
}

function rowTotalUnits(row) {
  return parseUnits(row?.total_amount ?? row?.totalAmount, 'totalAmount', { positive: true });
}

function rowPaidUnits(row) {
  return parseUnits(row?.paid_amount ?? row?.paidAmount ?? 0, 'paidAmount', { nonNegative: true });
}

function rowCurrency(row) {
  return normalizeCurrency(row?.currency || 'INR');
}

function normalizeReason(reason) {
  return requiredText(reason, 'reason', 2_000);
}

function requestContext(actor) {
  return {
    requestId: actor?.requestId || actor?.request_id || null,
    requestIp: actor?.requestIp || actor?.request_ip || actor?.ip || null,
  };
}

function databaseError(error, operation) {
  if (error instanceof OperationsServiceError) throw error;
  const code = error?.code || 'DATABASE_ERROR';
  throw new OperationsServiceError(error?.message || `Failed to ${operation}`, {
    code,
    statusCode: error?.statusCode || (code === 'PGRST116' ? 404 : code === '42501' ? 403 : 400),
    details: error,
  });
}

function singleResult(data, operation) {
  if (!data) throw invoiceError(`Database did not return a result for ${operation}`, 'EMPTY_DATABASE_RESULT', 502);
  return data;
}

function normalizeLine(line, index) {
  const source = line && typeof line === 'object' && !Array.isArray(line) ? line : {};
  const lineNumber = index + 1;
  const description = requiredText(source.description, `lines[${index}].description`);
  const quantityUnits = parseUnits(source.quantity, `lines[${index}].quantity`, { positive: true });
  const rateUnits = parseUnits(
    source.rate ?? source.unitPrice ?? source.unit_price,
    `lines[${index}].rate`,
    { positive: true },
  );
  const lineAmountUnits = multiplyUnits(quantityUnits, rateUnits, `lines[${index}]`);
  const suppliedLineAmount = source.lineTotal ?? source.lineAmount ?? source.line_amount;
  if (suppliedLineAmount !== undefined && suppliedLineAmount !== null && suppliedLineAmount !== '') {
    const suppliedUnits = parseUnits(suppliedLineAmount, `lines[${index}].lineTotal`, { nonNegative: true });
    if (suppliedUnits !== lineAmountUnits) {
      throw invoiceError(`lines[${index}].lineTotal must equal quantity × rate`, 'VALIDATION_ERROR', 400, {
        [`lines[${index}].lineTotal`]: 'does not match quantity × rate',
      });
    }
  }
  const hasTaxAmount = source.taxAmount !== undefined || source.tax_amount !== undefined;
  const taxAmountUnits = parseUnits(source.taxAmount ?? source.tax_amount ?? 0, `lines[${index}].taxAmount`, { nonNegative: true });
  return {
    line_number: lineNumber,
    description,
    quantity: unitsToNumber(quantityUnits),
    unit_price: unitsToNumber(rateUnits),
    line_amount: unitsToNumber(lineAmountUnits),
    tax_amount: unitsToNumber(taxAmountUnits),
    _lineAmountUnits: lineAmountUnits,
    _taxAmountUnits: taxAmountUnits,
    _hasTaxAmount: hasTaxAmount,
  };
}

function normalizeInvoiceInput(input, nowDateValue) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invoiceError('Invoice draft must be an object', 'VALIDATION_ERROR', 400, { input: 'must be an object' });
  }
  const trustId = requiredText(input.trustId ?? input.trust_id, 'trustId', 120);
  const personId = requiredText(input.personId ?? input.person_id ?? input.customerId ?? input.customer_id, 'personId', 120);
  const issueDate = normalizeDate(input.issueDate ?? input.issue_date, 'issueDate', dateOnly(nowDateValue));
  const dueDate = normalizeDate(input.dueDate ?? input.due_date, 'dueDate');
  if (dueDate < issueDate) {
    throw invoiceError('dueDate must be on or after issueDate', 'VALIDATION_ERROR', 400, { dueDate: 'must be on or after issueDate' });
  }
  const currency = normalizeCurrency(input.currency);
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw invoiceError('At least one invoice line is required', 'VALIDATION_ERROR', 400, { lines: 'must contain at least one line' });
  }
  const lines = input.lines.map(normalizeLine);
  const subtotalUnits = lines.reduce((sum, line) => sum + line._lineAmountUnits, 0);
  const lineTaxUnits = lines.reduce((sum, line) => sum + line._taxAmountUnits, 0);
  const hasExplicitLineTax = lines.some((line) => line._hasTaxAmount);
  const suppliedSubtotal = input.subtotal ?? input.subtotalAmount ?? input.subtotal_amount;
  const subtotalInputUnits = suppliedSubtotal === undefined || suppliedSubtotal === null || suppliedSubtotal === ''
    ? subtotalUnits
    : parseUnits(suppliedSubtotal, 'subtotal', { nonNegative: true });
  if (subtotalInputUnits !== subtotalUnits) {
    throw invoiceError('subtotal must equal the sum of line totals', 'VALIDATION_ERROR', 400, {
      subtotal: 'does not equal the sum of line totals',
    });
  }
  const suppliedTax = input.taxAmount ?? input.tax_amount;
  const taxUnits = suppliedTax === undefined || suppliedTax === null || suppliedTax === ''
    ? lineTaxUnits
    : parseUnits(suppliedTax, 'taxAmount', { nonNegative: true });
  if (hasExplicitLineTax && taxUnits !== lineTaxUnits) {
    throw invoiceError('taxAmount must equal the sum of line tax amounts', 'VALIDATION_ERROR', 400, {
      taxAmount: 'does not equal the sum of line tax amounts',
    });
  }
  const totalUnits = subtotalUnits + taxUnits;
  const suppliedTotal = input.totalAmount ?? input.total_amount ?? input.total;
  const totalInputUnits = suppliedTotal === undefined || suppliedTotal === null || suppliedTotal === ''
    ? totalUnits
    : parseUnits(suppliedTotal, 'totalAmount', { positive: true });
  if (totalInputUnits !== totalUnits) {
    throw invoiceError('totalAmount must equal subtotal + taxAmount', 'VALIDATION_ERROR', 400, {
      totalAmount: 'does not equal subtotal + taxAmount',
    });
  }
  if (totalUnits <= 0) throw invoiceError('Invoice total must be positive', 'VALIDATION_ERROR', 400, { totalAmount: 'must be positive' });

  const metadata = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
    ? { ...input.metadata }
    : {};
  const recipientEmail = optionalText(input.recipientEmail ?? input.recipient_email, 'recipientEmail', 320);
  if (recipientEmail) metadata.recipient_email = recipientEmail.toLowerCase();

  return {
    trustId,
    personId,
    issueDate,
    dueDate,
    currency,
    subtotal: unitsToNumber(subtotalUnits),
    taxAmount: unitsToNumber(taxUnits),
    totalAmount: unitsToNumber(totalUnits),
    lines: lines.map(({ _lineAmountUnits, _taxAmountUnits, _hasTaxAmount, ...line }) => line),
    metadata,
    financialYear: input.financialYear || financialYearFor(issueDate),
    sourceType: input.sourceType || input.source_type || null,
    verifiedPayment: input.verifiedPayment === true || input.verified_payment === true,
    recipientEmail: recipientEmail ? recipientEmail.toLowerCase() : null,
  };
}

function normalizeDeliveryId(delivery) {
  const id = rowId(delivery, 'id', 'deliveryId', 'delivery_id', 'documentDeliveryId', 'document_delivery_id');
  if (!id) throw invoiceError('Document delivery did not return an ID', 'EMPTY_DATABASE_RESULT', 502);
  return id;
}

function normalizeJournalIds(result) {
  const values = [];
  if (Array.isArray(result?.journalIds)) values.push(...result.journalIds);
  if (Array.isArray(result?.journal_ids)) values.push(...result.journal_ids);
  for (const key of ['journalId', 'journal_id', 'journalEntryId', 'journal_entry_id']) {
    if (result?.[key]) values.push(result[key]);
  }
  return [...new Set(values.filter(Boolean))];
}

function callFirst(adapter, names, input, operation) {
  const name = names.find((candidate) => typeof adapter?.[candidate] === 'function');
  if (!name) throw new TypeError(`adapter must provide ${names[0]} for ${operation}`);
  return adapter[name](input);
}

function createSupabaseInvoiceRepository(client) {
  const getClient = () => client || require('../config/supabaseAdmin');

  async function querySingle(query, operation) {
    const { data, error } = await query;
    if (error) databaseError(error, operation);
    return data || null;
  }

  async function queryMany(query, operation) {
    const { data, error } = await query;
    if (error) databaseError(error, operation);
    return data || [];
  }

  return {
    async getInvoiceIdentity({ trustId, personId }) {
      const [trust, person, relationship] = await Promise.all([
        querySingle(getClient().from('operations_trusts').select('*').eq('id', trustId).eq('is_active', true).maybeSingle(), 'find invoice trust'),
        querySingle(getClient().from('operations_people').select('*').eq('id', personId).maybeSingle(), 'find invoice person'),
        querySingle(
          getClient().from('operations_trust_people').select('*').eq('trust_id', trustId).eq('person_id', personId).eq('is_active', true).limit(1).maybeSingle(),
          'find invoice trust person',
        ),
      ]);
      return { trust, person, relationship };
    },

    async listInvoices({ trustId, status, limit = 100, offset = 0 } = {}) {
      let query = getClient().from('operations_invoices').select('*').order('created_at', { ascending: false });
      if (trustId) query = query.eq('trust_id', trustId);
      if (status) query = query.eq('status', status);
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
      const safeOffset = Math.max(Number(offset) || 0, 0);
      return queryMany(query.range(safeOffset, safeOffset + safeLimit - 1), 'list invoices');
    },

    async getInvoice({ invoiceId }) {
      const invoice = await querySingle(getClient().from('operations_invoices').select('*').eq('id', invoiceId).maybeSingle(), 'get invoice');
      if (!invoice) return null;
      const [lines, person, trust, deliveries] = await Promise.all([
        queryMany(getClient().from('operations_invoice_lines').select('*').eq('invoice_id', invoiceId).order('line_number', { ascending: true }), 'get invoice lines'),
        querySingle(getClient().from('operations_people').select('*').eq('id', invoice.person_id).maybeSingle(), 'get invoice person'),
        querySingle(getClient().from('operations_trusts').select('*').eq('id', invoice.trust_id).maybeSingle(), 'get invoice trust'),
        queryMany(getClient().from('operations_document_deliveries').select('*').eq('invoice_id', invoiceId).order('created_at', { ascending: false }), 'get invoice deliveries'),
      ]);
      let payments = [];
      try {
        payments = await queryMany(
          getClient().from('operations_payment_events').select('*').contains('metadata', { invoice_id: invoiceId }).order('created_at', { ascending: false }),
          'get invoice payments',
        );
      } catch (error) {
        // Older databases may not expose JSON containment for this read. The
        // invoice's paid_amount remains authoritative in that case.
        payments = [];
      }
      return { ...invoice, lines, person, trust, payments, deliveries };
    },

    async createInvoice(input) {
      const { data, error } = await getClient().from('operations_invoices').insert({
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
        created_by: input.actorId || null,
        updated_by: input.actorId || null,
        metadata: input.metadata || {},
      }).select('*').single();
      if (error) databaseError(error, 'create invoice draft');
      return singleResult(data, 'create invoice draft');
    },

    async createInvoiceLines({ trustId, invoiceId, lines }) {
      const rows = lines.map((line) => ({
        trust_id: trustId,
        invoice_id: invoiceId,
        line_number: line.line_number,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        line_amount: line.line_amount,
        tax_amount: line.tax_amount,
        currency: line.currency,
      }));
      const { data, error } = await getClient().from('operations_invoice_lines').insert(rows).select('*');
      if (error) databaseError(error, 'create invoice lines');
      return data || [];
    },

    async updateInvoiceStatus({ invoiceId, status, actorId, approvedBy, sentAt, paidAmount, paidAt }) {
      const patch = { status, updated_by: actorId || null, updated_at: new Date().toISOString() };
      if (approvedBy !== undefined) patch.approved_by = approvedBy;
      if (sentAt !== undefined) patch.sent_at = sentAt;
      if (paidAmount !== undefined) patch.paid_amount = paidAmount;
      if (paidAt !== undefined) patch.paid_at = paidAt;
      const { data, error } = await getClient().from('operations_invoices').update(patch).eq('id', invoiceId).select('*').single();
      if (error) databaseError(error, 'update invoice status');
      return singleResult(data, 'update invoice status');
    },

    async createApproval({ trustId, recordId, actorId, reason }) {
      const { data, error } = await getClient().from('operations_approval_requests').insert({
        trust_id: trustId,
        record_type: 'operations_invoice',
        record_id: recordId,
        status: 'pending_approval',
        requested_by: actorId,
        reason,
      }).select('*').single();
      if (error) databaseError(error, 'create invoice approval');
      return singleResult(data, 'create invoice approval');
    },

    async getApproval({ recordId }) {
      return querySingle(
        getClient().from('operations_approval_requests').select('*').eq('record_type', 'operations_invoice').eq('record_id', recordId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        'get invoice approval',
      );
    },

    async updateApproval({ approvalId, actorId, status, reason }) {
      const patch = {
        status,
        reviewed_by: actorId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (reason !== undefined) patch.reason = reason;
      const { data, error } = await getClient().from('operations_approval_requests').update(patch).eq('id', approvalId).select('*').single();
      if (error) databaseError(error, 'update invoice approval');
      return singleResult(data, 'update invoice approval');
    },

    async createApprovalAction({ trustId, approvalId, actorId, action, comment }) {
      const { data, error } = await getClient().from('operations_approval_actions').insert({
        trust_id: trustId,
        approval_request_id: approvalId,
        actor_id: actorId,
        action,
        comment: comment || null,
      }).select('*').single();
      if (error) databaseError(error, 'create invoice approval action');
      return singleResult(data, 'create invoice approval action');
    },

    async createDocumentDelivery({ trustId, invoiceId, recipientEmail }) {
      const { data, error } = await getClient().from('operations_document_deliveries').insert({
        trust_id: trustId,
        invoice_id: invoiceId,
        delivery_type: 'invoice',
        recipient_email: recipientEmail,
        status: 'pending',
        attempt_count: 0,
      }).select('*').single();
      if (error) databaseError(error, 'queue invoice delivery');
      return singleResult(data, 'queue invoice delivery');
    },

    async createAuditEvent(input) {
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
      if (error) databaseError(error, 'create invoice audit event');
      return data;
    },
  };
}

function createSupabaseInvoicePaymentAdapter(client) {
  const getClient = () => client || require('../config/supabaseAdmin');

  return {
    async recordInvoicePayment({ invoice, amount, paymentReference, actorId, now }) {
      const trustId = rowTrustId(invoice);
      const personId = rowPersonId(invoice);
      const currency = rowCurrency(invoice);
      const idempotencyKey = `invoice:${rowId(invoice, 'id', 'invoiceId')}:${paymentReference}`;
      const existing = await (async () => {
        const { data, error } = await getClient().from('operations_payment_events').select('*').eq('idempotency_key', idempotencyKey).maybeSingle();
        if (error) databaseError(error, 'find invoice payment');
        return data;
      })();
      if (existing) {
        const { data: transaction } = await getClient().from('operations_transactions').select('id').eq('payment_event_id', existing.id).maybeSingle();
        const { data: journal } = transaction
          ? await getClient().from('operations_journal_entries').select('id').eq('transaction_id', transaction.id).eq('status', 'posted').maybeSingle()
          : { data: null };
        return {
          paymentEventId: existing.id,
          transactionId: transaction?.id || null,
          journalEntryId: journal?.id || null,
          journalIds: journal?.id ? [journal.id] : [],
        };
      }

      const occurredAt = new Date(now || Date.now()).toISOString();
      const { data: paymentEvent, error: paymentError } = await getClient().from('operations_payment_events').insert({
        trust_id: trustId,
        person_id: personId,
        gateway: 'invoice',
        payment_id: paymentReference,
        idempotency_key: idempotencyKey,
        event_type: 'invoice_payment',
        status: 'completed',
        amount,
        currency,
        provider_reference: paymentReference,
        completed_at: occurredAt,
        metadata: { invoice_id: rowId(invoice, 'id', 'invoiceId') },
      }).select('*').single();
      if (paymentError) databaseError(paymentError, 'record invoice payment event');

      const { data: transaction, error: transactionError } = await getClient().from('operations_transactions').insert({
        trust_id: trustId,
        person_id: personId,
        payment_event_id: paymentEvent.id,
        transaction_type: 'credit',
        status: 'posted',
        amount,
        currency,
        transaction_date: occurredAt.slice(0, 10),
        description: `Payment for invoice ${invoice.invoice_number || rowId(invoice, 'id', 'invoiceId')}`,
        source_type: 'invoice_payment',
        source_id: rowId(invoice, 'id', 'invoiceId'),
        approved_by: actorId || null,
        posted_at: occurredAt,
        created_by: actorId || null,
        updated_by: actorId || null,
        metadata: { invoice_id: rowId(invoice, 'id', 'invoiceId'), payment_reference: paymentReference },
      }).select('*').single();
      if (transactionError) databaseError(transactionError, 'post invoice payment transaction');

      const entryNumber = `INV-PAY-${paymentEvent.id}`;
      const { data: journal, error: journalError } = await getClient().from('operations_journal_entries').insert({
        trust_id: trustId,
        transaction_id: transaction.id,
        entry_number: entryNumber,
        entry_date: occurredAt.slice(0, 10),
        description: `Payment for invoice ${invoice.invoice_number || rowId(invoice, 'id', 'invoiceId')}`,
        reference: paymentReference,
        status: 'posted',
        currency,
        total_debit: amount,
        total_credit: amount,
        created_by: actorId || null,
        posted_by: actorId || null,
        posted_at: occurredAt,
      }).select('*').single();
      if (journalError) databaseError(journalError, 'post invoice payment journal');

      const { error: lineError } = await getClient().from('operations_journal_lines').insert([
        {
          trust_id: trustId,
          journal_entry_id: journal.id,
          line_number: 1,
          account_code: 'CASH_OR_BANK',
          description: 'Invoice payment received',
          debit: amount,
          credit: 0,
          currency,
        },
        {
          trust_id: trustId,
          journal_entry_id: journal.id,
          line_number: 2,
          account_code: 'ACCOUNTS_RECEIVABLE',
          description: 'Invoice receivable settled',
          debit: 0,
          credit: amount,
          currency,
        },
      ]);
      if (lineError) databaseError(lineError, 'post invoice payment journal lines');

      return {
        paymentEventId: paymentEvent.id,
        transactionId: transaction.id,
        journalEntryId: journal.id,
        journalIds: [journal.id],
      };
    },
  };
}

function createInvoiceService({
  repository,
  numberService,
  documentNumberService,
  deliveryAdapter,
  paymentAdapter,
  postingAdapter,
  documentDeliveryService,
  now = () => new Date(),
  allowVerifiedPaymentException = false,
} = {}) {
  const adapter = repository || createSupabaseInvoiceRepository();
  const numbers = numberService || documentNumberService || { nextDocumentNumber };
  const hasInjectedDelivery = Boolean(deliveryAdapter || documentDeliveryService);
  const delivery = deliveryAdapter || documentDeliveryService || {
    async queueInvoice(input) {
      return callFirst(adapter, ['createDocumentDelivery'], input, 'queue invoice delivery');
    },
  };
  const payments = paymentAdapter || postingAdapter || createSupabaseInvoicePaymentAdapter();

  async function getInvoiceOrThrow(invoiceId) {
    const normalizedId = requiredText(invoiceId, 'invoiceId', 120);
    let invoice = await callFirst(adapter, ['getInvoice', 'getInvoiceById'], { invoiceId: normalizedId }, 'get invoice');
    if (!invoice) throw invoiceError('Invoice was not found', 'NOT_FOUND', 404);
    if ((!invoice.lines || invoice.lines.length === 0) && typeof adapter.getInvoiceLines === 'function') {
      invoice = { ...invoice, lines: await adapter.getInvoiceLines({ invoiceId: normalizedId }) };
    }
    return invoice;
  }

  async function validateIdentity({ trustId, personId }) {
    if (typeof adapter.getInvoiceIdentity !== 'function' && typeof adapter.validateInvoiceIdentity !== 'function') return {};
    const identity = await callFirst(adapter, ['getInvoiceIdentity', 'validateInvoiceIdentity'], { trustId, personId }, 'validate invoice identity');
    if (!identity || identity.valid === false || identity.trust === null || identity.person === null || identity.relationship === false) {
      throw invoiceError('Trust and person identity could not be verified', 'IDENTITY_NOT_FOUND', 404);
    }
    if (identity.trust && identity.trust.is_active === false) {
      throw invoiceError('Invoice trust is not active', 'IDENTITY_NOT_FOUND', 404);
    }
    if (identity.relationship && identity.relationship.is_active === false) {
      throw invoiceError('Person is not linked to the selected trust', 'IDENTITY_NOT_FOUND', 409);
    }
    return identity;
  }

  async function createInvoiceDraft(input = {}) {
    const actor = input.actor;
    const automationException = allowVerifiedPaymentException
      && input.sourceType === 'donation_automation'
      && input.verifiedPayment === true;
    if (!automationException) requireActor(actor, ['admin', 'accountant'], 'create invoices');

    const normalized = normalizeInvoiceInput(input, now());
    const identity = await validateIdentity(normalized);
    const invoiceNumber = await (async () => {
      if (input.invoiceNumber && automationException) return requiredText(input.invoiceNumber, 'invoiceNumber', 120);
      try {
        return await callFirst(numbers, ['nextDocumentNumber', 'nextNumber', 'allocate'], {
          trustId: normalized.trustId,
          documentType: 'invoice',
          financialYear: normalized.financialYear,
        }, 'allocate invoice number');
      } catch (error) {
        databaseError(error, 'allocate invoice number');
      }
    })();
    const number = typeof invoiceNumber === 'object'
      ? rowId(invoiceNumber, 'number', 'documentNumber', 'value')
      : invoiceNumber;
    if (!number || typeof number !== 'string') throw invoiceError('Invoice number allocation returned an invalid value', 'EMPTY_DATABASE_RESULT', 502);

    const metadata = {
      ...normalized.metadata,
      ...(automationException ? { source_type: 'donation_automation', verified_payment_exception: true } : {}),
    };
    const invoice = await callFirst(adapter, ['createInvoice'], {
      trustId: normalized.trustId,
      personId: normalized.personId,
      invoiceNumber: number.trim(),
      issueDate: normalized.issueDate,
      dueDate: normalized.dueDate,
      subtotal: normalized.subtotal,
      taxAmount: normalized.taxAmount,
      totalAmount: normalized.totalAmount,
      currency: normalized.currency,
      metadata,
      actorId: getActorId(actor),
      identity,
    }, 'create invoice draft');
    const invoiceId = rowId(invoice, 'id', 'invoiceId', 'invoice_id');
    if (!invoiceId) throw invoiceError('Created invoice did not return an ID', 'EMPTY_DATABASE_RESULT', 502);

    const lines = normalized.lines.map((line) => ({ ...line, trust_id: normalized.trustId, invoice_id: invoiceId, currency: normalized.currency }));
    const storedLines = await callFirst(adapter, ['createInvoiceLines', 'createLines'], {
      trustId: normalized.trustId,
      invoiceId,
      lines,
      actorId: getActorId(actor),
    }, 'create invoice lines');
    const storedInvoice = { ...invoice, id: invoiceId, status: 'draft', invoice_number: invoice.invoice_number || number.trim(), lines: storedLines || lines };
    return { ...storedInvoice, invoice: storedInvoice, lines: storedInvoice.lines, status: 'draft' };
  }

  async function listInvoices({ actor, trustId, status, limit, offset } = {}) {
    requireActor(actor, ['admin', 'accountant', 'viewer'], 'read invoices');
    const rows = await callFirst(adapter, ['listInvoices'], { trustId: trustId || null, status, limit, offset }, 'list invoices');
    const result = [];
    for (const row of rows || []) result.push(await refreshOverdue(row, actor));
    return result;
  }

  async function refreshOverdue(invoice, actor) {
    const status = rowStatus(invoice);
    const dueDate = rowDueDate(invoice);
    if (!dueDate || !['sent', 'partially_paid'].includes(status) || dueDate >= dateOnly(now())) return invoice;
    if (typeof adapter.updateInvoiceStatus !== 'function') return { ...invoice, status: 'overdue' };
    return adapter.updateInvoiceStatus({
      invoiceId: rowId(invoice, 'id', 'invoiceId'),
      status: 'overdue',
      actorId: getActorId(actor),
    });
  }

  async function getInvoice({ actor, invoiceId } = {}) {
    requireActor(actor, ['admin', 'accountant', 'viewer'], 'read invoices');
    return refreshOverdue(await getInvoiceOrThrow(invoiceId), actor);
  }

  async function submitInvoiceForApproval({ actor, invoiceId } = {}) {
    requireActor(actor, ['admin', 'accountant'], 'submit invoices for approval');
    const invoice = await getInvoiceOrThrow(invoiceId);
    if (rowStatus(invoice) !== 'draft') throw invoiceError('Only draft invoices can be submitted for approval', 'INVALID_STATE', 409);
    const trustId = rowTrustId(invoice);
    const id = rowId(invoice, 'id', 'invoiceId');
    const approval = await callFirst(adapter, ['createApproval'], {
      trustId,
      recordId: id,
      actorId: getActorId(actor),
      reason: 'Manual invoice requires Admin approval before sending',
    }, 'create invoice approval');
    const pending = await callFirst(adapter, ['updateInvoiceStatus'], {
      invoiceId: id,
      status: 'pending_approval',
      actorId: getActorId(actor),
    }, 'mark invoice pending approval');
    if (typeof adapter.createApprovalAction === 'function') {
      await adapter.createApprovalAction({
        trustId,
        approvalId: rowId(approval, 'id', 'approvalId'),
        actorId: getActorId(actor),
        action: 'submit',
        comment: 'Invoice submitted for Admin approval',
      });
    }
    return { ...pending, invoice: pending, approval, status: 'pending_approval' };
  }

  async function approveAndSendInvoice({ actor, invoiceId } = {}) {
    const invoice = await getInvoiceOrThrow(invoiceId);
    const metadata = invoice.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {};
    const automationException = allowVerifiedPaymentException
      && metadata.source_type === 'donation_automation'
      && metadata.verified_payment_exception === true;
    if (!automationException) requireActor(actor, ['admin'], 'approve and send invoices');
    const status = rowStatus(invoice);
    if (!automationException && status !== 'pending_approval') {
      throw invoiceError('Only pending invoices can be approved and sent', 'INVALID_STATE', 409);
    }
    if (automationException && !['draft', 'pending_approval'].includes(status)) {
      throw invoiceError('Only draft or pending donation invoices can be sent', 'INVALID_STATE', 409);
    }

    const identity = await validateIdentity({ trustId: rowTrustId(invoice), personId: rowPersonId(invoice) });
    const person = invoice.person || identity.person || {};
    const recipientEmail = String(invoice.recipient_email || invoice.recipientEmail || metadata.recipient_email || person.email || '').trim().toLowerCase();
    if (!recipientEmail && !hasInjectedDelivery) {
      throw invoiceError('A recipient email is required before sending an invoice', 'RECIPIENT_REQUIRED', 400);
    }
    const id = rowId(invoice, 'id', 'invoiceId');
    const approval = !automationException && typeof adapter.getApproval === 'function'
      ? await adapter.getApproval({ recordId: id })
      : null;
    if (!automationException && (!approval || rowStatus(approval) !== 'pending_approval')) {
      throw invoiceError('Invoice approval was not found or is no longer pending', 'INVALID_STATE', 409);
    }

    const deliveryResult = await callFirst(delivery, ['queueInvoice', 'createInvoiceDelivery', 'deliverInvoice', 'createDelivery', 'deliver'], {
      invoice,
      invoiceId: id,
      person,
      trust: invoice.trust || identity.trust || null,
      recipientEmail,
      actorId: getActorId(actor),
      context: requestContext(actor),
      now: now(),
    }, 'queue invoice delivery');
    const deliveryId = normalizeDeliveryId(deliveryResult);

    if (approval) {
      await adapter.updateApproval({ approvalId: rowId(approval, 'id', 'approvalId'), actorId: getActorId(actor), status: 'approved' });
      if (typeof adapter.createApprovalAction === 'function') {
        await adapter.createApprovalAction({
          trustId: rowTrustId(invoice),
          approvalId: rowId(approval, 'id', 'approvalId'),
          actorId: getActorId(actor),
          action: 'approve',
          comment: 'Invoice approved for delivery',
        });
      }
    }
    await adapter.updateInvoiceStatus({
      invoiceId: id,
      status: 'approved',
      approvedBy: getActorId(actor),
      actorId: getActorId(actor),
    });
    await adapter.updateInvoiceStatus({
      invoiceId: id,
      status: 'sent',
      sentAt: now().toISOString(),
      actorId: getActorId(actor),
    });
    if (typeof adapter.createAuditEvent === 'function') {
      await adapter.createAuditEvent({
        trustId: rowTrustId(invoice),
        entityType: 'operations_invoice',
        entityId: id,
        action: 'approve_and_send',
        actorId: getActorId(actor),
        ...requestContext(actor),
        metadata: { documentDeliveryId: deliveryId, verifiedPaymentException: automationException },
      });
    }
    return { invoiceId: id, documentDeliveryId: deliveryId };
  }

  async function rejectInvoiceApproval({ actor, invoiceId, reason } = {}) {
    requireActor(actor, ['admin'], 'reject invoice approvals');
    const invoice = await getInvoiceOrThrow(invoiceId);
    if (rowStatus(invoice) !== 'pending_approval') throw invoiceError('Only pending invoices can be rejected', 'INVALID_STATE', 409);
    const approval = await callFirst(adapter, ['getApproval'], { recordId: rowId(invoice, 'id', 'invoiceId') }, 'get invoice approval');
    if (!approval || rowStatus(approval) !== 'pending_approval') throw invoiceError('Invoice approval was not found or is no longer pending', 'INVALID_STATE', 409);
    const normalizedReason = normalizeReason(reason);
    const updatedApproval = await adapter.updateApproval({
      approvalId: rowId(approval, 'id', 'approvalId'),
      actorId: getActorId(actor),
      status: 'rejected',
      reason: normalizedReason,
    });
    const draft = await adapter.updateInvoiceStatus({
      invoiceId: rowId(invoice, 'id', 'invoiceId'),
      status: 'draft',
      actorId: getActorId(actor),
    });
    if (typeof adapter.createApprovalAction === 'function') {
      await adapter.createApprovalAction({
        trustId: rowTrustId(invoice),
        approvalId: rowId(approval, 'id', 'approvalId'),
        actorId: getActorId(actor),
        action: 'reject',
        comment: normalizedReason,
      });
    }
    return { ...draft, invoice: draft, approval: updatedApproval, status: 'draft', approvalStatus: 'rejected' };
  }

  async function recordInvoicePayment({ actor, invoiceId, amount, paymentReference } = {}) {
    requireActor(actor, ['admin', 'accountant'], 'record invoice payments');
    const initialInvoice = await getInvoiceOrThrow(invoiceId);
    const invoice = await refreshOverdue(initialInvoice, actor);
    const status = rowStatus(invoice);
    if (!PAYMENTABLE_STATUSES.has(status)) {
      throw invoiceError('Payments can only be recorded for sent invoices', 'INVALID_STATE', 409);
    }
    const amountUnits = parseUnits(amount, 'amount', { positive: true });
    const totalUnits = rowTotalUnits(invoice);
    const paidUnits = rowPaidUnits(invoice);
    if (paidUnits + amountUnits > totalUnits) {
      throw invoiceError('Payment would overpay the invoice', 'OVERPAYMENT', 409, {
        paidAmount: unitsToNumber(paidUnits),
        amount: unitsToNumber(amountUnits),
        totalAmount: unitsToNumber(totalUnits),
      });
    }
    const reference = requiredText(paymentReference, 'paymentReference', 200);
    const paymentResult = await callFirst(payments, ['recordInvoicePayment', 'postInvoicePayment', 'recordPayment', 'allocatePayment', 'postPayment', 'createPaymentJournal'], {
      invoice,
      invoiceId: rowId(invoice, 'id', 'invoiceId'),
      amount: unitsToNumber(amountUnits),
      currency: rowCurrency(invoice),
      paymentReference: reference,
      actorId: getActorId(actor),
      actor,
      context: requestContext(actor),
      now: now(),
    }, 'record invoice payment');
    const journalIds = normalizeJournalIds(paymentResult);
    if (journalIds.length === 0) throw invoiceError('Payment adapter did not return a journal ID', 'ACCOUNTING_EVENT_MISSING', 502);

    const newPaidUnits = paidUnits + amountUnits;
    const paidInFull = newPaidUnits === totalUnits;
    const paymentDate = dateOnly(now());
    const nextStatus = paidInFull
      ? 'paid'
      : (rowDueDate(invoice) && rowDueDate(invoice) < paymentDate ? 'overdue' : 'partially_paid');
    const updated = await callFirst(adapter, ['updateInvoiceStatus', 'updateInvoicePayment'], {
      invoiceId: rowId(invoice, 'id', 'invoiceId'),
      status: nextStatus,
      paidAmount: unitsToNumber(newPaidUnits),
      paidAt: paidInFull ? now().toISOString() : undefined,
      actorId: getActorId(actor),
      paymentReference: reference,
    }, 'update invoice payment status');
    if (typeof adapter.createAuditEvent === 'function') {
      await adapter.createAuditEvent({
        trustId: rowTrustId(invoice),
        entityType: 'operations_invoice',
        entityId: rowId(invoice, 'id', 'invoiceId'),
        action: 'record_payment',
        actorId: getActorId(actor),
        ...requestContext(actor),
        metadata: { amount: unitsToNumber(amountUnits), paymentReference: reference, journalIds },
      });
    }
    return {
      invoiceId: rowId(invoice, 'id', 'invoiceId'),
      status: nextStatus,
      paidAmount: unitsToNumber(newPaidUnits),
      remainingAmount: unitsToNumber(totalUnits - newPaidUnits),
      journalIds,
      paymentEventId: paymentResult.paymentEventId || paymentResult.payment_event_id || null,
      transactionId: paymentResult.transactionId || paymentResult.transaction_id || null,
      invoice: updated,
    };
  }

  async function cancelAndReissueInvoice({ actor, invoiceId, reason } = {}) {
    requireActor(actor, ['admin'], 'cancel and reissue invoices');
    const invoice = await getInvoiceOrThrow(invoiceId);
    const status = rowStatus(invoice);
    if (!CANCELLABLE_STATUSES.has(status)) throw invoiceError('Only sent invoices can be cancelled and reissued', 'INVALID_STATE', 409);
    const normalizedReason = normalizeReason(reason);
    const lines = (invoice.lines || []).map((line) => ({
      description: line.description,
      quantity: line.quantity,
      rate: line.rate ?? line.unit_price ?? line.unitPrice,
      lineTotal: line.lineTotal ?? line.line_amount,
      taxAmount: line.taxAmount ?? line.tax_amount ?? 0,
    }));
    const replacement = await createInvoiceDraft({
      actor,
      trustId: rowTrustId(invoice),
      personId: rowPersonId(invoice),
      issueDate: invoice.issue_date || invoice.issueDate,
      dueDate: rowDueDate(invoice),
      currency: rowCurrency(invoice),
      lines,
      subtotal: invoice.subtotal,
      taxAmount: invoice.tax_amount ?? invoice.taxAmount,
      totalAmount: invoice.total_amount ?? invoice.totalAmount,
      metadata: {
        ...(invoice.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {}),
        reissued_from_invoice_id: rowId(invoice, 'id', 'invoiceId'),
        cancellation_reason: normalizedReason,
      },
    });
    const replacementId = rowId(replacement, 'id', 'invoiceId') || rowId(replacement.invoice, 'id', 'invoiceId');
    const cancelled = await adapter.updateInvoiceStatus({
      invoiceId: rowId(invoice, 'id', 'invoiceId'),
      status: 'cancelled',
      actorId: getActorId(actor),
    });
    if (typeof adapter.createAuditEvent === 'function') {
      await adapter.createAuditEvent({
        trustId: rowTrustId(invoice),
        entityType: 'operations_invoice',
        entityId: rowId(invoice, 'id', 'invoiceId'),
        action: 'cancel_and_reissue',
        actorId: getActorId(actor),
        reason: normalizedReason,
        ...requestContext(actor),
        metadata: { replacementInvoiceId: replacementId },
      });
    }
    return {
      cancelledInvoiceId: rowId(cancelled, 'id', 'invoiceId') || rowId(invoice, 'id', 'invoiceId'),
      replacementInvoiceId: replacementId,
    };
  }

  return {
    createInvoiceDraft,
    listInvoices,
    getInvoice,
    submitInvoiceForApproval,
    approveAndSendInvoice,
    rejectInvoiceApproval,
    recordInvoicePayment,
    cancelAndReissueInvoice,
  };
}

let defaultService;
function getDefaultService() {
  if (!defaultService) defaultService = createInvoiceService();
  return defaultService;
}

module.exports = {
  MONEY_SCALE,
  INVOICE_STATUSES,
  createInvoiceService,
  createSupabaseInvoiceRepository,
  createSupabaseInvoicePaymentAdapter,
  normalizeInvoiceInput,
  createInvoiceDraft: (input) => getDefaultService().createInvoiceDraft(input),
  listInvoices: (input) => getDefaultService().listInvoices(input),
  getInvoice: (input) => getDefaultService().getInvoice(input),
  submitInvoiceForApproval: (input) => getDefaultService().submitInvoiceForApproval(input),
  approveAndSendInvoice: (input) => getDefaultService().approveAndSendInvoice(input),
  rejectInvoiceApproval: (input) => getDefaultService().rejectInvoiceApproval(input),
  recordInvoicePayment: (input) => getDefaultService().recordInvoicePayment(input),
  cancelAndReissueInvoice: (input) => getDefaultService().cancelAndReissueInvoice(input),
  getActorRole,
};
