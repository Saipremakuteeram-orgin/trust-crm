import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Bot, RefreshCw, RotateCcw } from "lucide-react";
import OperationsLayout from "../../components/operations/OperationsLayout";
import DeliveryStatus from "../../components/operations/DeliveryStatus";
import operationsApi, { getRoleCapabilities, requestErrorMessage } from "../../lib/operationsApi";
import { useAuth } from "../../lib/AuthContext";
import { useOperations } from "../../lib/OperationsContext";
import { useToast } from "../../components/Toast";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron-300 focus-visible:ring-offset-2";

function eventTrustId(event) {
  return event?.trust_id || event?.trustId;
}

function eventAttempts(event) {
  return event?.attempt_count ?? event?.attemptCount ?? 0;
}

function eventError(event) {
  return event?.last_error || event?.lastError;
}

function eventDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function OperationsAutomation() {
  const { profile } = useAuth();
  const { trusts, selectedTrustId } = useOperations();
  const { addToast } = useToast();
  const capabilities = getRoleCapabilities(profile?.role || "viewer");
  const trustNames = useMemo(() => new Map(trusts.map((trust) => [trust.id, trust.name])), [trusts]);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [actionId, setActionId] = useState(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEvents(await operationsApi.getAutomationEvents({ trustId: selectedTrustId, status: status || undefined }));
    } catch (requestError) {
      setEvents([]);
      setError(requestErrorMessage(requestError, "Unable to load automation events"));
    } finally {
      setLoading(false);
    }
  }, [selectedTrustId, status]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  function refresh() {
    setRefreshing(true);
    loadEvents().finally(() => setRefreshing(false));
  }

  async function retry(event) {
    const trustId = eventTrustId(event);
    if (!trustId || !event.id) {
      addToast("A concrete trust and event ID are required to retry delivery", "error");
      return;
    }
    setActionId(event.id);
    try {
      await operationsApi.retryAutomationEvent(event.id, trustId);
      addToast("Automation event queued for retry", "success");
      await loadEvents();
    } catch (requestError) {
      addToast(requestErrorMessage(requestError, "Unable to retry automation event"), "error");
    } finally {
      setActionId(null);
    }
  }

  const counts = events.reduce((result, event) => {
    const eventStatus = event.status || "unknown";
    result[eventStatus] = (result[eventStatus] || 0) + 1;
    return result;
  }, {});

  return (
    <OperationsLayout
      title="Automation monitor"
      description="Inspect document and notification event state, attempts, and bounded errors. Retry is available to Admins and Accountants when the API exposes a retry action."
      feature="automationMonitor"
      actions={(
        <button type="button" onClick={refresh} className={`inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 ${focusRing}`} aria-label="Refresh automation events">
          <RefreshCw size={16} className={refreshing ? "motion-safe:animate-spin" : ""} aria-hidden="true" />
          Refresh
        </button>
      )}
    >
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <label className="flex min-w-56 flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)} className={`rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-stone-800 ${focusRing}`}>
            <option value="">All event states</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="retrying">Retrying</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2 text-xs text-stone-500" aria-label="Automation event counts">
          {Object.entries(counts).map(([name, count]) => <span key={name} className="rounded-full bg-stone-100 px-2.5 py-1 capitalize">{name}: {count}</span>)}
        </div>
      </section>

      {loading && <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500" role="status">Loading automation events…</div>}
      {error && <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert"><AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{error}. The monitor remains read-only until an event endpoint is available.</span></div>}
      {!loading && !error && events.length === 0 && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <Bot size={32} className="mx-auto text-stone-300" aria-hidden="true" />
          <h2 className="mt-3 font-semibold text-stone-800">No automation events in this view</h2>
          <p className="mt-1 text-sm text-stone-500">Document and notification events will appear here when the automation monitor API returns them.</p>
        </div>
      )}
      {!loading && !error && events.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <caption className="sr-only">Operations automation events</caption>
              <thead className="border-b border-stone-100 bg-stone-50/70 text-xs uppercase tracking-wider text-stone-400">
                <tr><th scope="col" className="px-5 py-3 font-semibold">Event</th><th scope="col" className="px-5 py-3 font-semibold">Trust</th><th scope="col" className="px-5 py-3 font-semibold">State</th><th scope="col" className="px-5 py-3 font-semibold">Attempts / error</th><th scope="col" className="px-5 py-3 font-semibold">Created</th><th scope="col" className="px-5 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const eventStatus = event.status || "unknown";
                  const canRetry = capabilities.canRetry && ["failed", "retrying"].includes(eventStatus);
                  const busy = actionId === event.id;
                  return (
                    <tr key={event.id} className="border-b border-stone-50 align-top last:border-b-0 hover:bg-stone-50/60">
                      <td className="px-5 py-4"><div className="font-semibold text-stone-800">{event.event_type || event.eventType || "Automation event"}</div><div className="mt-1 text-xs text-stone-400">{event.aggregate_type || event.aggregateType || "record"} · {event.aggregate_id || event.aggregateId || event.id}</div></td>
                      <td className="px-5 py-4 text-stone-600">{trustNames.get(eventTrustId(event)) || eventTrustId(event) || "All trusts"}</td>
                      <td className="px-5 py-4"><DeliveryStatus status={eventStatus} attempts={eventAttempts(event)} lastError={eventError(event)} /></td>
                      <td className="px-5 py-4"><div className="text-stone-700">Attempt {eventAttempts(event)}</div><div className="mt-1 max-w-xs truncate text-xs text-rose-600" title={eventError(event) || "No error recorded"}>{eventError(event) || "No error recorded"}</div></td>
                      <td className="px-5 py-4 text-xs text-stone-500"><time dateTime={event.created_at || event.createdAt}>{eventDate(event.created_at || event.createdAt)}</time><div className="mt-1">Next: {eventDate(event.next_attempt_at || event.nextAttemptAt)}</div></td>
                      <td className="px-5 py-4 text-right">{canRetry ? <button type="button" onClick={() => retry(event)} disabled={busy} className={`inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 ${focusRing}`}><RotateCcw size={14} aria-hidden="true" />{busy ? "Retrying…" : "Retry"}</button> : <span className="text-xs text-stone-400">{capabilities.canRetry ? "No action" : "Read only"}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </OperationsLayout>
  );
}
