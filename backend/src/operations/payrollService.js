'use strict';

const {
  OperationsServiceError,
  getActorId,
  requireActor,
} = require('./postingService');

const PAYROLL_CURRENCY = 'INR';
const PAYROLL_TIMEZONE = 'Asia/Kolkata';
const FINANCIAL_YEAR_START_MONTH = 4;
const MONEY_SCALE = 100;
const MAX_COMPONENTS = 100;
const MAX_EMPLOYEES_PER_RUN = 1_000;

const COMPONENT_TYPES = new Set([
  'basic',
  'allowance',
  'deduction',
  'tax',
  'pf',
  'esi',
  'professional_tax',
  'other',
]);

const COMPONENT_TYPE_ALIASES = Object.freeze({
  earning: 'allowance',
  earnings: 'allowance',
  bonus: 'allowance',
  reimbursement: 'allowance',
  tds: 'tax',
  professionalTax: 'professional_tax',
  'professional-tax': 'professional_tax',
  professional_tax: 'professional_tax',
  pt: 'professional_tax',
});

const CONFIGURED_DEDUCTION_CODES = new Set(['tds', 'pf', 'esi', 'professional_tax', 'professional-tax', 'pt']);

function payrollError(message, code = 'VALIDATION_ERROR', statusCode = 400, details) {
  return new OperationsServiceError(message, { code, statusCode, details });
}

function requiredText(value, field, maxLength = 200) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw payrollError(`${field} is required`, 'VALIDATION_ERROR', 400, { [field]: `${field} is required` });
  }
  const normalized = String(value).trim();
  if (normalized.length > maxLength) {
    throw payrollError(`${field} must be ${maxLength} characters or fewer`, 'VALIDATION_ERROR', 400, { [field]: 'too long' });
  }
  return normalized;
}

function optionalText(value, field, maxLength = 200) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return requiredText(value, field, maxLength);
}

function ensureId(value, field) {
  return requiredText(value, field, 120);
}

function parseMoney(value, field, { positive = false, allowZero = true } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw payrollError(`${field} is required`, 'VALIDATION_ERROR', 400, { [field]: `${field} is required` });
  }
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(number)) {
    throw payrollError(`${field} must be a finite number`, 'VALIDATION_ERROR', 400, { [field]: 'must be finite' });
  }
  if (number < 0 || (positive && number <= 0) || (!allowZero && number === 0)) {
    throw payrollError(`${field} must be ${positive ? 'positive' : 'non-negative'}`, 'VALIDATION_ERROR', 400, { [field]: 'must be non-negative' });
  }
  const cents = Math.round((number + Number.EPSILON) * MONEY_SCALE);
  if (!Number.isSafeInteger(cents)) {
    throw payrollError(`${field} is outside the supported range`, 'VALIDATION_ERROR', 400, { [field]: 'out of range' });
  }
  return cents;
}

function centsToAmount(cents) {
  return Number((cents / MONEY_SCALE).toFixed(2));
}

function roundAmount(value) {
  return centsToAmount(parseMoney(value, 'amount'));
}

function normalizeDate(value, field) {
  const normalized = requiredText(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw payrollError(`${field} must use YYYY-MM-DD format`, 'VALIDATION_ERROR', 400, { [field]: 'invalid date' });
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw payrollError(`${field} must be a valid calendar date`, 'VALIDATION_ERROR', 400, { [field]: 'invalid date' });
  }
  return normalized;
}

function dateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnly(date);
}

function financialYearFor(dateValue) {
  const year = Number(String(dateValue).slice(0, 4));
  const month = Number(String(dateValue).slice(5, 7));
  return month >= FINANCIAL_YEAR_START_MONTH
    ? `${year}-${String(year + 1).slice(-2)}`
    : `${year - 1}-${String(year).slice(-2)}`;
}

function monthEnd(year, month) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function normalizePeriod(period, nowDate = new Date()) {
  let source = period;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const name = source.periodName || source.period_name || source.name || source.period;
    const start = source.periodStart || source.period_start || source.start || source.from;
    const end = source.periodEnd || source.period_end || source.end || source.to;
    if (name && /^\d{4}-\d{2}$/.test(String(name).trim())) source = String(name).trim();
    else if (start || end) source = { start, end, name };
    else source = name;
  }

  if (typeof source === 'string' && /^\d{4}-\d{2}$/.test(source.trim())) {
    const periodName = source.trim();
    const year = Number(periodName.slice(0, 4));
    const month = Number(periodName.slice(5, 7));
    if (month < 1 || month > 12) throw payrollError('period must use a valid month', 'INVALID_PERIOD');
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const periodEnd = monthEnd(year, month);
    return {
      periodName,
      periodStart,
      periodEnd,
      financialYear: financialYearFor(periodStart),
      currency: PAYROLL_CURRENCY,
      timezone: PAYROLL_TIMEZONE,
    };
  }

  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const periodStart = normalizeDate(source.start, 'period.start');
    const periodEnd = normalizeDate(source.end, 'period.end');
    if (periodStart > periodEnd) throw payrollError('period.start must be before period.end', 'INVALID_PERIOD');
    const startYear = Number(periodStart.slice(0, 4));
    const startMonth = Number(periodStart.slice(5, 7));
    const expectedEnd = monthEnd(startYear, startMonth);
    if (periodStart.slice(8) !== '01' || periodEnd !== expectedEnd) {
      throw payrollError('Payroll periods must cover one complete calendar month', 'INVALID_PERIOD');
    }
    return {
      periodName: `${startYear}-${String(startMonth).padStart(2, '0')}`,
      periodStart,
      periodEnd,
      financialYear: financialYearFor(periodStart),
      currency: PAYROLL_CURRENCY,
      timezone: PAYROLL_TIMEZONE,
    };
  }

  const fallback = dateOnly(nowDate);
  throw payrollError(`period must be YYYY-MM; received ${String(fallback)}`, 'INVALID_PERIOD', 400, { period: 'expected YYYY-MM' });
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function componentCode(source, index) {
  return slug(source.code || source.componentCode || source.component_code || source.name || `component_${index + 1}`);
}

function defaultComponentType(code, sourceType) {
  const normalizedCode = slug(code);
  const rawType = String(sourceType || '').trim().toLowerCase();
  if (rawType) {
    return COMPONENT_TYPE_ALIASES[rawType] || rawType;
  }
  if (normalizedCode === 'basic') return 'basic';
  if (CONFIGURED_DEDUCTION_CODES.has(normalizedCode)) {
    return normalizedCode === 'pf' ? 'pf'
      : normalizedCode === 'esi' ? 'esi'
        : normalizedCode === 'professional_tax' || normalizedCode === 'pt' ? 'professional_tax' : 'tax';
  }
  return 'allowance';
}

function componentsFromInput(components) {
  if (Array.isArray(components)) return components;
  if (components && typeof components === 'object') {
    return Object.entries(components).map(([code, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) return { code, ...value };
      return { code, amount: value };
    });
  }
  return null;
}

function normalizeComponents(components) {
  const input = componentsFromInput(components);
  if (!input || input.length === 0) {
    throw payrollError('At least one salary component is required', 'VALIDATION_ERROR', 400, { components: 'must contain at least one component' });
  }
  if (input.length > MAX_COMPONENTS) throw payrollError(`No more than ${MAX_COMPONENTS} salary components are allowed`, 'VALIDATION_ERROR');

  const seen = new Set();
  return input.map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw payrollError(`components[${index}] must be an object`, 'VALIDATION_ERROR');
    }
    const code = componentCode(source, index);
    if (!code) throw payrollError(`components[${index}].code is required`, 'VALIDATION_ERROR');
    if (seen.has(code)) throw payrollError(`Duplicate salary component: ${code}`, 'DUPLICATE_COMPONENT', 409);
    seen.add(code);
    const type = defaultComponentType(code, source.type || source.componentType || source.component_type);
    if (!COMPONENT_TYPES.has(type)) throw payrollError(`Unsupported salary component type: ${type}`, 'VALIDATION_ERROR');
    const calculationType = String(source.calculationType || source.calculation_type || 'fixed').trim().toLowerCase();
    if (!['fixed', 'percentage'].includes(calculationType)) {
      throw payrollError(`components[${index}].calculationType must be fixed or percentage`, 'VALIDATION_ERROR');
    }
    const amount = parseMoney(source.amount ?? source.value ?? 0, `components[${index}].amount`);
    if (calculationType === 'percentage' && amount > 10_000) {
      throw payrollError(`components[${index}].amount percentage cannot exceed 10000`, 'VALIDATION_ERROR');
    }
    const normalizedCode = type === 'professional_tax' && code === 'pt' ? 'professional_tax' : code;
    return {
      code: normalizedCode,
      name: requiredText(source.name || source.componentName || code.replaceAll('_', ' '), `components[${index}].name`, 120),
      type,
      calculationType,
      amount: centsToAmount(amount),
      amountCents: amount,
      base: source.base || source.calculationBase || source.calculation_base || null,
      isTaxable: source.isTaxable ?? source.is_taxable ?? true,
      isEmployerContribution: Boolean(source.isEmployerContribution ?? source.is_employer_contribution ?? source.employerContribution),
    };
  });
}

function isDeduction(component) {
  return component.type === 'deduction'
    || component.type === 'tax'
    || component.type === 'pf'
    || component.type === 'esi'
    || component.type === 'professional_tax'
    || CONFIGURED_DEDUCTION_CODES.has(component.code);
}

function baseFor(component, values, { basic, fixedGross, gross, taxableGross }) {
  const requested = slug(component.base || '');
  if (requested === 'basic') return basic;
  if (requested === 'taxable_gross' || requested === 'taxable') return taxableGross;
  if (requested === 'gross' || requested === 'total') return gross;
  if (requested && values.has(requested)) return values.get(requested);
  if (component.type === 'pf' || component.type === 'esi') return basic;
  if (isDeduction(component)) return taxableGross;
  return fixedGross;
}

function calculatePayroll({ employeeId, salaryStructureId = null, components }) {
  const normalized = normalizeComponents(components);
  const values = new Map();
  const evaluated = [];
  const fixedEarnings = normalized
    .filter((component) => !isDeduction(component) && !component.isEmployerContribution && component.calculationType === 'fixed')
    .reduce((total, component) => total + component.amountCents, 0);
  const basic = normalized
    .filter((component) => component.type === 'basic' && !component.isEmployerContribution)
    .reduce((total, component) => total + (component.calculationType === 'fixed' ? component.amountCents : 0), 0);
  let grossCents = fixedEarnings;
  for (const component of normalized) {
    if (isDeduction(component) || component.isEmployerContribution || component.calculationType !== 'percentage') continue;
    const amount = Math.round((baseFor(component, values, { basic, fixedGross: fixedEarnings, gross: grossCents, taxableGross: grossCents }) * component.amountCents) / 10_000);
    grossCents += amount;
    values.set(component.code, amount);
  }

  const taxableGross = normalized.reduce((total, component) => {
    if (isDeduction(component) || component.isEmployerContribution || component.isTaxable === false) return total;
    const value = component.calculationType === 'fixed'
      ? component.amountCents
      : (values.get(component.code) || 0);
    return total + value;
  }, 0);
  const deductionBreakdown = { tds: 0, pf: 0, esi: 0, professionalTax: 0, other: 0 };
  let deductionCents = 0;
  let employerContributionCents = 0;

  for (const component of normalized) {
    let amount = component.calculationType === 'fixed'
      ? component.amountCents
      : Math.round((baseFor(component, values, { basic, fixedGross: fixedEarnings, gross: grossCents, taxableGross }) * component.amountCents) / 10_000);
    amount = Math.max(0, amount);
    values.set(component.code, amount);
    const result = {
      code: component.code,
      name: component.name,
      type: component.type,
      calculationType: component.calculationType,
      configuredAmount: centsToAmount(component.amountCents),
      amount: centsToAmount(amount),
      base: component.base || null,
      isTaxable: component.isTaxable,
      isEmployerContribution: component.isEmployerContribution,
    };
    evaluated.push(result);

    if (component.isEmployerContribution) {
      employerContributionCents += amount;
      continue;
    }
    if (isDeduction(component)) {
      deductionCents += amount;
      const key = component.code === 'tds' ? 'tds'
        : component.code === 'pf' ? 'pf'
          : component.code === 'esi' ? 'esi'
            : component.type === 'professional_tax' || component.code === 'professional_tax' || component.code === 'pt'
              ? 'professionalTax' : 'other';
      deductionBreakdown[key] += amount;
    }
  }

  const netCents = grossCents - deductionCents;
  if (grossCents <= 0) throw payrollError('Salary structure must produce a positive gross salary', 'INVALID_SALARY_STRUCTURE', 409);
  if (netCents < 0) throw payrollError('Payroll deductions cannot exceed gross salary', 'NEGATIVE_NET_PAY', 409);
  return {
    employeeId: employeeId || null,
    salaryStructureId,
    currency: PAYROLL_CURRENCY,
    components: evaluated,
    gross: centsToAmount(grossCents),
    grossAmount: centsToAmount(grossCents),
    deductions: centsToAmount(deductionCents),
    deductionTotal: centsToAmount(deductionCents),
    net: centsToAmount(netCents),
    netPay: centsToAmount(netCents),
    employerContributions: centsToAmount(employerContributionCents),
    employerContributionTotal: centsToAmount(employerContributionCents),
    taxableGross: centsToAmount(taxableGross),
    tds: centsToAmount(deductionBreakdown.tds),
    pf: centsToAmount(deductionBreakdown.pf),
    esi: centsToAmount(deductionBreakdown.esi),
    professionalTax: centsToAmount(deductionBreakdown.professionalTax),
    deductionBreakdown: Object.fromEntries(Object.entries(deductionBreakdown).map(([key, value]) => [key, centsToAmount(value)])),
  };
}

function rowId(row, ...keys) {
  if (typeof row === 'string') return row;
  for (const key of keys) if (row && row[key] !== undefined && row[key] !== null) return row[key];
  return null;
}

function rowTrustId(row) {
  return row?.trust_id || row?.trustId || null;
}

function rowEmployeeId(row) {
  return row?.employee_id || row?.employeeId || null;
}

function rowStatus(row) {
  return String(row?.status || '').toLowerCase();
}

function ensureTrustOwnership(row, trustId) {
  if (trustId && rowTrustId(row) !== trustId) {
    throw payrollError('Payroll record does not belong to the selected trust', 'CROSS_TRUST_OPERATION', 409);
  }
}

function rowEffectiveFrom(row) {
  return row?.effective_from || row?.effectiveFrom || null;
}

function databaseError(error, operation) {
  if (error instanceof OperationsServiceError) throw error;
  const code = error?.code || 'DATABASE_ERROR';
  const duplicate = code === '23505' || /duplicate|unique/i.test(error?.message || '');
  throw payrollError(
    duplicate ? `Duplicate payroll record: ${operation}` : (error?.message || `Failed to ${operation}`),
    duplicate ? 'DUPLICATE_RECORD' : code,
    error?.statusCode || (code === '42501' ? 403 : duplicate ? 409 : 400),
    error,
  );
}

function singleResult(data, operation) {
  if (!data) throw payrollError(`Database did not return a result for ${operation}`, 'EMPTY_DATABASE_RESULT', 502);
  return data;
}

function safeEmployee(employee) {
  if (!employee) return employee;
  const {
    pan: _pan,
    uan: _uan,
    pf_number: _pfNumber,
    esi_number: _esiNumber,
    metadata: _metadata,
    ...safe
  } = employee;
  return safe;
}

function callAdapter(adapter, names, input, operation) {
  const name = names.find((candidate) => typeof adapter?.[candidate] === 'function');
  if (!name) throw new TypeError(`adapter must provide ${names[0]} for ${operation}`);
  return adapter[name](input);
}

function createSupabasePayrollRepository(client) {
  const getClient = () => client || require('../config/supabaseAdmin');

  async function one(query, operation) {
    const { data, error } = await query;
    if (error) databaseError(error, operation);
    return data || null;
  }

  async function many(query, operation) {
    const { data, error } = await query;
    if (error) databaseError(error, operation);
    return data || [];
  }

  return {
    async getEmployee({ employeeId }) {
      return one(getClient().from('operations_employees').select('*').eq('id', employeeId).maybeSingle(), 'get employee');
    },

    async findEmployeeByCode({ trustId, employeeCode }) {
      return one(getClient().from('operations_employees').select('*').eq('trust_id', trustId).eq('employee_code', employeeCode).maybeSingle(), 'find employee code');
    },

    async findEmployeeByPerson({ trustId, personId }) {
      return one(getClient().from('operations_employees').select('*').eq('trust_id', trustId).eq('person_id', personId).in('status', ['active', 'on_leave']).maybeSingle(), 'find employee person');
    },

    async createEmployee(input) {
      const { data, error } = await getClient().from('operations_employees').insert({
        trust_id: input.trustId,
        person_id: input.personId,
        employee_code: input.employeeCode,
        start_date: input.startDate,
        status: 'active',
        created_by: input.actorId,
        updated_by: input.actorId,
      }).select('*').single();
      if (error) databaseError(error, 'create employee');
      const employee = singleResult(data, 'create employee');
      // Keep the shared-person relationship additive and trust-specific.
      await getClient().from('operations_trust_people').upsert({
        trust_id: input.trustId,
        person_id: input.personId,
        relationship_type: 'employee',
        is_active: true,
        created_by: input.actorId,
        updated_by: input.actorId,
      }, { onConflict: 'trust_id,person_id,relationship_type' });
      return employee;
    },

    async updateEmployee({ employeeId, patch, actorId }) {
      const { data, error } = await getClient().from('operations_employees').update({
        ...patch,
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      }).eq('id', employeeId).select('*').single();
      if (error) databaseError(error, 'update employee');
      return singleResult(data, 'update employee');
    },

    async listEmployees({ trustId } = {}) {
      let query = getClient().from('operations_employees').select('*').order('employee_code', { ascending: true });
      if (trustId) query = query.eq('trust_id', trustId);
      return many(query, 'list employees');
    },

    async listSalaryStructures({ employeeId } = {}) {
      let query = getClient().from('operations_salary_structures').select('*').order('effective_from', { ascending: false }).order('structure_version', { ascending: false });
      if (employeeId) query = query.eq('employee_id', employeeId);
      return many(query, 'list salary structures');
    },

    async getSalaryStructure({ salaryStructureId }) {
      const structure = await one(getClient().from('operations_salary_structures').select('*').eq('id', salaryStructureId).maybeSingle(), 'get salary structure');
      if (!structure) return null;
      const components = await many(getClient().from('operations_salary_components').select('*').eq('salary_structure_id', salaryStructureId).order('component_code', { ascending: true }), 'get salary components');
      return { ...structure, components };
    },

    async createSalaryStructure(input) {
      const { data, error } = await getClient().from('operations_salary_structures').insert({
        trust_id: input.trustId,
        employee_id: input.employeeId,
        structure_version: input.structureVersion,
        effective_from: input.effectiveFrom,
        status: 'active',
        currency: PAYROLL_CURRENCY,
        gross_amount: input.grossAmount,
        created_by: input.actorId,
      }).select('*').single();
      if (error) databaseError(error, 'create salary structure');
      return singleResult(data, 'create salary structure');
    },

    async createSalaryComponents({ trustId, salaryStructureId, components }) {
      const rows = components.map((component) => ({
        trust_id: trustId,
        salary_structure_id: salaryStructureId,
        component_code: component.code,
        component_name: component.name,
        component_type: component.type,
        calculation_type: component.calculationType,
        amount: component.amount,
        currency: PAYROLL_CURRENCY,
        is_taxable: component.isTaxable,
        is_employer_contribution: component.isEmployerContribution,
      }));
      const { data, error } = await getClient().from('operations_salary_components').insert(rows).select('*');
      if (error) databaseError(error, 'create salary components');
      return data || [];
    },

    async retireSalaryStructures({ employeeId, effectiveTo, excludeId }) {
      let query = getClient().from('operations_salary_structures').update({ effective_to: effectiveTo, status: 'retired', updated_at: new Date().toISOString() }).eq('employee_id', employeeId).lt('effective_from', effectiveTo).is('effective_to', null);
      if (excludeId) query = query.neq('id', excludeId);
      const { error } = await query;
      if (error) databaseError(error, 'retire prior salary structures');
    },

    async findPayrollPeriod({ trustId, periodName }) {
      return one(getClient().from('operations_payroll_periods').select('*').eq('trust_id', trustId).eq('period_name', periodName).maybeSingle(), 'find payroll period');
    },

    async createPayrollPeriod(input) {
      const { data, error } = await getClient().from('operations_payroll_periods').insert({
        trust_id: input.trustId,
        period_name: input.periodName,
        financial_year: input.financialYear,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        status: 'processing',
        created_by: input.actorId,
      }).select('*').single();
      if (error) databaseError(error, 'create payroll period');
      return singleResult(data, 'create payroll period');
    },

    async findPayrollRun({ trustId, periodName, periodId }) {
      let query = getClient().from('operations_payroll_runs').select('*').eq('trust_id', trustId);
      if (periodId) query = query.eq('payroll_period_id', periodId);
      else if (periodName) {
        const period = await this.findPayrollPeriod({ trustId, periodName });
        if (!period) return null;
        query = query.eq('payroll_period_id', period.id);
      }
      return one(query.maybeSingle(), 'find payroll run');
    },

    async listPayrollRuns({ trustId } = {}) {
      let query = getClient().from('operations_payroll_runs').select('*').order('created_at', { ascending: false });
      if (trustId) query = query.eq('trust_id', trustId);
      return many(query, 'list payroll runs');
    },

    async getPayrollRun({ payrollRunId }) {
      return one(getClient().from('operations_payroll_runs').select('*').eq('id', payrollRunId).maybeSingle(), 'get payroll run');
    },

    async createPayrollRun(input) {
      const { data, error } = await getClient().from('operations_payroll_runs').insert({
        trust_id: input.trustId,
        payroll_period_id: input.payrollPeriodId,
        run_number: input.runNumber,
        status: input.status,
        currency: PAYROLL_CURRENCY,
        gross_total: input.grossTotal,
        deduction_total: input.deductionTotal,
        net_total: input.netTotal,
        created_by: input.actorId,
      }).select('*').single();
      if (error) databaseError(error, 'create payroll run');
      return singleResult(data, 'create payroll run');
    },

    async createPayrollLines({ trustId, payrollRunId, lines }) {
      const rows = lines.map((line) => ({
        trust_id: trustId,
        payroll_run_id: payrollRunId,
        employee_id: line.employeeId,
        salary_structure_id: line.salaryStructureId,
        status: 'draft',
        gross_amount: line.grossAmount,
        deduction_amount: line.deductionAmount,
        net_amount: line.netAmount,
        currency: PAYROLL_CURRENCY,
      }));
      const { data, error } = await getClient().from('operations_payroll_lines').insert(rows).select('*');
      if (error) databaseError(error, 'create payroll lines');
      return data || [];
    },

    async listPayrollLines({ payrollRunId }) {
      return many(getClient().from('operations_payroll_lines').select('*').eq('payroll_run_id', payrollRunId).order('created_at', { ascending: true }), 'list payroll lines');
    },

    async updatePayrollRun({ payrollRunId, patch }) {
      const { data, error } = await getClient().from('operations_payroll_runs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', payrollRunId).select('*').single();
      if (error) databaseError(error, 'update payroll run');
      return singleResult(data, 'update payroll run');
    },

    async updatePayrollLines({ payrollRunId, status }) {
      const { data, error } = await getClient().from('operations_payroll_lines').update({ status, updated_at: new Date().toISOString() }).eq('payroll_run_id', payrollRunId).select('*');
      if (error) databaseError(error, 'update payroll lines');
      return data || [];
    },

    async createPayrollAdjustments({ trustId, payrollRunId, adjustments, actorId }) {
      if (!adjustments.length) return [];
      const { data, error } = await getClient().from('operations_payroll_adjustments').insert(adjustments.map((adjustment) => ({
        trust_id: trustId,
        payroll_run_id: payrollRunId,
        payroll_line_id: adjustment.payrollLineId || null,
        adjustment_type: adjustment.type,
        amount: adjustment.amount,
        currency: PAYROLL_CURRENCY,
        reason: adjustment.reason,
        created_by: actorId,
      }))).select('*');
      if (error) databaseError(error, 'create payroll adjustments');
      return data || [];
    },

    async createApproval({ trustId, recordId, actorId, reason }) {
      const { data, error } = await getClient().from('operations_approval_requests').insert({
        trust_id: trustId,
        record_type: 'operations_payroll_run',
        record_id: recordId,
        status: 'pending_approval',
        requested_by: actorId,
        reason,
      }).select('*').single();
      if (error) databaseError(error, 'create payroll approval');
      return singleResult(data, 'create payroll approval');
    },

    async getApproval({ recordId }) {
      return one(getClient().from('operations_approval_requests').select('*').eq('record_type', 'operations_payroll_run').eq('record_id', recordId).order('created_at', { ascending: false }).limit(1).maybeSingle(), 'get payroll approval');
    },

    async updateApproval({ approvalId, actorId, status }) {
      const { data, error } = await getClient().from('operations_approval_requests').update({
        status,
        reviewed_by: actorId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', approvalId).select('*').single();
      if (error) databaseError(error, 'update payroll approval');
      return singleResult(data, 'update payroll approval');
    },

    async createApprovalAction({ trustId, approvalId, actorId, action, comment }) {
      const { data, error } = await getClient().from('operations_approval_actions').insert({
        trust_id: trustId,
        approval_request_id: approvalId,
        actor_id: actorId,
        action,
        comment: comment || null,
      }).select('*').single();
      if (error) databaseError(error, 'create payroll approval action');
      return singleResult(data, 'create payroll approval action');
    },

    async createPayslips({ trustId, payrollRunId, payslips }) {
      const { data, error } = await getClient().from('operations_payslips').insert(payslips.map((payslip) => ({
        trust_id: trustId,
        payroll_run_id: payrollRunId,
        payroll_line_id: payslip.payrollLineId,
        payslip_number: payslip.payslipNumber,
        status: payslip.status || 'draft',
        gross_amount: payslip.grossAmount,
        deduction_amount: payslip.deductionAmount,
        net_amount: payslip.netAmount,
        currency: PAYROLL_CURRENCY,
        issued_at: payslip.issuedAt || null,
      }))).select('*');
      if (error) databaseError(error, 'create payslips');
      return data || [];
    },

    async issuePayslips({ payrollRunId, issuedAt }) {
      const { data, error } = await getClient().from('operations_payslips').update({ status: 'issued', issued_at: issuedAt, updated_at: issuedAt }).eq('payroll_run_id', payrollRunId).select('*');
      if (error) databaseError(error, 'issue payslips');
      return data || [];
    },

    async listPayslips({ payrollRunId }) {
      return many(getClient().from('operations_payslips').select('*').eq('payroll_run_id', payrollRunId).order('payslip_number', { ascending: true }), 'list payslips');
    },

    async listPayrollPayments({ payrollRunId }) {
      return many(getClient().from('operations_payroll_payments').select('*').eq('payroll_run_id', payrollRunId).order('created_at', { ascending: true }), 'list payroll payments');
    },

    async createPayrollPayments({ trustId, payrollRunId, payments }) {
      const { data, error } = await getClient().from('operations_payroll_payments').insert(payments.map((payment) => ({
        trust_id: trustId,
        payroll_run_id: payrollRunId,
        employee_id: payment.employeeId,
        status: payment.status,
        amount: payment.amount,
        currency: PAYROLL_CURRENCY,
        payment_reference: payment.paymentReference,
        paid_at: payment.paidAt,
      }))).select('*');
      if (error) databaseError(error, 'record payroll payment');
      return data || [];
    },
  };
}

function createSupabasePayrollPostingAdapter(client) {
  const getClient = () => client || require('../config/supabaseAdmin');
  return {
    async postPayroll({ trustId, payrollRun, totalDebit, totalCredit, journalLines, actorId, fundId, now }) {
      const occurredAt = new Date(now || Date.now());
      const date = occurredAt.toISOString().slice(0, 10);
      const { data: transaction, error: transactionError } = await getClient().from('operations_transactions').insert({
        trust_id: trustId,
        transaction_type: 'debit',
        status: 'posted',
        amount: totalDebit,
        currency: PAYROLL_CURRENCY,
        transaction_date: date,
        description: `Payroll ${payrollRun.run_number || payrollRun.runNumber || payrollRun.id}`,
        source_type: 'operations_payroll',
        source_id: rowId(payrollRun, 'id', 'payrollRunId'),
        approved_by: actorId,
        posted_at: occurredAt.toISOString(),
        created_by: payrollRun.created_by || actorId,
        updated_by: actorId,
      }).select('*').single();
      if (transactionError) databaseError(transactionError, 'post payroll transaction');

      const entryNumber = `PAY-${payrollRun.run_number || payrollRun.runNumber || rowId(payrollRun, 'id', 'payrollRunId')}`;
      const { data: journal, error: journalError } = await getClient().from('operations_journal_entries').insert({
        trust_id: trustId,
        transaction_id: transaction.id,
        entry_number: entryNumber,
        entry_date: date,
        description: `Payroll ${payrollRun.run_number || payrollRun.runNumber || payrollRun.id}`,
        reference: payrollRun.run_number || payrollRun.runNumber || null,
        status: 'posted',
        currency: PAYROLL_CURRENCY,
        total_debit: totalDebit,
        total_credit: totalCredit,
        created_by: payrollRun.created_by || actorId,
        posted_by: actorId,
        posted_at: occurredAt.toISOString(),
      }).select('*').single();
      if (journalError) databaseError(journalError, 'post payroll journal');

      const { error: lineError } = await getClient().from('operations_journal_lines').insert(journalLines.map((line, index) => ({
        trust_id: trustId,
        journal_entry_id: journal.id,
        line_number: index + 1,
        account_code: line.accountCode,
        description: line.description,
        debit: line.debit,
        credit: line.credit,
        currency: PAYROLL_CURRENCY,
      })));
      if (lineError) databaseError(lineError, 'post payroll journal lines');

      let fundAllocationId = null;
      if (fundId) {
        const { data: allocation, error: allocationError } = await getClient().from('operations_fund_allocations').insert({
          trust_id: trustId,
          fund_id: fundId,
          transaction_id: transaction.id,
          allocation_type: 'payroll',
          status: 'posted',
          amount: totalDebit,
          currency: PAYROLL_CURRENCY,
          created_by: actorId,
        }).select('*').single();
        if (allocationError) databaseError(allocationError, 'link payroll fund allocation');
        fundAllocationId = allocation?.id || null;
      }
      return {
        transactionId: transaction.id,
        journalEntryId: journal.id,
        journalIds: [journal.id],
        fundAllocationId,
        totalDebit,
        totalCredit,
        balanced: true,
      };
    },
  };
}

function requestContext(actor) {
  return {
    requestId: actor?.requestId || actor?.request_id || null,
    requestIp: actor?.requestIp || actor?.request_ip || actor?.ip || null,
  };
}

function createPayrollService({ repository, postingAdapter, now = () => new Date() } = {}) {
  const adapter = repository || createSupabasePayrollRepository();
  const posting = postingAdapter || createSupabasePayrollPostingAdapter();
  const preparedRunFunds = new Map();

  async function getEmployeeOrThrow(employeeId) {
    const employee = await callAdapter(adapter, ['getEmployee'], { employeeId: ensureId(employeeId, 'employeeId') }, 'get employee');
    if (!employee) throw payrollError('Employee was not found', 'NOT_FOUND', 404);
    return employee;
  }

  async function getRunOrThrow(payrollRunId) {
    const normalizedId = ensureId(payrollRunId, 'payrollRunId');
    const run = await callAdapter(adapter, ['getPayrollRun', 'findPayrollRunById'], { payrollRunId: normalizedId }, 'get payroll run');
    if (!run) throw payrollError('Payroll run was not found', 'NOT_FOUND', 404);
    return run;
  }

  async function getSalaryStructureForPeriod(employeeId, period) {
    let structures;
    if (typeof adapter.getSalaryStructureForPeriod === 'function') {
      structures = await adapter.getSalaryStructureForPeriod({ employeeId, periodStart: period.periodStart, periodEnd: period.periodEnd });
      if (structures) return structures;
    }
    structures = await callAdapter(adapter, ['listSalaryStructures'], { employeeId }, 'list salary structures');
    const eligible = (structures || [])
      .filter((structure) => {
        const from = rowEffectiveFrom(structure);
        const to = structure.effective_to || structure.effectiveTo || null;
        return from && from <= period.periodEnd && (!to || to >= period.periodStart);
      })
      .sort((left, right) => {
        const fromOrder = String(rowEffectiveFrom(right)).localeCompare(String(rowEffectiveFrom(left)));
        if (fromOrder !== 0) return fromOrder;
        return Number(right.structure_version || right.structureVersion || 0) - Number(left.structure_version || left.structureVersion || 0);
      });
    const structure = eligible[0] || null;
    if (!structure) return null;
    if (!Array.isArray(structure.components) && typeof adapter.getSalaryStructure === 'function') {
      return adapter.getSalaryStructure({ salaryStructureId: rowId(structure, 'id', 'salaryStructureId') });
    }
    return structure;
  }

  async function createEmployee({ actor, trustId, personId, employeeCode, startDate }) {
    requireActor(actor, ['admin', 'accountant'], 'create employees');
    const normalizedTrustId = ensureId(trustId, 'trustId');
    const normalizedPersonId = ensureId(personId, 'personId');
    const normalizedCode = requiredText(employeeCode, 'employeeCode', 80).toUpperCase();
    const normalizedStartDate = normalizeDate(startDate, 'startDate');
    if (typeof adapter.findEmployeeByCode === 'function') {
      const existing = await adapter.findEmployeeByCode({ trustId: normalizedTrustId, employeeCode: normalizedCode });
      if (existing) throw payrollError('Employee code is already used in this trust', 'DUPLICATE_EMPLOYEE', 409);
    }
    if (typeof adapter.findEmployeeByPerson === 'function') {
      const existing = await adapter.findEmployeeByPerson({ trustId: normalizedTrustId, personId: normalizedPersonId });
      if (existing) throw payrollError('Person is already an active employee in this trust', 'DUPLICATE_EMPLOYEE', 409);
    }
    try {
      const employee = await callAdapter(adapter, ['createEmployee'], {
        trustId: normalizedTrustId,
        personId: normalizedPersonId,
        employeeCode: normalizedCode,
        startDate: normalizedStartDate,
        actorId: getActorId(actor),
        actor,
      }, 'create employee');
      return { ...employee, status: employee.status || 'active' };
    } catch (error) {
      databaseError(error, 'create employee');
    }
  }

  async function updateEmployee({ actor, employeeId, status, endDate, trustId }) {
    requireActor(actor, ['admin', 'accountant'], 'update employees');
    const employee = await getEmployeeOrThrow(employeeId);
    ensureTrustOwnership(employee, trustId);
    const patch = {};
    if (status !== undefined) {
      const normalizedStatus = requiredText(status, 'status', 30).toLowerCase();
      if (!['active', 'on_leave', 'inactive', 'terminated'].includes(normalizedStatus)) throw payrollError('Unsupported employee status', 'VALIDATION_ERROR');
      patch.status = normalizedStatus;
    }
    if (endDate !== undefined) {
      patch.endDate = endDate === null || endDate === '' ? null : normalizeDate(endDate, 'endDate');
      const startDate = employee.start_date || employee.startDate;
      if (patch.endDate && startDate && patch.endDate < startDate) throw payrollError('endDate must be on or after startDate', 'VALIDATION_ERROR');
    }
    if (Object.keys(patch).length === 0) throw payrollError('At least one employee field must change', 'VALIDATION_ERROR');
    const databasePatch = { ...patch, ...(patch.endDate !== undefined ? { end_date: patch.endDate } : {}) };
    delete databasePatch.endDate;
    return callAdapter(adapter, ['updateEmployee'], { employeeId: rowId(employee, 'id', 'employeeId'), patch: databasePatch, actorId: getActorId(actor) }, 'update employee');
  }

  async function saveSalaryStructure({ actor, employeeId, components, effectiveFrom, trustId }) {
    requireActor(actor, ['admin', 'accountant'], 'save salary structures');
    const employee = await getEmployeeOrThrow(employeeId);
    ensureTrustOwnership(employee, trustId);
    const normalizedEffectiveFrom = normalizeDate(effectiveFrom, 'effectiveFrom');
    const normalizedComponents = normalizeComponents(components);
    const calculated = calculatePayroll({ employeeId: rowId(employee, 'id', 'employeeId'), components: normalizedComponents });
    const existing = typeof adapter.listSalaryStructures === 'function'
      ? await adapter.listSalaryStructures({ employeeId: rowId(employee, 'id', 'employeeId') })
      : [];
    if ((existing || []).some((structure) => rowEffectiveFrom(structure) === normalizedEffectiveFrom)) {
      throw payrollError('A salary structure already exists for this effective date', 'DUPLICATE_SALARY_STRUCTURE', 409);
    }
    const version = (existing || []).reduce((max, structure) => Math.max(max, Number(structure.structure_version || structure.structureVersion || 0)), 0) + 1;
    const employeeTrustId = rowTrustId(employee);
    const structure = await callAdapter(adapter, ['createSalaryStructure'], {
      trustId: employeeTrustId,
      employeeId: rowId(employee, 'id', 'employeeId'),
      structureVersion: version,
      effectiveFrom: normalizedEffectiveFrom,
      grossAmount: calculated.gross,
      currency: PAYROLL_CURRENCY,
      actorId: getActorId(actor),
    }, 'create salary structure');
    const structureId = rowId(structure, 'id', 'salaryStructureId');
    const rows = await callAdapter(adapter, ['createSalaryComponents'], {
      trustId: employeeTrustId,
      salaryStructureId: structureId,
      components: normalizedComponents,
      actorId: getActorId(actor),
    }, 'create salary components');
    const prior = (existing || [])
      .filter((candidate) => rowEffectiveFrom(candidate) < normalizedEffectiveFrom && (!candidate.effective_to || candidate.effective_to >= normalizedEffectiveFrom))
      .sort((left, right) => String(rowEffectiveFrom(right)).localeCompare(String(rowEffectiveFrom(left))))[0];
    if (prior && typeof adapter.retireSalaryStructures === 'function') {
      await adapter.retireSalaryStructures({ employeeId: rowId(employee, 'id', 'employeeId'), effectiveTo: addDays(normalizedEffectiveFrom, -1), excludeId: structureId });
    }
    return {
      ...structure,
      structure_version: structure.structure_version || version,
      effective_from: structure.effective_from || normalizedEffectiveFrom,
      gross_amount: structure.gross_amount ?? calculated.gross,
      components: rows?.length ? rows : normalizedComponents,
      calculation: calculated,
    };
  }

  async function findExistingRun(trustId, period) {
    if (typeof adapter.findPayrollRun === 'function') {
      const direct = await adapter.findPayrollRun({ trustId, periodName: period.periodName });
      if (direct) return direct;
    }
    if (typeof adapter.listPayrollRuns === 'function') {
      const rows = await adapter.listPayrollRuns({ trustId });
      return (rows || []).find((run) => run.period_name === period.periodName || run.periodName === period.periodName) || null;
    }
    return null;
  }

  async function preparePayrollRun({ actor, trustId, period, employeeIds, fundId } = {}) {
    requireActor(actor, ['admin', 'accountant'], 'prepare payroll');
    if (typeof adapter.createApproval !== 'function') {
      throw payrollError('Payroll approval repository is required before preparation', 'APPROVAL_REQUIRED', 409);
    }
    const normalizedTrustId = ensureId(trustId, 'trustId');
    const normalizedPeriod = normalizePeriod(period, now());
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) throw payrollError('At least one employee is required', 'VALIDATION_ERROR', 400, { employeeIds: 'must contain at least one employee' });
    if (employeeIds.length > MAX_EMPLOYEES_PER_RUN) throw payrollError(`No more than ${MAX_EMPLOYEES_PER_RUN} employees can be included in one payroll run`, 'VALIDATION_ERROR');
    const normalizedEmployeeIds = employeeIds.map((employeeId) => ensureId(employeeId, 'employeeIds'));
    if (new Set(normalizedEmployeeIds).size !== normalizedEmployeeIds.length) throw payrollError('An employee cannot appear twice in one payroll period', 'DUPLICATE_EMPLOYEE_IN_PERIOD', 409);
    const existingRun = await findExistingRun(normalizedTrustId, normalizedPeriod);
    if (existingRun) throw payrollError('A payroll run already exists for this period', 'DUPLICATE_PAYROLL_PERIOD', 409);

    const prepared = [];
    for (const employeeId of normalizedEmployeeIds) {
      const employee = await getEmployeeOrThrow(employeeId);
      if (rowTrustId(employee) !== normalizedTrustId) throw payrollError('Employee does not belong to the selected trust', 'CROSS_TRUST_OPERATION', 409);
      if (!['active', 'on_leave'].includes(rowStatus(employee) || 'active')) throw payrollError(`Employee ${employeeId} is not active for payroll`, 'INVALID_EMPLOYEE_STATUS', 409);
      const startDate = employee.start_date || employee.startDate;
      if (startDate > normalizedPeriod.periodEnd) throw payrollError(`Employee ${employeeId} starts after the payroll period`, 'INVALID_EMPLOYEE_STATUS', 409);
      const structure = await getSalaryStructureForPeriod(employeeId, normalizedPeriod);
      if (!structure) throw payrollError(`No salary structure is effective for employee ${employeeId}`, 'MISSING_SALARY_STRUCTURE', 409);
      const structureComponents = structure.components || structure.salary_components;
      const calculation = calculatePayroll({ employeeId, salaryStructureId: rowId(structure, 'id', 'salaryStructureId'), components: structureComponents });
      prepared.push({ employee, structure, calculation });
    }

    let payrollPeriod = typeof adapter.findPayrollPeriod === 'function'
      ? await adapter.findPayrollPeriod({ trustId: normalizedTrustId, periodName: normalizedPeriod.periodName })
      : null;
    if (!payrollPeriod) {
      payrollPeriod = await callAdapter(adapter, ['createPayrollPeriod'], {
        ...normalizedPeriod,
        trustId: normalizedTrustId,
        actorId: getActorId(actor),
      }, 'create payroll period');
    }
    const grossTotal = prepared.reduce((total, row) => total + row.calculation.gross, 0);
    const deductionTotal = prepared.reduce((total, row) => total + row.calculation.deductions, 0);
    const netTotal = prepared.reduce((total, row) => total + row.calculation.net, 0);
    const runNumber = `PAY-${normalizedPeriod.financialYear}-${normalizedPeriod.periodName.slice(5)}-${String(Date.now()).slice(-6)}`;
    const run = await callAdapter(adapter, ['createPayrollRun'], {
      trustId: normalizedTrustId,
      payrollPeriodId: rowId(payrollPeriod, 'id', 'payrollPeriodId'),
      runNumber,
      status: 'pending_approval',
      grossTotal: roundAmount(grossTotal),
      deductionTotal: roundAmount(deductionTotal),
      netTotal: roundAmount(netTotal),
      fundId: fundId || null,
      actorId: getActorId(actor),
    }, 'create payroll run');
    const payrollRunId = rowId(run, 'id', 'payrollRunId');
    if (fundId) preparedRunFunds.set(payrollRunId, fundId);
    const lineInputs = prepared.map(({ structure, calculation }) => ({
      employeeId: calculation.employeeId,
      salaryStructureId: rowId(structure, 'id', 'salaryStructureId'),
      grossAmount: calculation.gross,
      deductionAmount: calculation.deductions,
      netAmount: calculation.net,
      calculation,
    }));
    const storedLines = await callAdapter(adapter, ['createPayrollLines'], { trustId: normalizedTrustId, payrollRunId, lines: lineInputs, actorId: getActorId(actor) }, 'create payroll lines');
    const lineRows = (storedLines || []).map((line, index) => ({ ...line, ...lineInputs[index], id: rowId(line, 'id', 'payrollLineId') || lineInputs[index].employeeId }));
    if (typeof adapter.createPayrollAdjustments === 'function') {
      const adjustments = [];
      lineRows.forEach((line) => {
        for (const component of line.calculation.components.filter((item) => isDeduction({ type: item.type, code: item.code }))) {
          adjustments.push({
            payrollLineId: rowId(line, 'id', 'payrollLineId'),
            type: ['pf', 'esi', 'professional_tax'].includes(component.type)
              ? 'deduction'
              : component.type === 'tax' ? 'tax' : component.type === 'deduction' ? 'deduction' : component.type,
            amount: component.amount,
            reason: `${component.name} configured payroll deduction`,
          });
        }
      });
      await adapter.createPayrollAdjustments({ trustId: normalizedTrustId, payrollRunId, adjustments, actorId: getActorId(actor) });
    }
    const approval = await adapter.createApproval({ trustId: normalizedTrustId, recordId: payrollRunId, actorId: getActorId(actor), reason: 'Payroll requires Admin approval before posting' });
    if (approval && typeof adapter.createApprovalAction === 'function') {
      await adapter.createApprovalAction({ trustId: normalizedTrustId, approvalId: rowId(approval, 'id', 'approvalId'), actorId: getActorId(actor), action: 'submit', comment: 'Payroll submitted for Admin approval' });
    }
    return {
      ...run,
      id: payrollRunId,
      status: 'pending_approval',
      trust_id: normalizedTrustId,
      payroll_period: payrollPeriod,
      period: normalizedPeriod,
      gross_total: roundAmount(grossTotal),
      deduction_total: roundAmount(deductionTotal),
      net_total: roundAmount(netTotal),
      lines: lineRows,
      calculations: prepared.map((row) => row.calculation),
      approval,
      fundId: fundId || null,
      currency: PAYROLL_CURRENCY,
      timezone: PAYROLL_TIMEZONE,
    };
  }

  async function approvePayrollRun({ actor, payrollRunId, trustId } = {}) {
    requireActor(actor, ['admin'], 'approve and post payroll');
    const run = await getRunOrThrow(payrollRunId);
    ensureTrustOwnership(run, trustId);
    const status = rowStatus(run);
    if (status !== 'pending_approval') throw payrollError('Only payroll runs pending Admin approval can be posted', 'INVALID_STATE', 409);
    const runTrustId = rowTrustId(run);
    if (typeof adapter.getApproval !== 'function') {
      throw payrollError('Payroll approval repository is required before posting', 'APPROVAL_REQUIRED', 409);
    }
    const approval = await adapter.getApproval({ recordId: rowId(run, 'id', 'payrollRunId') });
    if (!approval || rowStatus(approval) !== 'pending_approval') {
      throw payrollError('Payroll approval was not found or is no longer pending', 'INVALID_STATE', 409);
    }
    const lines = await callAdapter(adapter, ['listPayrollLines'], { payrollRunId: rowId(run, 'id', 'payrollRunId') }, 'list payroll lines');
    if (!lines || lines.length === 0) throw payrollError('Payroll run has no lines to post', 'INVALID_STATE', 409);
    const lineCalculations = [];
    for (const line of lines) {
      let calculation = line.calculation || line.calculation_data || null;
      if (!calculation && typeof adapter.getSalaryStructure === 'function') {
        const structure = await adapter.getSalaryStructure({ salaryStructureId: line.salary_structure_id || line.salaryStructureId });
        if (structure?.components) calculation = calculatePayroll({
          employeeId: rowEmployeeId(line),
          salaryStructureId: rowId(structure, 'id', 'salaryStructureId'),
          components: structure.components,
        });
      }
      lineCalculations.push(calculation);
    }
    if (lineCalculations.some((calculation) => !calculation)) throw payrollError('Payroll line calculation data is missing', 'INVALID_STATE', 409);
    const totalDebit = roundAmount(lineCalculations.reduce((total, line) => total + line.gross + line.employerContributions, 0));
    const totalCredit = roundAmount(lineCalculations.reduce((total, line) => total + line.net + line.deductions + line.employerContributions, 0));
    if (totalDebit !== totalCredit) throw payrollError('Payroll journal is not balanced', 'UNBALANCED_JOURNAL', 409, { totalDebit, totalCredit });
    const journalLines = [
      { accountCode: 'PAYROLL_EXPENSE', description: 'Employee salary and employer contributions', debit: totalDebit, credit: 0 },
      { accountCode: 'SALARY_PAYABLE', description: 'Net salary payable', debit: 0, credit: roundAmount(lineCalculations.reduce((total, line) => total + line.net, 0)) },
    ];
    const breakdown = { tds: 0, pf: 0, esi: 0, professionalTax: 0, other: 0, employer: 0 };
    lineCalculations.forEach((line) => {
      breakdown.tds += Number(line.tds || 0);
      breakdown.pf += Number(line.pf || 0);
      breakdown.esi += Number(line.esi || 0);
      breakdown.professionalTax += Number(line.professionalTax || 0);
      breakdown.other += Number(line.deductionBreakdown?.other || 0);
      breakdown.employer += Number(line.employerContributions || 0);
    });
    for (const [key, label] of [['tds', 'TDS_PAYABLE'], ['pf', 'PF_PAYABLE'], ['esi', 'ESI_PAYABLE'], ['professionalTax', 'PROFESSIONAL_TAX_PAYABLE'], ['other', 'OTHER_PAYROLL_DEDUCTIONS'], ['employer', 'EMPLOYER_CONTRIBUTIONS_PAYABLE']]) {
      const amount = roundAmount(breakdown[key]);
      if (amount > 0) journalLines.push({ accountCode: label, description: label.replaceAll('_', ' '), debit: 0, credit: amount });
    }
    const postingResult = await callAdapter(posting, ['postPayrollRun', 'postPayroll', 'post'], {
      actor,
      actorId: getActorId(actor),
      trustId: runTrustId,
      payrollRun: run,
      lines,
      journalLines,
      totalDebit,
      totalCredit,
      fundId: run.fund_id || run.fundId || preparedRunFunds.get(rowId(run, 'id', 'payrollRunId')) || null,
      now: now(),
      context: requestContext(actor),
    }, 'post payroll');
    if (postingResult?.balanced === false || Number(postingResult?.totalDebit ?? totalDebit) !== Number(postingResult?.totalCredit ?? totalCredit)) {
      throw payrollError('Payroll posting adapter returned an unbalanced journal', 'UNBALANCED_JOURNAL', 409);
    }
    const journalEntryId = postingResult.journalEntryId || postingResult.journal_entry_id;
    if (!journalEntryId) throw payrollError('Payroll posting adapter did not return a journal entry ID', 'ACCOUNTING_EVENT_MISSING', 502);
    const postedAt = now().toISOString();
    const updatedRun = typeof adapter.updatePayrollRun === 'function'
      ? await adapter.updatePayrollRun({ payrollRunId: rowId(run, 'id', 'payrollRunId'), patch: { status: 'posted', approved_by: getActorId(actor), posted_at: postedAt, journal_entry_id: journalEntryId } })
      : { ...run, status: 'posted' };
    if (typeof adapter.updatePayrollLines === 'function') await adapter.updatePayrollLines({ payrollRunId: rowId(run, 'id', 'payrollRunId'), status: 'posted' });
    const payslipInputs = lines.map((line, index) => ({
      payrollLineId: rowId(line, 'id', 'payrollLineId') || rowEmployeeId(line),
      payslipNumber: `PS-${run.run_number || run.runNumber || rowId(run, 'id', 'payrollRunId')}-${String(index + 1).padStart(3, '0')}`,
      grossAmount: lineCalculations[index].gross,
      deductionAmount: lineCalculations[index].deductions,
      netAmount: lineCalculations[index].net,
      status: 'draft',
    }));
    const draftPayslips = typeof adapter.createPayslips === 'function'
      ? await adapter.createPayslips({ trustId: runTrustId, payrollRunId: rowId(run, 'id', 'payrollRunId'), payslips: payslipInputs, actorId: getActorId(actor) })
      : payslipInputs;
    const issuedPayslips = typeof adapter.issuePayslips === 'function'
      ? await adapter.issuePayslips({ payrollRunId: rowId(run, 'id', 'payrollRunId'), issuedAt: postedAt })
      : draftPayslips.map((payslip) => ({ ...payslip, status: 'issued', issued_at: postedAt }));
    if (approval) {
      if (typeof adapter.updateApproval === 'function') await adapter.updateApproval({ approvalId: rowId(approval, 'id', 'approvalId'), actorId: getActorId(actor), status: 'approved' });
      if (typeof adapter.createApprovalAction === 'function') await adapter.createApprovalAction({ trustId: runTrustId, approvalId: rowId(approval, 'id', 'approvalId'), actorId: getActorId(actor), action: 'approve', comment: 'Payroll approved and posted' });
    }
    return {
      payrollRunId: rowId(run, 'id', 'payrollRunId'),
      status: 'posted',
      journalEntryId,
      journalIds: postingResult.journalIds || [journalEntryId],
      transactionId: postingResult.transactionId || postingResult.transaction_id || null,
      fundAllocationId: postingResult.fundAllocationId || postingResult.fund_allocation_id || null,
      payslipIds: (issuedPayslips || draftPayslips || []).map((payslip) => rowId(payslip, 'id', 'payslipId')).filter(Boolean),
      payslips: issuedPayslips || draftPayslips,
      journal: { totalDebit, totalCredit, balanced: true, lines: journalLines },
      run: updatedRun,
    };
  }

  async function recordPayrollPayment({ actor, payrollRunId, paymentReference, trustId } = {}) {
    requireActor(actor, ['admin', 'accountant'], 'record payroll payments');
    const run = await getRunOrThrow(payrollRunId);
    ensureTrustOwnership(run, trustId);
    if (rowStatus(run) !== 'posted') throw payrollError('Payroll must be posted before payment can be recorded', 'INVALID_STATE', 409);
    const reference = requiredText(paymentReference, 'paymentReference', 200);
    const id = rowId(run, 'id', 'payrollRunId');
    const existing = typeof adapter.listPayrollPayments === 'function' ? await adapter.listPayrollPayments({ payrollRunId: id }) : [];
    const completed = (existing || []).filter((payment) => rowStatus(payment) === 'completed');
    if (completed.length > 0) {
      if (completed.every((payment) => (payment.payment_reference || payment.paymentReference) === reference)) {
        return { payrollRunId: id, status: rowStatus(run), paymentStatus: 'completed', paymentReference: reference, paymentIds: completed.map((payment) => rowId(payment, 'id', 'paymentId')) };
      }
      throw payrollError('Payroll payment has already been recorded', 'PAYMENT_ALREADY_RECORDED', 409);
    }
    const lines = await callAdapter(adapter, ['listPayrollLines'], { payrollRunId: id }, 'list payroll lines');
    const paidAt = now().toISOString();
    const paymentRows = lines.filter((line) => Number(line.net_amount ?? line.netAmount ?? 0) > 0).map((line) => ({
      employeeId: rowEmployeeId(line),
      amount: roundAmount(line.net_amount ?? line.netAmount),
      status: 'completed',
      paymentReference: reference,
      paidAt,
    }));
    if (!paymentRows.length) throw payrollError('Payroll has no positive net payments', 'INVALID_STATE', 409);
    const payments = await callAdapter(adapter, ['createPayrollPayments'], { trustId: rowTrustId(run), payrollRunId: id, payments: paymentRows, actorId: getActorId(actor) }, 'record payroll payment');
    return {
      payrollRunId: id,
      status: rowStatus(run),
      paymentStatus: 'completed',
      paymentReference: reference,
      amount: roundAmount(paymentRows.reduce((total, payment) => total + payment.amount, 0)),
      paymentIds: (payments || []).map((payment) => rowId(payment, 'id', 'paymentId')).filter(Boolean),
      payments,
      paidAt,
    };
  }

  async function listEmployees({ actor, trustId } = {}) {
    requireActor(actor, ['admin', 'accountant', 'viewer'], 'read employees');
    const rows = await callAdapter(adapter, ['listEmployees'], { trustId: trustId || null }, 'list employees');
    return (rows || []).map(safeEmployee);
  }

  async function listPayrollRuns({ actor, trustId } = {}) {
    requireActor(actor, ['admin', 'accountant', 'viewer'], 'read payroll runs');
    const runs = await callAdapter(adapter, ['listPayrollRuns'], { trustId: trustId || null }, 'list payroll runs');
    if (typeof adapter.listPayrollPayments !== 'function') return runs;
    return Promise.all((runs || []).map(async (run) => {
      const payments = await adapter.listPayrollPayments({ payrollRunId: rowId(run, 'id', 'payrollRunId') });
      const paymentStatus = (payments || []).some((payment) => rowStatus(payment) === 'completed')
        ? 'completed'
        : (payments || []).some((payment) => ['processing', 'pending'].includes(rowStatus(payment)))
          ? 'pending'
          : 'not_recorded';
      return { ...run, paymentStatus, payment_status: paymentStatus };
    }));
  }

  async function listPayslips({ actor, payrollRunId, trustId } = {}) {
    requireActor(actor, ['admin', 'accountant', 'viewer'], 'read payslips');
    const run = await getRunOrThrow(payrollRunId);
    ensureTrustOwnership(run, trustId);
    return callAdapter(adapter, ['listPayslips'], { payrollRunId: rowId(run, 'id', 'payrollRunId') }, 'list payslips');
  }

  return {
    createEmployee,
    updateEmployee,
    saveSalaryStructure,
    preparePayrollRun,
    approvePayrollRun,
    recordPayrollPayment,
    listEmployees,
    listPayrollRuns,
    listPayslips,
  };
}

let defaultService;
function getDefaultService() {
  if (!defaultService) defaultService = createPayrollService();
  return defaultService;
}

module.exports = {
  PAYROLL_CURRENCY,
  PAYROLL_TIMEZONE,
  FINANCIAL_YEAR_START_MONTH,
  COMPONENT_TYPES,
  normalizePeriod,
  normalizeComponents,
  calculatePayroll,
  calculatePayrollLine: calculatePayroll,
  createPayrollService,
  createSupabasePayrollRepository,
  createSupabasePayrollPostingAdapter,
  createEmployee: (input) => getDefaultService().createEmployee(input),
  saveSalaryStructure: (input) => getDefaultService().saveSalaryStructure(input),
  preparePayrollRun: (input) => getDefaultService().preparePayrollRun(input),
  approvePayrollRun: (input) => getDefaultService().approvePayrollRun(input),
  recordPayrollPayment: (input) => getDefaultService().recordPayrollPayment(input),
};
