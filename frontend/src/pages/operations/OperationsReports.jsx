import { useCallback, useEffect, useState } from "react";
import { AlertCircle, BarChart3, RefreshCw } from "lucide-react";
import OperationsLayout from "../../components/operations/OperationsLayout";
import StatusBadge from "../../components/operations/StatusBadge";
import operationsApi, { humanizeStatus, requestErrorMessage } from "../../lib/operationsApi";
import { useOperations } from "../../lib/OperationsContext";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron-300 focus-visible:ring-offset-2";

const initialFilters = {
  from: "",
  to: "",
  financialYear: "",
  fundId: "",
  type: "",
  status: "",
  paymentMode: "",
  purpose: "",
  payrollPeriod: "",
  invoiceStatus: "",
};

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN", { dateStyle: "medium" });
}

function Field({ label, children, className = "min-w-40" }) {
  return <label className={`flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500 ${className}`}>{label}{children}</label>;
}

function Input({ className = "", ...props }) {
  return <input {...props} className={`rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-stone-800 ${focusRing} ${className}`} />;
}

function Select({ children, ...props }) {
  return <select {...props} className={`rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-stone-800 ${focusRing}`}>{children}</select>;
}

function SummaryCard({ label, value, tone = "text-stone-900" }) {
  return <div className="rounded-xl border border-stone-100 bg-stone-50/70 p-4"><div className="text-xs font-semibold uppercase tracking-wider text-stone-400">{label}</div><div className={`mt-2 text-xl font-bold ${tone}`}>{value}</div></div>;
}

export default function OperationsReports() {
  const { selectedTrustId } = useOperations();
  const [filters, setFilters] = useState(initialFilters);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await operationsApi.getOperationsReport({ trustId: selectedTrustId, ...filters }));
    } catch (requestError) {
      setReport(null);
      setError(requestErrorMessage(requestError, "Unable to load the Operations report"));
    } finally {
      setLoading(false);
    }
  }, [filters, selectedTrustId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function refresh() {
    setRefreshing(true);
    loadReport().finally(() => setRefreshing(false));
  }

  const rows = report?.rows || [];
  const totals = report?.totals || {};

  return (
    <OperationsLayout
      title="Operations reports"
      description="Read posted journal activity across one trust or all trusts without mixing trust identity or counting a source twice."
      actions={(
        <button type="button" onClick={refresh} className={`inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 ${focusRing}`} aria-label="Refresh Operations report">
          <RefreshCw size={16} className={refreshing ? "motion-safe:animate-spin" : ""} aria-hidden="true" />
          Refresh
        </button>
      )}
    >
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" aria-label="Operations report filters">
        <div className="mb-4 flex items-center gap-2"><BarChart3 size={18} className="text-royal-600" aria-hidden="true" /><h2 className="font-semibold text-stone-900">Filter the posted ledger</h2></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From"><Input type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} /></Field>
          <Field label="To"><Input type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} /></Field>
          <Field label="Financial year"><Input placeholder="2026-27" value={filters.financialYear} onChange={(event) => updateFilter("financialYear", event.target.value)} /></Field>
          <Field label="Fund"><Input placeholder="Fund ID" value={filters.fundId} onChange={(event) => updateFilter("fundId", event.target.value)} /></Field>
          <Field label="Record type"><Select value={filters.type} onChange={(event) => updateFilter("type", event.target.value)}><option value="">All types</option><option value="credit">Credit</option><option value="debit">Debit</option><option value="donation">Donation</option><option value="invoice">Invoice</option><option value="payroll">Payroll</option><option value="reversal">Reversal</option></Select></Field>
          <Field label="Status"><Select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="">All statuses</option><option value="posted">Posted</option><option value="verified">Verified</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="overdue">Overdue</option></Select></Field>
          <Field label="Payment mode"><Select value={filters.paymentMode} onChange={(event) => updateFilter("paymentMode", event.target.value)}><option value="">All payment modes</option><option value="digital">Digital</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="other">Other</option></Select></Field>
          <Field label="Donation purpose"><Input placeholder="Search purpose" value={filters.purpose} onChange={(event) => updateFilter("purpose", event.target.value)} /></Field>
          <Field label="Payroll period"><Input placeholder="October 2026" value={filters.payrollPeriod} onChange={(event) => updateFilter("payrollPeriod", event.target.value)} /></Field>
          <Field label="Invoice status"><Select value={filters.invoiceStatus} onChange={(event) => updateFilter("invoiceStatus", event.target.value)}><option value="">All invoice states</option><option value="sent">Sent</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="cancelled">Cancelled</option></Select></Field>
          <div className="flex items-end"><button type="button" onClick={() => setFilters(initialFilters)} className={`rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-50 ${focusRing}`}>Clear filters</button></div>
        </div>
      </section>

      {loading && <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500" role="status">Loading posted report…</div>}
      {error && <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert"><AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</div>}

      {!loading && !error && report && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard label="Rows" value={totals.count || 0} />
            <SummaryCard label="Credits" value={formatMoney(totals.credits)} tone="text-emerald-700" />
            <SummaryCard label="Debits" value={formatMoney(totals.debits)} tone="text-rose-700" />
            <SummaryCard label="Net" value={formatMoney(totals.net)} tone={Number(totals.net || 0) >= 0 ? "text-royal-700" : "text-rose-700"} />
          </div>

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center"><BarChart3 size={32} className="mx-auto text-stone-300" aria-hidden="true" /><h2 className="mt-3 font-semibold text-stone-800">No posted records match these filters</h2><p className="mt-1 text-sm text-stone-500">Try a wider date range or clear one of the source filters.</p></div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <caption className="sr-only">Operations posted journal report</caption>
                  <thead className="border-b border-stone-100 bg-stone-50/70 text-xs uppercase tracking-wider text-stone-400"><tr><th scope="col" className="px-5 py-3 font-semibold">Trust</th><th scope="col" className="px-5 py-3 font-semibold">Record</th><th scope="col" className="px-5 py-3 font-semibold">Date</th><th scope="col" className="px-5 py-3 font-semibold">Status</th><th scope="col" className="px-5 py-3 font-semibold">Fund</th><th scope="col" className="px-5 py-3 font-semibold">Filters</th><th scope="col" className="px-5 py-3 text-right font-semibold">Amount</th></tr></thead>
                  <tbody>{rows.map((row) => <tr key={`${row.trust_id}-${row.id}`} className="border-b border-stone-50 align-top last:border-b-0 hover:bg-stone-50/60">
                    <td className="px-5 py-4"><div className="font-semibold text-stone-800">{row.trust_name}</div><div className="mt-1 text-xs text-stone-400">{row.trust_id}</div></td>
                    <td className="px-5 py-4"><div className="font-semibold capitalize text-stone-800">{humanizeStatus(row.record_type)}</div><div className="mt-1 max-w-xs truncate text-xs text-stone-500" title={row.description || row.record_id}>{row.description || row.record_id || "—"}</div></td>
                    <td className="px-5 py-4 text-stone-600">{formatDate(row.date)}</td>
                    <td className="px-5 py-4"><StatusBadge status={row.source_status || row.status} /></td>
                    <td className="px-5 py-4 text-stone-600">{row.fund_ids?.length ? row.fund_ids.join(", ") : "Unallocated"}</td>
                    <td className="px-5 py-4 text-xs text-stone-500"><div>{row.payment_mode || "No payment mode"}</div><div className="mt-1">{row.purpose || row.payroll_period || row.invoice_status || "—"}</div></td>
                    <td className={`px-5 py-4 text-right font-semibold ${row.credit ? "text-emerald-700" : "text-rose-700"}`}>{formatMoney(row.credit || row.debit)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </OperationsLayout>
  );
}
