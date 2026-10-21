'use strict';

const { isOperationsEnabled } = require('../operations/featureFlags');
const { OPERATIONS_ROLES } = require('../operations/permissions');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALL_TRUSTS = 'all';

function sendNotFound(res) {
  return res.status(404).json({ success: false, message: 'Not found' });
}

function sendBadRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

function sendForbidden(res) {
  return res.status(403).json({ success: false, message: 'Insufficient permissions' });
}

function isValidOperationsTrustId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function getSourceValues(req, source, paramNames) {
  if (source === 'query') return [req.query?.trust_id, req.query?.trustId];
  if (source === 'body') return [req.body?.trust_id, req.body?.trustId];
  if (source === 'header') {
    const getHeader = (name) => (
      typeof req.get === 'function' ? req.get(name) : req.headers?.[name]
    );
    return [getHeader('x-operations-trust-id'), getHeader('x-trust-id')];
  }
  if (source === 'params') {
    return paramNames.flatMap((name) => [req.params?.[name]]);
  }
  return [];
}

function resolveOperationsTrustId(req, options = {}) {
  const {
    required = true,
    allowAll = false,
    write = false,
    sources = ['params', 'query', 'header', 'body'],
    paramNames = ['trust_id', 'trustId'],
  } = options;

  const values = sources
    .flatMap((source) => getSourceValues(req, source, paramNames))
    .filter((value) => value !== undefined && value !== null);

  if (values.some((value) => typeof value !== 'string' || value.trim() === '')) {
    return { error: 'A valid trust_id is required' };
  }

  const normalized = [...new Set(values.map((value) => value.trim()))];
  if (normalized.length === 0) {
    if (required || write || !allowAll) return { error: 'A trust_id is required' };
    return { trustId: null, scope: 'all' };
  }

  if (normalized.length > 1) {
    return { error: 'Trust identifiers must match' };
  }

  const trustId = normalized[0];
  if (trustId === ALL_TRUSTS) {
    if (allowAll && !write) return { trustId: null, scope: 'all' };
    return { error: 'A concrete trust_id is required for writes' };
  }

  if (!isValidOperationsTrustId(trustId)) {
    return { error: 'A valid trust_id is required' };
  }

  return { trustId, scope: 'trust' };
}

function requireOperationsFeature(feature) {
  return (req, res, next) => {
    if (!isOperationsEnabled(feature)) return sendNotFound(res);

    // Keep Supabase token and profile loading identical to existing routes. It is
    // intentionally loaded only after the feature check so disabled routes do
    // not reveal whether the Operations surface exists.
    const { requireAuth } = require('../middlewares/auth');
    return requireAuth(req, res, next);
  };
}

function requireOperationsRole(...roles) {
  const allowedRoles = roles.filter((role) => OPERATIONS_ROLES.includes(role));

  return (req, res, next) => {
    if (!req.profile || !allowedRoles.includes(req.profile.role)) {
      return sendForbidden(res);
    }
    return next();
  };
}

function requireOperationsTrust(options = {}) {
  return async (req, res, next) => {
    const resolved = resolveOperationsTrustId(req, options);
    if (resolved.error) return sendBadRequest(res, resolved.error);

    if (!resolved.trustId) {
      req.operationsTrustId = null;
      req.operationsTrustScope = 'all';
      return next();
    }

    try {
      const supabaseAdmin = require('../config/supabaseAdmin');
      const { data, error } = await supabaseAdmin
        .from('operations_trusts')
        .select('id')
        .eq('id', resolved.trustId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('Operations trust lookup error:', error.message);
        return res.status(500).json({ success: false, message: 'Unable to validate trust' });
      }
      if (!data) return sendNotFound(res);

      req.operationsTrustId = resolved.trustId;
      req.operationsTrustScope = resolved.scope;
      return next();
    } catch (error) {
      console.error('Operations trust middleware error:', error.message);
      return res.status(500).json({ success: false, message: 'Unable to validate trust' });
    }
  };
}

module.exports = {
  ALL_TRUSTS,
  isValidOperationsTrustId,
  resolveOperationsTrustId,
  requireOperationsFeature,
  requireOperationsRole,
  requireOperationsTrust,
};
