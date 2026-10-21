'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  calculatePayroll,
  createPayrollService,
  normalizePeriod,
} = require('../src/operations/payrollService');

const TRUST_ID = 'trust-a';
const PERSON_ID = 'person-a';

function actor(id, role) {
  return { id, role };
}

function salaryComponents() {
  return [
    { code: 'basic', name: 'Basic', type: 'basic', amount: 30000 },
    { code: 'hra', name: 'House rent allowance', type: 'allowance', amount: 10000 },
    { code: 'tds', name: 'TDS', type: 'tax', amount: 2000 },
    { code: 'pf', name: 'Employee PF', type: 'pf', calculationType: 'percentage', amount: 12, base: 'basic' },
    { code: 'esi', name: 'Employee ESI', type: 'esi', calculationType: 'percentage', amount: 1.75, base: 'gross' },
    { code: 'professional_tax', name: 'Professional tax', type: 'professional_tax', amount: 200 },
    { code: 'employer_pf', name: 'Employer PF', type: 'pf', calculationType: 'percentage', amount: 12, base: 'basic', isEmployerContribution: true },
  ];
}

function createMemoryRepository() {
  let nextId = 1;
  const id = (prefix) => `${prefix}-${nextId++}`;
  const repository = {
    employees: new Map(),
    structures: new Map(),
    periods: new Map(),
    runs: new Map(),
    lines: new Map(),
    approvals: new Map(),
    payslips: new Map(),
    payments: new Map(),
    adjustments: [],

    async getEmployee({ employeeId }) { return repository.employees.get(employeeId) || null; },
    async findEmployeeByCode({ trustId, employeeCode }) {
      return [...repository.employees.values()].find((employee) => employee.trust_id === trustId && employee.employee_code === employeeCode) || null;
    },
    async findEmployeeByPerson({ trustId, personId }) {
      return [...repository.employees.values()].find((employee) => employee.trust_id === trustId && employee.person_id === personId && ['active', 'on_leave'].includes(employee.status)) || null;
    },
    async createEmployee(input) {
      const employee = {
        id: id('employee'),
        trust_id: input.trustId,
        person_id: input.personId,
        employee_code: input.employeeCode,
        start_date: input.startDate,
        status: 'active',
      };
      repository.employees.set(employee.id, employee);
      return employee;
    },
    async updateEmployee({ employeeId, patch }) {
      const employee = repository.employees.get(employeeId);
      Object.assign(employee, patch);
      return employee;
    },
    async listEmployees({ trustId } = {}) {
      return [...repository.employees.values()].filter((employee) => !trustId || employee.trust_id === trustId);
    },
    async listSalaryStructures({ employeeId }) {
      return [...repository.structures.values()].filter((structure) => structure.employee_id === employeeId);
    },
    async getSalaryStructure({ salaryStructureId }) { return repository.structures.get(salaryStructureId) || null; },
    async createSalaryStructure(input) {
      const structure = {
        id: id('structure'),
        trust_id: input.trustId,
        employee_id: input.employeeId,
        structure_version: input.structureVersion,
        effective_from: input.effectiveFrom,
        gross_amount: input.grossAmount,
        status: 'active',
      };
      repository.structures.set(structure.id, structure);
      return structure;
    },
    async createSalaryComponents({ salaryStructureId, components }) {
      const structure = repository.structures.get(salaryStructureId);
      structure.components = components.map((component) => ({ ...component, id: id('component'), salary_structure_id: salaryStructureId }));
      return structure.components;
    },
    async retireSalaryStructures({ employeeId, effectiveTo, excludeId }) {
      for (const structure of repository.structures.values()) {
        if (structure.employee_id === employeeId && structure.id !== excludeId && structure.effective_from < effectiveTo) {
          structure.effective_to = effectiveTo;
          structure.status = 'retired';
        }
      }
    },
    async findPayrollPeriod({ trustId, periodName }) {
      return [...repository.periods.values()].find((period) => period.trust_id === trustId && period.period_name === periodName) || null;
    },
    async createPayrollPeriod(input) {
      const period = { id: id('period'), ...input, period_name: input.periodName, status: 'processing' };
      repository.periods.set(period.id, period);
      return period;
    },
    async findPayrollRun({ trustId, periodName }) {
      const period = [...repository.periods.values()].find((candidate) => candidate.trust_id === trustId && candidate.period_name === periodName);
      return period ? [...repository.runs.values()].find((run) => run.payroll_period_id === period.id) || null : null;
    },
    async getPayrollRun({ payrollRunId }) { return repository.runs.get(payrollRunId) || null; },
    async listPayrollRuns({ trustId } = {}) { return [...repository.runs.values()].filter((run) => !trustId || run.trust_id === trustId); },
    async createPayrollRun(input) {
      const run = {
        id: id('run'),
        ...input,
        period_name: [...repository.periods.values()].find((period) => period.id === input.payrollPeriodId)?.period_name,
        payroll_period_id: input.payrollPeriodId,
        run_number: input.runNumber,
        status: input.status,
        trust_id: input.trustId,
        gross_total: input.grossTotal,
        deduction_total: input.deductionTotal,
        net_total: input.netTotal,
        fund_id: input.fundId || null,
      };
      repository.runs.set(run.id, run);
      return run;
    },
    async createPayrollLines({ payrollRunId, lines }) {
      const stored = lines.map((line) => ({ id: id('line'), payroll_run_id: payrollRunId, employee_id: line.employeeId, salary_structure_id: line.salaryStructureId, gross_amount: line.grossAmount, deduction_amount: line.deductionAmount, net_amount: line.netAmount, calculation: line.calculation }));
      repository.lines.set(payrollRunId, stored);
      return stored;
    },
    async listPayrollLines({ payrollRunId }) { return repository.lines.get(payrollRunId) || []; },
    async updatePayrollRun({ payrollRunId, patch }) { const run = repository.runs.get(payrollRunId); Object.assign(run, patch); return run; },
    async updatePayrollLines({ payrollRunId, status }) { for (const line of repository.lines.get(payrollRunId) || []) line.status = status; return repository.lines.get(payrollRunId) || []; },
    async createPayrollAdjustments({ adjustments }) { repository.adjustments.push(...adjustments); return adjustments; },
    async createApproval(input) { const approval = { id: id('approval'), ...input, status: 'pending_approval', record_id: input.recordId }; repository.approvals.set(approval.id, approval); return approval; },
    async getApproval({ recordId }) { return [...repository.approvals.values()].find((approval) => approval.record_id === recordId) || null; },
    async updateApproval({ approvalId, status, actorId }) { const approval = repository.approvals.get(approvalId); Object.assign(approval, { status, reviewed_by: actorId }); return approval; },
    async createApprovalAction() { return { id: id('action') }; },
    async createPayslips({ payrollRunId, payslips }) { const stored = payslips.map((payslip) => ({ id: id('payslip'), payroll_run_id: payrollRunId, ...payslip })); repository.payslips.set(payrollRunId, stored); return stored; },
    async issuePayslips({ payrollRunId, issuedAt }) { const rows = repository.payslips.get(payrollRunId) || []; rows.forEach((row) => Object.assign(row, { status: 'issued', issued_at: issuedAt })); return rows; },
    async listPayslips({ payrollRunId }) { return repository.payslips.get(payrollRunId) || []; },
    async listPayrollPayments({ payrollRunId }) { return repository.payments.get(payrollRunId) || []; },
    async createPayrollPayments({ payrollRunId, payments }) { const stored = payments.map((payment) => ({ id: id('payment'), payroll_run_id: payrollRunId, ...payment })); repository.payments.set(payrollRunId, stored); return stored; },
  };
  return repository;
}

function createFixtures() {
  const repository = createMemoryRepository();
  const postingCalls = [];
  const postingAdapter = {
    async postPayroll(input) {
      postingCalls.push(input);
      return {
        transactionId: 'transaction-payroll-1',
        journalEntryId: 'journal-payroll-1',
        journalIds: ['journal-payroll-1'],
        fundAllocationId: input.fundId ? 'fund-allocation-payroll-1' : null,
        totalDebit: input.totalDebit,
        totalCredit: input.totalCredit,
        balanced: true,
      };
    },
  };
  let current = new Date('2026-10-21T08:00:00.000Z');
  const service = createPayrollService({ repository, postingAdapter, now: () => current });
  return { repository, postingCalls, service, setNow(value) { current = new Date(value); } };
}

async function employeeAndStructure(fixtures, employeeCode = 'EMP-001') {
  const employee = await fixtures.service.createEmployee({
    actor: actor('accountant-1', 'accountant'),
    trustId: TRUST_ID,
    personId: PERSON_ID,
    employeeCode,
    startDate: '2026-04-01',
  });
  const structure = await fixtures.service.saveSalaryStructure({
    actor: actor('accountant-1', 'accountant'),
    employeeId: employee.id,
    components: salaryComponents(),
    effectiveFrom: '2026-04-01',
  });
  return { employee, structure };
}

test('operations payroll calculates configured INR deductions deterministically', () => {
  const first = calculatePayroll({ employeeId: 'employee-1', components: salaryComponents() });
  const second = calculatePayroll({ employeeId: 'employee-1', components: salaryComponents() });

  assert.deepEqual(first, second);
  assert.equal(first.currency, 'INR');
  assert.equal(first.gross, 40000);
  assert.equal(first.tds, 2000);
  assert.equal(first.pf, 3600);
  assert.equal(first.esi, 700);
  assert.equal(first.professionalTax, 200);
  assert.equal(first.deductions, 6500);
  assert.equal(first.net, 33500);
  assert.equal(first.employerContributions, 3600);
});

test('operations payroll rejects invalid periods, negative components, and missing salary structures', async () => {
  assert.deepEqual(normalizePeriod('2026-04').financialYear, '2026-27');
  assert.throws(() => normalizePeriod('2026-13'), (error) => error.code === 'INVALID_PERIOD');
  assert.throws(() => calculatePayroll({ components: [{ code: 'basic', type: 'basic', amount: -1 }] }), (error) => error.code === 'VALIDATION_ERROR');

  const fixtures = createFixtures();
  await assert.rejects(
    () => fixtures.service.preparePayrollRun({ actor: actor('accountant-1', 'accountant'), trustId: TRUST_ID, period: '2026-10', employeeIds: ['missing'] }),
    (error) => error.code === 'NOT_FOUND',
  );
  await assert.rejects(
    () => fixtures.service.preparePayrollRun({ actor: actor('accountant-1', 'accountant'), trustId: TRUST_ID, period: '2026-10', employeeIds: [] }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('operations payroll versions salary structures and rejects duplicate employees and periods', async () => {
  const fixtures = createFixtures();
  const { employee } = await employeeAndStructure(fixtures);
  const nextStructure = await fixtures.service.saveSalaryStructure({
    actor: actor('accountant-1', 'accountant'),
    employeeId: employee.id,
    components: [{ code: 'basic', type: 'basic', amount: 35000 }],
    effectiveFrom: '2026-10-01',
  });
  assert.equal(nextStructure.structure_version, 2);
  assert.equal(fixtures.repository.structures.get(nextStructure.id).status, 'active');
  await assert.rejects(
    () => fixtures.service.saveSalaryStructure({ actor: actor('accountant-1', 'accountant'), trustId: 'trust-b', employeeId: employee.id, components: salaryComponents(), effectiveFrom: '2027-01-01' }),
    (error) => error.code === 'CROSS_TRUST_OPERATION',
  );

  await assert.rejects(
    () => fixtures.service.preparePayrollRun({ actor: actor('accountant-1', 'accountant'), trustId: TRUST_ID, period: '2026-10', employeeIds: [employee.id, employee.id] }),
    (error) => error.code === 'DUPLICATE_EMPLOYEE_IN_PERIOD',
  );
  const prepared = await fixtures.service.preparePayrollRun({ actor: actor('accountant-1', 'accountant'), trustId: TRUST_ID, period: '2026-10', employeeIds: [employee.id] });
  assert.equal(prepared.status, 'pending_approval');
  await assert.rejects(
    () => fixtures.service.preparePayrollRun({ actor: actor('accountant-1', 'accountant'), trustId: TRUST_ID, period: '2026-10', employeeIds: [employee.id] }),
    (error) => error.code === 'DUPLICATE_PAYROLL_PERIOD',
  );
});

test('operations payroll requires Admin approval, posts balanced journals and issues payslips', async () => {
  const fixtures = createFixtures();
  const { employee } = await employeeAndStructure(fixtures);
  const prepared = await fixtures.service.preparePayrollRun({
    actor: actor('accountant-1', 'accountant'),
    trustId: TRUST_ID,
    period: '2026-10',
    employeeIds: [employee.id],
    fundId: 'fund-payroll',
  });

  await assert.rejects(
    () => fixtures.service.approvePayrollRun({ actor: actor('accountant-1', 'accountant'), payrollRunId: prepared.id }),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
  const approved = await fixtures.service.approvePayrollRun({ actor: actor('admin-1', 'admin'), payrollRunId: prepared.id });

  assert.equal(approved.status, 'posted');
  assert.deepEqual(approved.journalIds, ['journal-payroll-1']);
  assert.equal(approved.fundAllocationId, 'fund-allocation-payroll-1');
  assert.equal(approved.journal.journal, undefined);
  assert.equal(approved.journal.totalDebit, approved.journal.totalCredit);
  assert.equal(approved.payslipIds.length, 1);
  assert.equal(approved.payslips[0].status, 'issued');
  assert.equal(fixtures.postingCalls[0].fundId, 'fund-payroll');
  assert.equal(fixtures.repository.runs.get(prepared.id).status, 'posted');
});

test('operations payroll payment status is separate and idempotent from posting status', async () => {
  const fixtures = createFixtures();
  const { employee } = await employeeAndStructure(fixtures);
  const prepared = await fixtures.service.preparePayrollRun({ actor: actor('accountant-1', 'accountant'), trustId: TRUST_ID, period: '2026-10', employeeIds: [employee.id] });
  await fixtures.service.approvePayrollRun({ actor: actor('admin-1', 'admin'), payrollRunId: prepared.id });

  const payment = await fixtures.service.recordPayrollPayment({ actor: actor('accountant-1', 'accountant'), payrollRunId: prepared.id, paymentReference: 'BANK-202610-001' });
  assert.equal(payment.paymentStatus, 'completed');
  assert.equal(payment.status, 'posted');
  assert.equal(fixtures.repository.runs.get(prepared.id).status, 'posted');
  const retry = await fixtures.service.recordPayrollPayment({ actor: actor('accountant-1', 'accountant'), payrollRunId: prepared.id, paymentReference: 'BANK-202610-001' });
  assert.deepEqual(retry.paymentIds, payment.paymentIds);
  const listedRuns = await fixtures.service.listPayrollRuns({ actor: actor('viewer-1', 'viewer'), trustId: TRUST_ID });
  assert.equal(listedRuns[0].paymentStatus, 'completed');
  await assert.rejects(
    () => fixtures.service.recordPayrollPayment({ actor: actor('accountant-1', 'accountant'), payrollRunId: prepared.id, paymentReference: 'BANK-OTHER' }),
    (error) => error.code === 'PAYMENT_ALREADY_RECORDED',
  );
  await assert.rejects(
    () => fixtures.service.createEmployee({ actor: actor('viewer-1', 'viewer'), trustId: TRUST_ID, personId: 'person-viewer', employeeCode: 'VIEW-001', startDate: '2026-10-01' }),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
});
