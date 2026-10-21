import { isOperationsEnabled } from "./operationsFlags.js";

export const ALL_TRUSTS_ID = "all";

const roleCapabilities = Object.freeze({
  admin: Object.freeze({ canRead: true, canCreate: true, canSubmit: true, canApprove: true, canReject: true, canRetry: true, canManage: true }),
  accountant: Object.freeze({ canRead: true, canCreate: true, canSubmit: true, canApprove: false, canReject: false, canRetry: true, canManage: false }),
  viewer: Object.freeze({ canRead: true, canCreate: false, canSubmit: false, canApprove: false, canReject: false, canRetry: false, canManage: false }),
});

let apiPromise;

function getApi() {
  if (!apiPromise) apiPromise = import("./api").then((module) => module.default);
  return apiPromise;
}

export function getRoleCapabilities(role) {
  return roleCapabilities[role] || roleCapabilities.viewer;
}

export function getTrustOptions(trusts = [], allowAll = true) {
  const options = (Array.isArray(trusts) ? trusts : [])
    .filter((trust) => trust?.id && trust?.name)
    .map((trust) => ({ value: trust.id, label: trust.name }));
  return allowAll ? [{ value: ALL_TRUSTS_ID, label: "All trusts (read-only)" }, ...options] : options;
}

export function humanizeStatus(status) {
  return String(status || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function isConcreteTrust(trustId) {
  return typeof trustId === "string" && trustId.trim() !== "" && trustId !== ALL_TRUSTS_ID;
}

export function requireConcreteTrust(trustId) {
  if (!isConcreteTrust(trustId)) {
    const error = new Error("Select a concrete trust before making changes");
    error.code = "CONCRETE_TRUST_REQUIRED";
    throw error;
  }
  return trustId;
}

export function canRetryInTrustContext(role, trustId) {
  return getRoleCapabilities(role).canRetry && isConcreteTrust(trustId);
}

function resultOf(response) {
  return response?.data?.result;
}

function listOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.rows)) return value.rows;
  return [];
}

function isInDateRange(row, fields, from, to) {
  const value = fields.map((field) => row?.[field]).find(Boolean);
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return true;
  if (from) {
    const fromTimestamp = new Date(`${from}T00:00:00`).getTime();
    if (!Number.isNaN(fromTimestamp) && timestamp < fromTimestamp) return false;
  }
  if (to) {
    const toTimestamp = new Date(`${to}T23:59:59.999`).getTime();
    if (!Number.isNaN(toTimestamp) && timestamp > toTimestamp) return false;
  }
  return true;
}

function filterByDateRange(rows, fields, from, to) {
  if (!from && !to) return rows;
  return rows.filter((row) => isInDateRange(row, fields, from, to));
}

function trustParams(trustId, extra = {}) {
  return isConcreteTrust(trustId) ? { ...extra, trust_id: trustId } : extra;
}

function getList(path, params) {
  return getApi().then((client) => client.get(path, { params })).then((response) => listOf(resultOf(response)));
}

function getResult(path, params) {
  return getApi().then((client) => client.get(path, { params })).then(resultOf);
}

function requestErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function reportParams({ trustId, from, to, fundId, type, status, paymentMode, purpose, payrollPeriod, invoiceStatus, financialYear } = {}) {
  return trustParams(trustId, {
    from,
    to,
    fund_id: fundId,
    type,
    status,
    payment_mode: paymentMode,
    purpose,
    payroll_period: payrollPeriod,
    invoice_status: invoiceStatus,
    financial_year: financialYear,
  });
}

async function getOperationsReport({ trustId, ...filters } = {}) {
  const path = isConcreteTrust(trustId)
    ? "/v2/operations/reports"
    : "/v2/operations/reports/consolidated";
  return getResult(path, reportParams({ trustId, ...filters }));
}

async function getConsolidatedOperationsReport({ from, to, filters = {}, trustId } = {}) {
  return getResult("/v2/operations/reports/consolidated", reportParams({
    trustId: trustId || filters.trustId || filters.trust_id,
    from,
    to,
    ...filters,
  }));
}

async function getOperationsAudit({ trustId, entityType, entityId, actorId, from, to, limit } = {}) {
  return getList("/v2/operations/audit", trustParams(trustId, {
    entity_type: entityType,
    entity_id: entityId,
    actor_id: actorId,
    from,
    to,
    limit,
  }));
}

async function getDeliveryHealth({ trustId, status, from, to, limit } = {}) {
  return getResult("/v2/operations/audit/delivery-health", trustParams(trustId, {
    status,
    from,
    to,
    limit,
  }));
}

async function getSummary({ trustId, from, to } = {}) {
  const range = { from, to };
  const requests = [
    ["report", isOperationsEnabled("trusts") ? () => getOperationsReport({ trustId, from, to }) : null],
    ["donations", isOperationsEnabled("donationsAutomation") ? () => getList("/v2/operations/donations", trustParams(trustId, range)) : null],
    ["funds", isOperationsEnabled("funds") ? () => getList("/v2/operations/funds", trustParams(trustId, range)) : null],
    ["approvals", isOperationsEnabled("approvals") ? () => getList("/v2/operations/approvals", trustParams(trustId, { ...range, status: undefined })) : null],
    ["invoices", isOperationsEnabled("invoices") ? () => getList("/v2/operations/invoices", trustParams(trustId, range)) : null],
    ["payroll", isOperationsEnabled("payroll") ? () => getList("/v2/operations/payroll/runs", trustParams(trustId, range)) : null],
    ["automation", isOperationsEnabled("automationMonitor") ? () => getList("/v2/operations/automation/events", trustParams(trustId, range)) : null],
    ["deliveryHealth", isOperationsEnabled("automationMonitor") ? () => getDeliveryHealth({ trustId, from, to }) : null],
    ["audit", isOperationsEnabled("automationMonitor") ? () => getList("/v2/operations/audit", trustParams(trustId, { ...range, limit: 10 })) : null],
  ].filter(([, request]) => request);

  const settled = await Promise.allSettled(requests.map(([, request]) => request()));
  const data = {};
  const errors = {};
  settled.forEach((result, index) => {
    const [name] = requests[index];
    if (result.status === "fulfilled") data[name] = result.value;
    else errors[name] = requestErrorMessage(result.reason, `Unable to load ${name}`);
  });

  const donations = filterByDateRange(data.donations || [], ["donation_date", "donationDate", "created_at"], from, to);
  const funds = data.funds || [];
  const approvals = filterByDateRange(data.approvals || [], ["requested_at", "requestedAt", "created_at"], from, to);
  const invoices = filterByDateRange(data.invoices || [], ["issue_date", "issueDate", "created_at"], from, to);
  const payroll = filterByDateRange(data.payroll || [], ["created_at", "createdAt"], from, to);
  const automation = filterByDateRange(data.automation || [], ["created_at", "createdAt"], from, to);
  const auditActivity = filterByDateRange(data.audit || [], ["created_at", "createdAt"], from, to);
  const reportTotals = data.report?.totals || {};
  const postedDonations = donations.filter((donation) => !["rejected", "cancelled"].includes(donation.status));
  const donationTotal = postedDonations.reduce((sum, donation) => sum + Number(donation.amount || 0), 0);
  const fundTotals = funds.reduce((totals, fund) => {
    const summary = fund.summary || {};
    return {
      received: totals.received + Number(summary.received || 0),
      spent: totals.spent + Number(summary.spent || 0),
      available: totals.available + Number(summary.available || 0),
    };
  }, { received: 0, spent: 0, available: 0 });
  const credits = data.report ? Number(reportTotals.credits || 0) : (fundTotals.received || donationTotal);
  const debits = data.report ? Number(reportTotals.debits || 0) : fundTotals.spent;
  const unpaidInvoices = invoices.filter((invoice) => !["paid", "cancelled"].includes(invoice.status));
  const outstandingInvoices = unpaidInvoices.reduce((sum, invoice) => (
    sum + Math.max(0, Number(invoice.total_amount || invoice.totalAmount || 0) - Number(invoice.paid_amount || invoice.paidAmount || 0))
  ), 0);
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending_approval");
  const pendingPayroll = payroll.filter((run) => ["draft", "pending_approval", "processing"].includes(run.status));
  const healthCounts = data.deliveryHealth?.counts || {};
  const failedDeliveries = data.deliveryHealth
    ? (Number(healthCounts.deliveries?.failed || 0) + Number(healthCounts.automation_events?.failed || 0))
    : automation.filter((event) => event.status === "failed").length;

  return {
    credits,
    debits,
    balance: data.report ? Number(reportTotals.net || 0) : (fundTotals.available || credits - debits),
    donations: { count: donations.length, total: donationTotal, rows: donations },
    funds: { count: funds.length, received: fundTotals.received, spent: fundTotals.spent, available: fundTotals.available, rows: funds },
    approvals: { count: pendingApprovals.length, rows: approvals },
    payroll: { pending: pendingPayroll.length, count: payroll.length, latestStatus: payroll[0]?.status || null, rows: payroll },
    invoices: { unpaidCount: unpaidInvoices.length, outstanding: outstandingInvoices, rows: invoices },
    deliveries: {
      failed: failedDeliveries,
      retryable: Number(healthCounts.retryable || 0),
      available: Boolean(data.deliveryHealth || data.automation),
      rows: data.deliveryHealth?.deliveries || automation,
    },
    auditActivity,
    report: data.report || null,
    deliveryHealth: data.deliveryHealth || null,
    availability: Object.fromEntries(Object.keys(errors).map((name) => [name, false])),
    errors,
  };
}

const operationsApi = {
  getTrusts({ trustId } = {}) {
    return getApi().then((client) => client.get("/v2/operations/trusts", { params: trustParams(trustId) })).then(resultOf);
  },
  createTrust(payload) {
    return getApi().then((client) => client.post("/v2/operations/trusts", payload)).then(resultOf);
  },
  updateTrust(id, payload) {
    requireConcreteTrust(id);
    return getApi().then((client) => client.patch(`/v2/operations/trusts/${id}`, payload, { params: { trust_id: id } })).then(resultOf);
  },
  getSummary,
  getOperationsReport,
  getConsolidatedOperationsReport,
  getOperationsAudit,
  getDeliveryHealth,
  getDonations({ trustId, status, from, to, limit, offset } = {}) {
    return getList("/v2/operations/donations", trustParams(trustId, { status, from, to, limit, offset }));
  },
  getFunds({ trustId } = {}) {
    return getList("/v2/operations/funds", trustParams(trustId));
  },
  getInvoices({ trustId, status, from, to, limit, offset } = {}) {
    return getList("/v2/operations/invoices", trustParams(trustId, { status, from, to, limit, offset }));
  },
  getPayrollRuns({ trustId } = {}) {
    return getList("/v2/operations/payroll/runs", trustParams(trustId));
  },
  getApprovals({ trustId, status } = {}) {
    return getList("/v2/operations/approvals", trustParams(trustId, { status }));
  },
  submitApproval(id, trustId) {
    requireConcreteTrust(trustId);
    return getApi().then((client) => client.post(`/v2/operations/approvals/${id}/submit`, { trust_id: trustId }, { params: { trust_id: trustId } })).then(resultOf);
  },
  approveApproval(id, trustId) {
    requireConcreteTrust(trustId);
    return getApi().then((client) => client.post(`/v2/operations/approvals/${id}/approve`, { trust_id: trustId }, { params: { trust_id: trustId } })).then(resultOf);
  },
  rejectApproval(id, trustId, reason) {
    requireConcreteTrust(trustId);
    return getApi().then((client) => client.post(`/v2/operations/approvals/${id}/reject`, { trust_id: trustId, reason }, { params: { trust_id: trustId } })).then(resultOf);
  },
  reverseRecord(recordId, trustId, reason) {
    requireConcreteTrust(trustId);
    return getApi().then((client) => client.post(`/v2/operations/records/${recordId}/reverse`, { trust_id: trustId, reason }, { params: { trust_id: trustId } })).then(resultOf);
  },
  getAutomationEvents({ trustId, status } = {}) {
    return getList("/v2/operations/automation/events", trustParams(trustId, { status }));
  },
  retryAutomationEvent(id, trustId) {
    requireConcreteTrust(trustId);
    return getApi().then((client) => client.post(`/v2/operations/automation/events/${id}/retry`, { trust_id: trustId }, { params: { trust_id: trustId } })).then(resultOf);
  },
};

export { requestErrorMessage };
export default operationsApi;
