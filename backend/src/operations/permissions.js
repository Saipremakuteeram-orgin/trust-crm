'use strict';

const OPERATIONS_ROLES = Object.freeze(['admin', 'accountant', 'viewer']);

const ADMIN_ACTIONS = Object.freeze([
  'read_operations',
  'manage_users',
  'manage_trusts',
  'manage_settings',
  'manage_integrations',
  'manage_contacts',
  'manage_people',
  'manage_finance',
  'manage_donations',
  'manage_funds',
  'manage_invoices',
  'manage_payroll',
  'manage_reports',
  'manage_automation',
  'manage_journals',
  'manage_reconciliation',
  'submit_record',
  'approve_record',
  'post_record',
  'reverse_record',
  'retry_delivery',
  'export_reports',
]);

const ACCOUNTANT_ACTIONS = Object.freeze([
  'read_operations',
  'manage_contacts',
  'manage_people',
  'manage_finance',
  'manage_donations',
  'manage_funds',
  'manage_invoices',
  'manage_payroll',
  'manage_reports',
  'manage_journals',
  'manage_reconciliation',
  'submit_record',
  'retry_delivery',
  'export_reports',
]);

const VIEWER_ACTIONS = Object.freeze([
  'read_operations',
  'read_reports',
  'export_reports',
]);

const ROLE_ACTIONS = Object.freeze({
  admin: ADMIN_ACTIONS,
  accountant: ACCOUNTANT_ACTIONS,
  viewer: VIEWER_ACTIONS,
});

function can(role, action) {
  if (!OPERATIONS_ROLES.includes(role) || typeof action !== 'string') return false;
  return ROLE_ACTIONS[role].includes(action);
}

module.exports = {
  OPERATIONS_ROLES,
  ROLE_ACTIONS,
  can,
};
