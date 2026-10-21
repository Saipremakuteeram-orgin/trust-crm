'use strict';

const OPERATIONS_TABLES = Object.freeze([
  'operations_trusts',
  'operations_trust_settings',
  'operations_people',
  'operations_trust_people',
  'operations_transactions',
  'operations_journal_entries',
  'operations_journal_lines',
  'operations_approval_requests',
  'operations_approval_actions',
  'operations_audit_events',
  'operations_funds',
  'operations_fund_budgets',
  'operations_fund_allocations',
  'operations_fund_commitments',
  'operations_fund_transfers',
  'operations_payment_events',
  'operations_donations',
  'operations_donation_allocations',
  'operations_invoices',
  'operations_invoice_lines',
  'operations_receipts',
  'operations_document_deliveries',
  'operations_document_templates',
  'operations_number_sequences',
  'operations_employees',
  'operations_salary_structures',
  'operations_salary_components',
  'operations_payroll_periods',
  'operations_payroll_runs',
  'operations_payroll_lines',
  'operations_payroll_adjustments',
  'operations_payslips',
  'operations_payroll_payments',
  'operations_automation_events',
]);

const OPERATIONS_ROLES = Object.freeze(['admin', 'accountant', 'viewer']);

const OPERATIONS_STATUSES = Object.freeze([
  'draft',
  'pending',
  'pending_approval',
  'approved',
  'rejected',
  'posted',
  'reversed',
  'cancelled',
  'verified',
  'received',
  'failed',
  'completed',
  'refunded',
  'active',
  'closed',
  'issued',
  'sent',
  'voided',
  'partially_paid',
  'paid',
  'overdue',
  'processing',
  'retrying',
  'committed',
  'released',
  'fulfilled',
  'open',
  'inactive',
  'on_leave',
  'terminated',
  'retired',
]);

function splitSqlStatements(sqlText) {
  if (typeof sqlText !== 'string') {
    throw new TypeError('SQL text must be a string');
  }

  const statements = [];
  let statementStart = 0;
  let index = 0;
  let state = 'normal';
  let dollarTag = null;

  while (index < sqlText.length) {
    const current = sqlText[index];
    const next = sqlText[index + 1];

    if (state === 'normal') {
      if (current === '-' && next === '-') {
        index += 2;
        while (index < sqlText.length && sqlText[index] !== '\n') index += 1;
        continue;
      }

      if (current === '/' && next === '*') {
        index += 2;
        while (index < sqlText.length && !(sqlText[index] === '*' && sqlText[index + 1] === '/')) {
          index += 1;
        }
        index += 2;
        continue;
      }

      if (current === "'") {
        state = 'single-quoted';
        index += 1;
        continue;
      }

      if (current === '"') {
        state = 'double-quoted';
        index += 1;
        continue;
      }

      if (current === '$') {
        const tagMatch = sqlText.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (tagMatch) {
          dollarTag = tagMatch[0];
          state = 'dollar-quoted';
          index += dollarTag.length;
          continue;
        }
      }

      if (current === ';') {
        const statement = sqlText.slice(statementStart, index + 1).trim();
        if (statement) statements.push(statement);
        statementStart = index + 1;
      }

      index += 1;
      continue;
    }

    if (state === 'single-quoted') {
      if (current === "'" && next === "'") {
        index += 2;
        continue;
      }
      if (current === "'") state = 'normal';
      index += 1;
      continue;
    }

    if (state === 'double-quoted') {
      if (current === '"' && next === '"') {
        index += 2;
        continue;
      }
      if (current === '"') state = 'normal';
      index += 1;
      continue;
    }

    if (state === 'dollar-quoted') {
      if (sqlText.startsWith(dollarTag, index)) {
        index += dollarTag.length;
        state = 'normal';
        dollarTag = null;
      } else {
        index += 1;
      }
    }
  }

  const trailing = sqlText.slice(statementStart).trim();
  if (trailing) statements.push(trailing);
  return statements;
}

function stripSqlComments(sqlText) {
  return sqlText
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ');
}

function assertOperationsMigrationText(sqlText, fileName = 'operations migration') {
  const statements = splitSqlStatements(sqlText);
  const destructivePatterns = [
    /\bDROP\s+TABLE\b/i,
    /\bDROP\s+COLUMN\b/i,
    /\bALTER\s+TABLE\b[\s\S]*?\bDROP\b/i,
  ];

  for (const rawStatement of statements) {
    const statement = stripSqlComments(rawStatement).replace(/\s+/g, ' ').trim();
    const destructivePattern = destructivePatterns.find((pattern) => pattern.test(statement));
    if (destructivePattern) {
      throw new Error(`${fileName}: destructive SQL is not allowed: ${statement}`);
    }
  }

  return true;
}

module.exports = {
  OPERATIONS_TABLES,
  OPERATIONS_ROLES,
  OPERATIONS_STATUSES,
  assertOperationsMigrationText,
  splitSqlStatements,
};
