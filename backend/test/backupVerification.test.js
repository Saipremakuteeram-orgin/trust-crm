require('module-alias/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

// The service creates a Supabase client at require time; dummy values keep this
// a pure unit test without touching a real project.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const { assertBackupComplete } = require('../src/services/backup');

const tables = [{ label: 'Widgets' }];

function buildWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Widgets');
  sheet.columns = [{ header: 'id', key: 'id' }];
  for (const row of rows) sheet.addRow(row);
  return workbook;
}

test('backup verification accepts a complete, delivered workbook', () => {
  const workbook = buildWorkbook([{ id: 1 }, { id: 2 }]);
  assert.equal(
    assertBackupComplete({ workbook, expectedRows: 2, delivered: true, tables }),
    2,
  );
});

test('backup verification rejects a workbook with missing rows', () => {
  const workbook = buildWorkbook([{ id: 1 }]);
  assert.throws(
    () => assertBackupComplete({ workbook, expectedRows: 2, delivered: true, tables }),
    /Backup verification failed: expected 2 rows, workbook has 1/,
  );
});

test('backup verification rejects an undelivered workbook', () => {
  const workbook = buildWorkbook([{ id: 1 }]);
  assert.throws(
    () => assertBackupComplete({ workbook, expectedRows: 1, delivered: false, tables }),
    /Backup file was not delivered/,
  );
});
