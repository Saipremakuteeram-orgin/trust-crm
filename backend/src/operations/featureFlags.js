'use strict';

const OPERATIONS_FEATURES = Object.freeze({
  trusts: 'ENABLE_OPERATIONS_TRUSTS',
  donationsAutomation: 'ENABLE_OPERATIONS_DONATIONS_AUTOMATION',
  approvals: 'ENABLE_OPERATIONS_APPROVALS',
  funds: 'ENABLE_OPERATIONS_FUNDS',
  invoices: 'ENABLE_OPERATIONS_INVOICES',
  payroll: 'ENABLE_OPERATIONS_PAYROLL',
  automationMonitor: 'ENABLE_OPERATIONS_AUTOMATION_MONITOR',
});

const FEATURE_NAMES = new Set(Object.keys(OPERATIONS_FEATURES));
const FEATURE_ENV_NAMES = new Set(Object.values(OPERATIONS_FEATURES));

function resolveFeatureEnvName(name) {
  if (typeof name !== 'string') return null;
  if (FEATURE_NAMES.has(name)) return OPERATIONS_FEATURES[name];
  if (FEATURE_ENV_NAMES.has(name)) return name;
  return null;
}

function isOperationsEnabled(name, env = process.env) {
  const envName = resolveFeatureEnvName(name);
  return Boolean(envName && env && env[envName] === 'true');
}

function getOperationsFlags(env = process.env) {
  return Object.freeze(Object.fromEntries(
    Object.keys(OPERATIONS_FEATURES).map((name) => [name, isOperationsEnabled(name, env)]),
  ));
}

module.exports = {
  OPERATIONS_FEATURES,
  OPERATIONS_FLAGS: OPERATIONS_FEATURES,
  isOperationsEnabled,
  getOperationsFlags,
};
