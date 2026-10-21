'use strict';

const MAX_STRING_LENGTH = 200;
const MAX_METADATA_BYTES = 10_000;
const MAX_METADATA_DEPTH = 5;
const MAX_METADATA_KEYS = 50;

function addError(errors, field, message) {
  if (!errors[field]) errors[field] = message;
}

function normalizeText(value, field, errors, { maxLength = MAX_STRING_LENGTH, required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) addError(errors, field, `${field} is required`);
    return null;
  }
  if (typeof value !== 'string') {
    addError(errors, field, `${field} must be a string`);
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    addError(errors, field, `${field} must not be empty`);
    return null;
  }
  if (normalized.length > maxLength) {
    addError(errors, field, `${field} must be ${maxLength} characters or fewer`);
    return null;
  }
  return normalized;
}

function validateMetadata(value, errors) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    addError(errors, 'metadata', 'metadata must be a JSON object');
    return {};
  }

  const seen = new Set();
  function visit(node, depth) {
    if (depth > MAX_METADATA_DEPTH) throw new Error('metadata is too deeply nested');
    if (node === undefined) throw new Error('metadata must contain only JSON values');
    if (node && typeof node === 'object') {
      if (seen.has(node)) throw new Error('metadata must not contain circular references');
      seen.add(node);
      const keys = Object.keys(node);
      if (keys.length > MAX_METADATA_KEYS) throw new Error('metadata has too many keys');
      for (const key of keys) {
        if (key.length > MAX_STRING_LENGTH) throw new Error('metadata key is too long');
        visit(node[key], depth + 1);
      }
      seen.delete(node);
    } else if (typeof node === 'string' && node.length > MAX_STRING_LENGTH) {
      throw new Error('metadata string value is too long');
    } else if (typeof node === 'number' && !Number.isFinite(node)) {
      throw new Error('metadata numbers must be finite');
    } else if (typeof node === 'bigint' || typeof node === 'function' || typeof node === 'symbol') {
      throw new Error('metadata contains a value that cannot be serialized as JSON');
    }
  }

  try {
    visit(value, 0);
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_METADATA_BYTES) {
      addError(errors, 'metadata', `metadata must be ${MAX_METADATA_BYTES} bytes or fewer`);
      return {};
    }
    return JSON.parse(serialized);
  } catch (error) {
    addError(errors, 'metadata', error.message || 'metadata must be valid JSON');
    return {};
  }
}

function validateFinancialDraft(input) {
  const errors = {};
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: { input: 'Financial draft must be an object' } };
  }

  const amount = source.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    addError(errors, 'amount', 'amount must be a positive finite number');
  }

  if (source.type !== 'debit' && source.type !== 'credit') {
    addError(errors, 'type', "type must be either 'debit' or 'credit'");
  }

  const currency = source.currency === undefined ? 'INR' : source.currency;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
    addError(errors, 'currency', 'currency must be an uppercase three-letter code');
  }

  const trustId = normalizeText(source.trustId, 'trustId', errors, { required: true });
  const accountId = normalizeText(source.accountId, 'accountId', errors, { required: true });

  let fundId = null;
  if (source.fundId !== undefined && source.fundId !== null) {
    fundId = normalizeText(source.fundId, 'fundId', errors);
  }

  let partyId = null;
  if (source.partyId !== undefined && source.partyId !== null) {
    partyId = normalizeText(source.partyId, 'partyId', errors);
  }

  let sourceName = null;
  if (source.source !== undefined && source.source !== null) {
    sourceName = normalizeText(source.source, 'source', errors);
  }

  const metadata = validateMetadata(source.metadata, errors);

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    value: {
      trustId,
      type: source.type,
      amount,
      currency,
      accountId,
      fundId,
      partyId,
      source: sourceName,
      metadata,
      status: 'draft',
    },
  };
}

module.exports = {
  MAX_METADATA_BYTES,
  validateFinancialDraft,
};
