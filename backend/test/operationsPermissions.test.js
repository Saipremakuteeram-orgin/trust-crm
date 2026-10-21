'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  OPERATIONS_FEATURES,
  getOperationsFlags,
  isOperationsEnabled,
} = require('../src/operations/featureFlags');
const { can } = require('../src/operations/permissions');
const { resolveOperationsTrustId } = require('../src/middlewares/operationsAuth');

test('operations flags default to disabled and require the exact string true', () => {
  assert.equal(Object.keys(OPERATIONS_FEATURES).length, 7);
  assert.equal(isOperationsEnabled('trusts', {}), false);
  assert.equal(isOperationsEnabled('trusts', { ENABLE_OPERATIONS_TRUSTS: true }), false);
  assert.equal(isOperationsEnabled('trusts', { ENABLE_OPERATIONS_TRUSTS: 'TRUE' }), false);
  assert.equal(isOperationsEnabled('trusts', { ENABLE_OPERATIONS_TRUSTS: 'true' }), true);
  assert.equal(isOperationsEnabled('unknown', { ENABLE_OPERATIONS_TRUSTS: 'true' }), false);

  assert.deepEqual(getOperationsFlags({}), {
    trusts: false,
    donationsAutomation: false,
    approvals: false,
    funds: false,
    invoices: false,
    payroll: false,
    automationMonitor: false,
  });
});

test('operations permission matrix uses exactly the three global roles', () => {
  assert.equal(can('admin', 'manage_users'), true);
  assert.equal(can('accountant', 'manage_users'), false);
  assert.equal(can('accountant', 'manage_finance'), true);
  assert.equal(can('viewer', 'read_operations'), true);
  assert.equal(can('viewer', 'manage_finance'), false);
  assert.equal(can('accountant', 'approve_record'), false);
  assert.equal(can('admin', 'approve_record'), true);
});

test('unknown roles and actions default to deny', () => {
  assert.equal(can('owner', 'read_operations'), false);
  assert.equal(can('ADMIN', 'manage_users'), false);
  assert.equal(can('admin', 'grant_everything'), false);
  assert.equal(can(undefined, undefined), false);
});

test('operations trust context permits all-trust reads but requires a concrete trust for writes', () => {
  const trustId = '11111111-1111-4111-8111-111111111111';

  assert.deepEqual(
    resolveOperationsTrustId({}, { required: false, allowAll: true }),
    { trustId: null, scope: 'all' },
  );
  assert.deepEqual(
    resolveOperationsTrustId({ query: { trust_id: 'all' } }, { required: false, allowAll: true }),
    { trustId: null, scope: 'all' },
  );
  assert.equal(
    resolveOperationsTrustId({}, { required: false, allowAll: true, write: true }).error,
    'A trust_id is required',
  );
  assert.equal(
    resolveOperationsTrustId({}, { required: false, allowAll: false }).error,
    'A trust_id is required',
  );
  assert.equal(
    resolveOperationsTrustId({ body: { trust_id: 'all' } }, { required: true, write: true }).error,
    'A concrete trust_id is required for writes',
  );
  assert.deepEqual(
    resolveOperationsTrustId({ body: { trust_id: trustId } }, { required: true, write: true }),
    { trustId, scope: 'trust' },
  );
  assert.deepEqual(
    resolveOperationsTrustId({ headers: { 'x-operations-trust-id': trustId } }, { required: true, write: true }),
    { trustId, scope: 'trust' },
  );
  assert.equal(
    resolveOperationsTrustId({ body: { trust_id: 'not-a-uuid' } }, { required: true, write: true }).error,
    'A valid trust_id is required',
  );
});
