'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  OPERATIONS_TABLES,
  OPERATIONS_ROLES,
  OPERATIONS_STATUSES,
  assertOperationsMigrationText,
} = require('../src/operations/schemaContract');

const migrationsDirectory = path.join(__dirname, '..', 'src', 'migrations');
const operationsMigrationFiles = ['016_operations_foundation.sql', '017_operations_security.sql', '018_operations_sequences.sql'];

test('operations schema contract lists the supported tables, roles, and statuses', () => {
  assert.equal(OPERATIONS_TABLES.length, 34);
  assert.deepEqual(OPERATIONS_ROLES, ['admin', 'accountant', 'viewer']);
  assert.ok(OPERATIONS_STATUSES.includes('draft'));
  assert.ok(OPERATIONS_STATUSES.includes('pending_approval'));
  assert.ok(OPERATIONS_STATUSES.includes('posted'));
  assert.ok(OPERATIONS_STATUSES.includes('sent'));
  assert.ok(OPERATIONS_STATUSES.includes('completed'));
});

test('operations schema migrations contain every contract table and no destructive DDL', () => {
  const migrationText = operationsMigrationFiles.map((fileName) => {
    const filePath = path.join(migrationsDirectory, fileName);
    const sqlText = fs.readFileSync(filePath, 'utf8');
    assertOperationsMigrationText(sqlText, fileName);
    return sqlText;
  }).join('\n');

  const createdTables = new Set();
  for (const match of migrationText.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z_][a-z0-9_]*)/gi)) {
    createdTables.add(match[1]);
  }

  assert.deepEqual([...createdTables].sort(), [...OPERATIONS_TABLES].sort());
});

test('operations schema contract rejects destructive DDL and identifies its source', () => {
  assert.throws(
    () => assertOperationsMigrationText('ALTER TABLE operations_trusts DROP COLUMN legal_name;', 'unsafe.sql'),
    /unsafe\.sql: destructive SQL is not allowed: ALTER TABLE operations_trusts DROP COLUMN legal_name/i,
  );
  assert.throws(
    () => assertOperationsMigrationText('DROP TABLE operations_trusts;', 'unsafe-table.sql'),
    /unsafe-table\.sql: destructive SQL is not allowed: DROP TABLE operations_trusts/i,
  );
});
