'use strict';

const express = require('express');
const supabaseAdmin = require('../config/supabaseAdmin');
const {
  requireOperationsFeature,
  requireOperationsRole,
  requireOperationsTrust,
} = require('../middlewares/operationsAuth');

const router = express.Router();

const SAFE_TRUST_FIELDS = [
  'id',
  'code',
  'name',
  'legal_name',
  'default_currency',
  'timezone',
  'financial_year_start_month',
  'is_active',
].join(', ');

const TRUST_WRITE_FIELDS = [
  'code',
  'name',
  'legal_name',
  'registration_number',
  'pan',
  'section_80g_number',
  'section_12a_number',
  'default_currency',
  'timezone',
  'financial_year_start_month',
  'is_active',
];

const TRUST_TEXT_FIELDS = [
  'code',
  'name',
  'legal_name',
  'registration_number',
  'pan',
  'section_80g_number',
  'section_12a_number',
  'timezone',
];

function textValue(value, field, { required = false, maxLength = 200 } = {}) {
  if (value === undefined) return { value: undefined };
  if (value === null && !required) return { value: null };
  if (typeof value !== 'string') return { error: `${field} must be a string` };

  const trimmed = value.trim();
  if (required && !trimmed) return { error: `${field} is required` };
  if (trimmed.length > maxLength) return { error: `${field} is too long` };
  return { value: trimmed || null };
}

function buildTrustPayload(body = {}, { isUpdate = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Trust data must be an object' };
  }

  const payload = {};
  for (const field of TRUST_TEXT_FIELDS) {
    if (body[field] === undefined) continue;
    const result = textValue(body[field], field, {
      required: !isUpdate && (field === 'code' || field === 'name'),
    });
    if (result.error) return result;
    payload[field] = result.value;
  }

  if (!isUpdate) {
    if (payload.code === undefined) return { error: 'code is required' };
    if (payload.name === undefined) return { error: 'name is required' };
  }

  if (payload.code !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(payload.code)) {
    return { error: 'code must be 1-32 letters, numbers, hyphens, or underscores' };
  }

  if (payload.default_currency !== undefined) {
    if (typeof body.default_currency !== 'string' || !/^[A-Z]{3}$/.test(body.default_currency)) {
      return { error: 'default_currency must be a three-letter uppercase code' };
    }
    payload.default_currency = body.default_currency;
  } else if (!isUpdate) {
    payload.default_currency = 'INR';
  }

  if (payload.financial_year_start_month !== undefined || !isUpdate) {
    const month = body.financial_year_start_month === undefined ? 4 : body.financial_year_start_month;
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return { error: 'financial_year_start_month must be an integer from 1 to 12' };
    }
    payload.financial_year_start_month = month;
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') return { error: 'is_active must be a boolean' };
    payload.is_active = body.is_active;
  } else if (!isUpdate) {
    payload.is_active = true;
  }

  if (isUpdate && Object.keys(payload).length === 0) {
    return { error: 'No valid fields to update' };
  }

  return { value: payload };
}

function safeError(res, error, fallback) {
  if (error) {
    if (error.code === '23505') return res.status(400).json({ success: false, message: 'Trust code already exists' });
    console.error(fallback, error.message);
  }
  return res.status(500).json({ success: false, message: fallback });
}

router.use(requireOperationsFeature('trusts'));

router.get('/', requireOperationsTrust({ required: false, allowAll: true }), async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('operations_trusts')
      .select(SAFE_TRUST_FIELDS)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (req.operationsTrustId) query = query.eq('id', req.operationsTrustId);

    const { data, error } = await query;
    if (error) return safeError(res, error, 'Failed to fetch trusts');

    return res.json({ success: true, result: data || [] });
  } catch (error) {
    return safeError(res, error, 'Failed to fetch trusts');
  }
});

router.post('/', requireOperationsRole('admin'), async (req, res) => {
  const { value, error: validationError } = buildTrustPayload(req.body);
  if (validationError) return res.status(400).json({ success: false, message: validationError });

  try {
    const { data, error } = await supabaseAdmin
      .from('operations_trusts')
      .insert({ ...value, created_by: req.user.id, updated_by: req.user.id })
      .select(SAFE_TRUST_FIELDS)
      .single();

    if (error) return safeError(res, error, 'Failed to create trust');
    return res.status(201).json({ success: true, result: data });
  } catch (error) {
    return safeError(res, error, 'Failed to create trust');
  }
});

router.patch(
  '/:id',
  requireOperationsRole('admin'),
  requireOperationsTrust({ required: true, write: true, paramNames: ['id'] }),
  async (req, res) => {
    const { value, error: validationError } = buildTrustPayload(req.body, { isUpdate: true });
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    try {
      const { data, error } = await supabaseAdmin
        .from('operations_trusts')
        .update({ ...value, updated_by: req.user.id })
        .eq('id', req.operationsTrustId)
        .select(SAFE_TRUST_FIELDS)
        .single();

      if (error) return safeError(res, error, 'Failed to update trust');
      return res.json({ success: true, result: data });
    } catch (error) {
      return safeError(res, error, 'Failed to update trust');
    }
  },
);

module.exports = router;
module.exports.SAFE_TRUST_FIELDS = SAFE_TRUST_FIELDS;
module.exports.buildTrustPayload = buildTrustPayload;
module.exports.TRUST_WRITE_FIELDS = TRUST_WRITE_FIELDS;
