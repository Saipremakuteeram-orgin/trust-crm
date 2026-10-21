import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import OperationsLayout from "../../components/operations/OperationsLayout";
import DeliveryStatus from "../../components/operations/DeliveryStatus";
import StatusBadge from "../../components/operations/StatusBadge";
import operationsApi, { canRetryInTrustContext, getRoleCapabilities, isConcreteTrust, requestErrorMessage } from "../../lib/operationsApi";
import { isOperationsEnabled } from "../../lib/operationsFlags";
import { useAuth } from "../../lib/AuthContext";
import { useOperations } from "../../lib/OperationsContext";
import { useToast } from "../../components/Toast";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron-300 focus-visible:ring-offset-2";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function Field({ label, children }) {
  return <label className="flex min-w-40 flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">{label}{children}</label>;
}

function Input(props) {
  return <input {...props} className={`rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-stone-800 ${focusRing}`} />;
}

function Select({ children, ...props }) {
  return <select {...props} className={`rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-stone-800 ${focusRing}`}>{children}</select>;
}

function CountCard({ label, value, tone = "text-stone-900" }) {
  return <div className="rounded-xl border border-stone-100 bg-stone-50/70 p-4"><div className="text-xs font-semibold uppercase tracking-wider text-stone-400">{label}</div><div className={`mt-2 text-xl font-bold ${tone}`}>{value}</div></div>;
}

export default function OperationsAudit() {
  const { profile } = useAuth();
  const { trusts, selectedTrustId } = useOperations();
  const { addToast } = useToast();
  const roleCapabilities = getRoleCapabilities(profile?.role || "viewer");
  const capabilities = { ...roleCapabilities, canRetry: canRetryInTrustContext(profile?.role || "viewer", selectedTrustId) };
  const trustNames = useMemo(() => new Map(trusts.map((trust) => [trust.id, trust.name])), [trusts]);
  const [filters, setFilters] = useState({ from: "", to: "", entityType: "", entityId: "", actorId: "", status: "" });
  const [auditEvents, setAuditEvents] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [healthError, setHealthError] = useState(null);
  const [actionId, setActionId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHealthError(null);
    try {
      const audit = await operationsApi.getOperationsAudit({ trustId: selectedTrustId, ...filters, limit: 100 });
      setAuditEvents(audit);
      if (isOperationsEnabled("automationMonitor")) {
        try {
          setHealth(await operationsApi.getDeliveryHealth({ trustId: selectedTrustId, status: filters.status || undefined, from: filters.from, to: filters.to, limit: 100 }));
        } catch (requestError) {
          setHealth(null);
          setHealthError(requestErrorMessage(requestError, "Unable to load delivery health"));
        }
      } else {
        setHealth(null);
      }
    } catch (requestError) {
      setAuditEvents([]);
      setHealth(null);
      setError(requestErrorMessage(requestError, "Unable to load Operations audit history"));
    } finally {
      setLoading(false);
    }
  }, [filters, selectedTrustId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function refresh() {
    setRefreshing(true);
    loadData().finally(() => setRefreshing(false));
  }

  async function retry(event) {
    const trustId = event.trust_id || event.trustId;
    if (!isConcreteTrust(selectedTrustId) || !capabilities.canRetry || !trustId || !event.id) return;
    setActionId(event.id);
    try {
      await operationsApi.retryAutomationEvent(event.id, trustId);
      addToast("Automation event queued for retry", "success");
      await loadData();
    } catch (requestError) {
      addToast(requestErrorMessage(requestError, "Unable to retry automation event"), "error");
    } finally {
      setActionId(null);
    }
  }

  const automationEvents = health?.automation_events || [];

  return (
    <OperationsLayout
      title="Audit & delivery health"
      description="Review append-only Operations history and monitor document/outbox delivery without exposing another trust's events."
      actions={(
        <button type="button" onClick={refresh} className={`inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 ${focusRing}`} aria-label="Refresh Operations audit and delivery health">
          <RefreshCw size={16} className={refreshing ? "motion-safe:animate-spin" : ""} aria-hidden="true" />
          Refresh
        </button>
      )}
    >
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" aria-label="Audit filters">
        <div className="mb-4 flex items-center gap-2"><Activity size={18} className="text-royal-600" aria-hidden="true" /><h2 className="font-semibold text-stone-900">Filter activity</h2></div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From"><Input type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} /></Field>
          <Field label="To"><Input type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} /></Field>
          <Field label="Entity type"><Input placeholder="operations_invoice" value={filters.entityType} onChange={(event) => updateFilter("entityType", event.target.value)} /></Field>
          <Field label="Entity ID"><Input placeholder="Record ID" value={filters.entityId} onChange={(event) => updateFilter("entityId", event.target.value)} /></Field>
          <Field label="Actor ID"><Input placeholder="User ID" value={filters.actorId} onChange={(event) => updateFilter("actorId", event.target.value)} /></Field>
          <Field label="Delivery status"><Select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="">All delivery states</option><option value="pending">Pending</option><option value="processing">Processing</option><option value="retrying">Retrying</option><option value="sent">Sent</option><option value="completed">Completed</option><option value="failed">Failed</option></Select></Field>
          <button type="button" onClick={() => setFilters({ from: "", to: "", entityType: "", entityId: "", actorId: "", status: "" })} className={`rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-50 ${focusRing}`}>Clear filters</button>
        </div>
      </section>

      {loading && <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500" role="status">Loading audit history…</div>}
      {error && <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert"><AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</div>}
      {healthError && <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="status"><AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{healthError}</div>}

      {!loading && !error && (
        <>
          <section aria-label="Delivery health summary">
            <div className="mb-3 flex items-center gap-2"><ShieldCheck size={18} className="text-royal-600" aria-hidden="true" /><h2 className="font-semibold text-stone-900">Delivery health</h2></div>
            {!isOperationsEnabled("automationMonitor") ? <p className="rounded-xl border border-dashed border-stone-300 bg-white p-5 text-sm text-stone-500">Delivery monitoring is disabled. Enable the Operations automation monitor to inspect outbox events and retry failed deliveries.</p> : health ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><CountCard label="Total events" value={health.counts?.total || 0} /><CountCard label="Failed" value={health.counts?.failed ?? ((health.counts?.deliveries?.failed || 0) + (health.counts?.automation_events?.failed || 0))} tone="text-rose-700" /><CountCard label="Retryable" value={health.counts?.retryable || 0} tone="text-amber-700" /><CountCard label="Last errors" value={health.last_errors?.length || 0} tone="text-orange-700" /></div> : <p className="rounded-xl border border-dashed border-stone-300 bg-white p-5 text-sm text-stone-500">No delivery health data was returned for this view.</p>}
          </section>

          {isOperationsEnabled("automationMonitor") && automationEvents.length > 0 && <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"><div className="border-b border-stone-100 px-5 py-4"><h2 className="font-semibold text-stone-900">Delivery events</h2><p className="mt-1 text-sm text-stone-500">Admin and Accountant users can retry failed or retrying donation document events.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><caption className="sr-only">Operations delivery events</caption><thead className="border-b border-stone-100 bg-stone-50/70 text-xs uppercase tracking-wider text-stone-400"><tr><th scope="col" className="px-5 py-3 font-semibold">Event</th><th scope="col" className="px-5 py-3 font-semibold">Trust</th><th scope="col" className="px-5 py-3 font-semibold">Health</th><th scope="col" className="px-5 py-3 font-semibold">Updated</th><th scope="col" className="px-5 py-3 text-right font-semibold">Action</th></tr></thead><tbody>{automationEvents.map((event) => { const status = event.status || "unknown"; const canRetry = capabilities.canRetry && ["failed", "retrying"].includes(status); const busy = actionId === event.id; return <tr key={event.id} className="border-b border-stone-50 align-top last:border-b-0 hover:bg-stone-50/60"><td className="px-5 py-4"><div className="font-semibold text-stone-800">{event.event_type || "Automation event"}</div><div className="mt-1 text-xs text-stone-500">{event.aggregate_type || "record"} · {event.aggregate_id || event.id}</div></td><td className="px-5 py-4 text-stone-600">{trustNames.get(event.trust_id || event.trustId) || event.trust_id || event.trustId || "All trusts"}</td><td className="px-5 py-4"><DeliveryStatus status={status} attempts={event.attempt_count || event.attemptCount} lastError={event.last_error || event.lastError} /></td><td className="px-5 py-4 text-xs text-stone-500">{formatDate(event.updated_at || event.updatedAt || event.created_at)}</td><td className="px-5 py-4 text-right">{canRetry ? <button type="button" onClick={() => retry(event)} disabled={busy} className={`inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 ${focusRing}`}><RotateCcw size={14} aria-hidden="true" />{busy ? "Retrying…" : "Retry"}</button> : <span className="text-xs text-stone-400">{capabilities.canRetry ? "No action" : "Read only"}</span>}</td></tr>; })}</tbody></table></div></section>}

          <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"><div className="border-b border-stone-100 px-5 py-4"><h2 className="font-semibold text-stone-900">Audit history</h2><p className="mt-1 text-sm text-stone-500">Append-only event history for the selected trust context.</p></div>{auditEvents.length === 0 ? <p className="p-8 text-sm text-stone-500">No audit events match these filters.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><caption className="sr-only">Operations audit history</caption><thead className="border-b border-stone-100 bg-stone-50/70 text-xs uppercase tracking-wider text-stone-400"><tr><th scope="col" className="px-5 py-3 font-semibold">When</th><th scope="col" className="px-5 py-3 font-semibold">Trust</th><th scope="col" className="px-5 py-3 font-semibold">Action</th><th scope="col" className="px-5 py-3 font-semibold">Entity</th><th scope="col" className="px-5 py-3 font-semibold">Actor</th><th scope="col" className="px-5 py-3 font-semibold">Status</th></tr></thead><tbody>{auditEvents.map((event) => <tr key={event.id || `${event.created_at}-${event.entity_id}`} className="border-b border-stone-50 last:border-b-0 hover:bg-stone-50/60"><td className="px-5 py-4 text-xs text-stone-500">{formatDate(event.created_at || event.createdAt)}</td><td className="px-5 py-4 text-stone-700">{trustNames.get(event.trust_id || event.trustId) || event.trust_id || event.trustId || "All trusts"}</td><td className="px-5 py-4"><StatusBadge status={event.action || "activity"} label={event.action || "Activity"} /></td><td className="px-5 py-4"><div className="font-medium text-stone-800">{event.entity_type || "record"}</div><div className="mt-1 text-xs text-stone-500">{event.entity_id || "—"}</div></td><td className="px-5 py-4 text-xs text-stone-500">{event.actor_id || "System"}</td><td className="px-5 py-4 text-xs text-stone-500">Append-only</td></tr>)}</tbody></table></div>}</section>
        </>
      )}
    </OperationsLayout>
  );
}
