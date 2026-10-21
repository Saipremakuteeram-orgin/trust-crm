'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  OPERATIONS_FEATURES,
  getOperationsFlags,
} = require('../src/operations/featureFlags');
const { assertOperationsMigrationText } = require('../src/operations/schemaContract');

const repositoryRoot = path.join(__dirname, '..', '..');
const serverPath = path.join(repositoryRoot, 'backend', 'src', 'server.js');
const webhookPath = path.join(repositoryRoot, 'backend', 'src', 'routes', 'webhookWebsiteDonation.js');
const migrationsDirectory = path.join(repositoryRoot, 'backend', 'src', 'migrations');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('operations compatibility preserves existing API route mount strings', () => {
  const serverSource = readText(serverPath);
  const existingRouteMounts = [
    '/api/transactions',
    '/api/contacts',
    '/api/groups',
    '/api/dashboard',
    '/api/analytics',
    '/api/categories',
    '/api/accounts',
    '/api/trustees',
    '/api/compliance',
    '/api/receipts',
    '/api/bank-reconciliation',
    '/api/journal-entries',
    '/api/users',
    '/api/logs',
    '/api/exports',
    '/api/drive',
    '/api/backup',
    '/api/file-send',
    '/api/mail',
    '/api/reports',
    '/api/scheduled-reports',
    '/api/profile',
    '/api/recurring-transactions',
    '/api/functions',
    '/api/expense-scans',
    '/api/whatsapp',
    '/api/webhooks',
  ];

  for (const route of existingRouteMounts) {
    assert.match(
      serverSource,
      new RegExp(`app\\.use\\(['"]${escapeRegExp(route)}['"]`),
      `existing route mount is missing: ${route}`,
    );
  }
});

test('operations compatibility preserves existing migration files', () => {
  const existingMigrationFiles = [
    '000_schema_migrations.sql',
    '001_create_functions.sql',
    '002_function_category_items.sql',
    '003_update_views_for_items.sql',
    '004_rollup_function_budgets.sql',
    '005_chart_of_accounts_and_journal.sql',
    '006_trustees_and_beneficiaries.sql',
    '007_compliance_calendar.sql',
    '008_donation_receipts.sql',
    '009_bank_reconciliation.sql',
    '010_chart_of_accounts.sql',
    '011_scheduled_reports.sql',
    '012_webhook_website_event.sql',
    '013_webhook_transaction_link.sql',
    '014_contacts_email_unique.sql',
    '015_expense_scan_ocr.sql',
  ];

  for (const fileName of existingMigrationFiles) {
    assert.equal(
      fs.existsSync(path.join(migrationsDirectory, fileName)),
      true,
      `existing migration is missing: ${fileName}`,
    );
  }
});

test('operations compatibility preserves existing frontend test files', () => {
  const existingFrontendTests = [
    'frontend/src/lib/ocr/expenseParser.test.js',
    'frontend/src/lib/authMessages.test.js',
    'frontend/src/pages/operations/operationsPages.test.jsx',
  ];

  for (const relativePath of existingFrontendTests) {
    assert.equal(
      fs.existsSync(path.join(repositoryRoot, relativePath)),
      true,
      `existing frontend test is missing: ${relativePath}`,
    );
  }
});

test('operations feature flags are disabled by default', () => {
  const flags = getOperationsFlags({});
  assert.deepEqual(
    flags,
    Object.fromEntries(Object.keys(OPERATIONS_FEATURES).map((name) => [name, false])),
  );
});

test('operations compatibility preserves legacy webhook success payload keys', () => {
  const webhookSource = readText(webhookPath);

  assert.match(webhookSource, /success:\s*true/);
  assert.match(webhookSource, /alreadyExists:\s*true/);
  assert.match(webhookSource, /transactionId:\s*existing\.id/);
  assert.match(webhookSource, /transactionId:\s*data\.id/);
});

test('operations migrations contain no destructive DDL', () => {
  const operationsMigrationFiles = [
    '016_operations_foundation.sql',
    '017_operations_security.sql',
    '018_operations_sequences.sql',
    '019_operations_posting.sql',
  ];

  for (const fileName of operationsMigrationFiles) {
    const filePath = path.join(migrationsDirectory, fileName);
    assert.equal(fs.existsSync(filePath), true, `operations migration is missing: ${fileName}`);
    assert.doesNotThrow(
      () => assertOperationsMigrationText(readText(filePath), fileName),
      `operations migration contains destructive DDL: ${fileName}`,
    );
  }
});
