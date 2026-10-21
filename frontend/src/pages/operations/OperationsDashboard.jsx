import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, BarChart3, CheckCircle2, FileWarning, Landmark, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import OperationsLayout from "../../components/operations/OperationsLayout";
import StatusBadge from "../../components/operations/StatusBadge";
import operationsApi from "../../lib/operationsApi";
import { useOperations } from "../../lib/OperationsContext";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron-300 focus-visible:ring-offset-2";

function formatMoney(value) {
  if (value === null || value === undefined) return "Unavailable";
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

function MetricCard({ label, value, supporting, icon: Icon, tone = "text-stone-900" }) {
  return (
    <article className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-stone-400">{label}</div>
        {Icon && <Icon size={18} className="text-royal-400" aria-hidden="true" />}
      </div>
      <div className={`mt-3 text-2xl font-bold ${tone}`}>{value}</div>
      {supporting && <div className="mt-1 text-xs text-stone-500">{supporting}</div>}
    </article>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-stone-900">{title}</h2>
          {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ message }) {
  return <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50/60 p-5 text-sm text-stone-500">{message}</p>;
}

export default function OperationsDashboard() {
  const { selectedTrustId } = useOperations();
  const [summary, setSummary] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await operationsApi.getSummary({ trustId: selectedTrustId, from, to }));
    } catch (requestError) {
      setSummary(null);
      setError(requestError.response?.data?.message || "Unable to load the Operations dashboard");
    } finally {
      setLoading(false);
    }
  }, [from, selectedTrustId, to]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  function refresh() {
    setRefreshing(true);
    loadSummary().finally(() => setRefreshing(false));
  }

  const partialErrors = summary?.errors ? Object.entries(summary.errors) : [];

  return (
    <OperationsLayout
      title="Operations dashboard"
      description="A trust-scoped view of money movement, approvals, delivery health, and operational activity."
      actions={(
        <>
          <Link to="/operations/reports" className={`inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 ${focusRing}`}>
            <BarChart3 size={16} aria-hidden="true" />
            Reports
          </Link>
          <Link to="/operations/audit" className={`inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 ${focusRing}`}>
            Audit & health
          </Link>
          <button type="button" onClick={refresh} className={`inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 ${focusRing}`} aria-label="Refresh Operations dashboard">
            <RefreshCw size={16} className={refreshing ? "motion-safe:animate-spin" : ""} aria-hidden="true" />
            Refresh
          </button>
        </>
      )}
    >
      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm" aria-label="Dashboard date range">
        <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`rounded-xl border border-stone-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-stone-800 ${focusRing}`} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={`rounded-xl border border-stone-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-stone-800 ${focusRing}`} />
        </label>
        <p className="pb-2 text-xs text-stone-500">Leave dates blank to use the available Operations history.</p>
      </section>

      {loading && <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500" role="status">Loading Operations totals…</div>}
      {error && <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert"><AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</div>}
      {!loading && summary && (
        <>
          {partialErrors.length > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="status">
              <FileWarning size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>Some Operations data is not available yet: {partialErrors.map(([name]) => name).join(", ")}.</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Credits" value={formatMoney(summary.credits)} supporting="Posted or verified incoming value" icon={ArrowDownLeft} tone="text-emerald-700" />
            <MetricCard label="Debits" value={formatMoney(summary.debits)} supporting="Fund spending recorded" icon={ArrowUpRight} tone="text-rose-700" />
            <MetricCard label="Balance" value={formatMoney(summary.balance)} supporting="Available fund balance where returned" icon={Landmark} tone="text-royal-700" />
            <MetricCard label="Pending approvals" value={summary.approvals.count} supporting="Records waiting for Admin review" icon={CheckCircle2} tone="text-amber-700" />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Section title="Posted report pulse" description="The same posted journal view used by Reports, grouped without duplicate journal references.">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-royal-100 bg-royal-50/50 p-4">
                <div>
                  <div className="text-2xl font-bold text-royal-800">{summary.report?.totals?.count ?? "—"}</div>
                  <div className="text-xs text-stone-500">Posted rows in this trust context</div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-semibold text-emerald-700">{formatMoney(summary.report?.totals?.credits)}</div>
                  <div className="text-xs text-stone-500">Credits · {formatMoney(summary.report?.totals?.debits)} debits</div>
                </div>
              </div>
              {summary.report?.rows?.length > 0 && (
                <div className="mt-3 space-y-2">
                  {summary.report.rows.slice(0, 3).map((row) => (
                    <div key={`${row.trust_id}-${row.id}`} className="flex items-center justify-between gap-3 border-b border-stone-100 pb-2 text-sm last:border-0 last:pb-0">
                      <div className="min-w-0"><div className="truncate font-medium text-stone-800">{row.description || row.record_type || "Posted record"}</div><div className="text-xs text-stone-500">{row.trust_name} · {row.record_type} · {formatDate(row.date)}</div></div>
                      <div className={row.credit ? "shrink-0 font-semibold text-emerald-700" : "shrink-0 font-semibold text-rose-700"}>{formatMoney(row.credit || row.debit)}</div>
                    </div>
                  ))}
                </div>
              )}
              <Link to="/operations/reports" className={`mt-4 inline-flex text-sm font-semibold text-royal-700 hover:text-royal-900 ${focusRing}`}>Open full report →</Link>
            </Section>
            <Section title="Donations" description="Verified and recorded donation activity.">
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Count" value={summary.donations.count} supporting="Donation records" />
                <MetricCard label="Total" value={formatMoney(summary.donations.total)} supporting="INR equivalent" tone="text-emerald-700" />
              </div>
            </Section>
            <Section title="Funds" description="Trust-scoped fund balances and spending.">
              <div className="grid grid-cols-3 gap-3">
                <MetricCard label="Funds" value={summary.funds.count} supporting="Configured funds" />
                <MetricCard label="Spent" value={formatMoney(summary.funds.spent)} supporting="Posted spending" tone="text-rose-700" />
                <MetricCard label="Available" value={formatMoney(summary.funds.available)} supporting="Returned by fund APIs" tone="text-royal-700" />
              </div>
            </Section>
            <Section title="Payroll" description="The latest payroll runs in this trust context.">
              {summary.payroll.count === 0 ? <EmptyState message="No payroll runs are available in this trust context." /> : (
                <div className="flex items-center justify-between gap-4 rounded-xl border border-stone-100 bg-stone-50/60 p-4">
                  <div><div className="text-2xl font-bold text-stone-900">{summary.payroll.pending}</div><div className="text-xs text-stone-500">Runs awaiting preparation, processing, or approval</div></div>
                  <StatusBadge status={summary.payroll.latestStatus || "unknown"} />
                </div>
              )}
            </Section>
            <Section title="Unpaid invoices" description="Outstanding balances excluding paid and cancelled invoices.">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-stone-100 bg-stone-50/60 p-4">
                <div><div className="text-2xl font-bold text-stone-900">{summary.invoices.unpaidCount}</div><div className="text-xs text-stone-500">Invoices with a remaining balance</div></div>
                <div className="text-right"><div className="font-semibold text-rose-700">{formatMoney(summary.invoices.outstanding)}</div><div className="text-xs text-stone-500">Outstanding</div></div>
              </div>
            </Section>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Section title="Failed deliveries" description="Document and outbox events that need attention.">
              {!summary.deliveries.available ? <EmptyState message="Delivery monitoring is not available from the current Operations API." /> : summary.deliveries.failed === 0 ? <EmptyState message="No failed deliveries in this trust context." /> : (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800"><div className="flex items-center gap-3"><FileWarning size={20} aria-hidden="true" /><span className="font-semibold">{summary.deliveries.failed} failed delivery event{summary.deliveries.failed === 1 ? "" : "s"}</span></div><Link to="/operations/audit" className={`text-sm font-semibold underline underline-offset-2 ${focusRing}`}>Review</Link></div>
              )}
              {summary.deliveries.available && summary.deliveries.retryable > 0 && <p className="mt-3 text-xs text-amber-700">{summary.deliveries.retryable} event{summary.deliveries.retryable === 1 ? " is" : "s are"} retryable.</p>}
            </Section>
            <Section title="Recent audit activity" description="The latest append-only activity returned by the Operations API.">
              {summary.auditActivity.length === 0 ? <EmptyState message="No audit activity is available for this trust context yet." /> : (
                <div className="space-y-2">
                  {summary.auditActivity.slice(0, 5).map((event) => (
                    <div key={event.id || `${event.created_at}-${event.action}`} className="flex items-center justify-between gap-4 rounded-xl border border-stone-100 px-3 py-2.5">
                      <div><div className="text-sm font-medium text-stone-800">{event.action || event.event_type || "Operations activity"}</div><div className="text-xs text-stone-500">{event.entity_type || event.aggregate_type || "record"}</div></div>
                      <time className="shrink-0 text-xs text-stone-400" dateTime={event.created_at}>{formatDate(event.created_at)}</time>
                    </div>
                  ))}
                </div>
              )}
              <Link to="/operations/audit" className={`mt-4 inline-flex text-sm font-semibold text-royal-700 hover:text-royal-900 ${focusRing}`}>Open audit history →</Link>
            </Section>
          </div>
        </>
      )}
      {!loading && !error && !summary && <EmptyState message="No dashboard data was returned. Try refreshing the page." />}
    </OperationsLayout>
  );
}
