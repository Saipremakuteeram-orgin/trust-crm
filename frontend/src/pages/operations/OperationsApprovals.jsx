import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, RefreshCw, RotateCcw, Send, XCircle } from "lucide-react";
import OperationsLayout from "../../components/operations/OperationsLayout";
import StatusBadge from "../../components/operations/StatusBadge";
import operationsApi, { getRoleCapabilities, requestErrorMessage } from "../../lib/operationsApi";
import { useAuth } from "../../lib/AuthContext";
import { useOperations } from "../../lib/OperationsContext";
import { useToast } from "../../components/Toast";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron-300 focus-visible:ring-offset-2";

function money(value, currency = "INR") {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function field(record, ...names) {
  return names.map((name) => record?.[name]).find((value) => value !== undefined && value !== null && value !== "");
}

function approvalTrustId(approval) {
  return field(approval, "trust_id", "trustId");
}

function approvalRecordId(approval) {
  return field(approval, "record_id", "recordId", "transaction_id", "transactionId");
}

function approvalAutomationId(approval) {
  return field(approval, "automation_event_id", "automationEventId", "delivery_id", "deliveryId");
}

function ActionButton({ children, onClick, tone = "neutral", disabled = false, icon: Icon }) {
  const tones = {
    neutral: "border-stone-200 bg-white text-stone-700 hover:bg-stone-50",
    primary: "bg-royal-600 text-white hover:bg-royal-700",
    warning: "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
    danger: "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100",
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${focusRing}`}>
      {Icon && <Icon size={14} aria-hidden="true" />}
      {children}
    </button>
  );
}

export default function OperationsApprovals() {
  const { profile } = useAuth();
  const { trusts, selectedTrustId } = useOperations();
  const { addToast } = useToast();
  const capabilities = getRoleCapabilities(profile?.role || "viewer");
  const trustNames = useMemo(() => new Map(trusts.map((trust) => [trust.id, trust.name])), [trusts]);
  const [status, setStatus] = useState("pending_approval");
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [actionId, setActionId] = useState(null);

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApprovals(await operationsApi.getApprovals({ trustId: selectedTrustId, status: status || undefined }));
    } catch (requestError) {
      setApprovals([]);
      setError(requestErrorMessage(requestError, "Unable to load approval records"));
    } finally {
      setLoading(false);
    }
  }, [selectedTrustId, status]);

  useEffect(() => {
    loadApprovals();
  }, [loadApprovals]);

  function refresh() {
    setRefreshing(true);
    loadApprovals().finally(() => setRefreshing(false));
  }

  async function performAction(approval, action, actionCall) {
    const trustId = approvalTrustId(approval);
    if (!trustId) {
      addToast("This approval does not identify a concrete trust", "error");
      return;
    }
    setActionId(approval.id);
    try {
      await actionCall(trustId);
      addToast(action, "success");
      await loadApprovals();
    } catch (requestError) {
      addToast(requestErrorMessage(requestError, `${action} failed`), "error");
    } finally {
      setActionId(null);
    }
  }

  async function submit(approval) {
    await performAction(approval, "Record submitted for approval", (trustId) => operationsApi.submitApproval(approval.id, trustId));
  }

  async function approve(approval) {
    await performAction(approval, "Record approved and posted", (trustId) => operationsApi.approveApproval(approval.id, trustId));
  }

  async function reject(approval) {
    const reason = window.prompt("Reason for rejecting this record:");
    if (!reason?.trim()) return;
    await performAction(approval, "Record rejected", (trustId) => operationsApi.rejectApproval(approval.id, trustId, reason.trim()));
  }

  async function retry(approval) {
    const eventId = approvalAutomationId(approval);
    if (!eventId) {
      addToast("No retryable automation event is attached to this record", "error");
      return;
    }
    await performAction(approval, "Delivery retry requested", (trustId) => operationsApi.retryAutomationEvent(eventId, trustId));
  }

  async function reverse(approval) {
    const recordId = approvalRecordId(approval);
    const reason = window.prompt("Reason for reversing this posted record:");
    if (!recordId || !reason?.trim()) return;
    await performAction(approval, "Reversal requested", (trustId) => operationsApi.reverseRecord(recordId, trustId, reason.trim()));
  }

  return (
    <OperationsLayout
      title="Approvals"
      description="Review trust-scoped financial records before they become official. Admins approve or reject; accountants prepare and submit; viewers can read history."
      feature="approvals"
      actions={(
        <button type="button" onClick={refresh} className={`inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 ${focusRing}`} aria-label="Refresh approvals">
          <RefreshCw size={16} className={refreshing ? "motion-safe:animate-spin" : ""} aria-hidden="true" />
          Refresh
        </button>
      )}
    >
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <label className="flex min-w-56 flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)} className={`rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-stone-800 ${focusRing}`}>
            <option value="pending_approval">Pending approval</option>
            <option value="">All statuses</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <p className="max-w-xl text-xs leading-5 text-stone-500">
          {capabilities.canApprove ? "Admin review actions are enabled for concrete trust records." : capabilities.canSubmit ? "You can create and submit records, but approval stays with an Admin." : "Viewer access is read-only."}
        </p>
      </section>

      {loading && <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500" role="status">Loading approval records…</div>}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert">{error}</div>}
      {!loading && !error && approvals.length === 0 && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <Check size={32} className="mx-auto text-stone-300" aria-hidden="true" />
          <h2 className="mt-3 font-semibold text-stone-800">No approval records in this view</h2>
          <p className="mt-1 text-sm text-stone-500">New records will appear here when they are submitted for trust review.</p>
        </div>
      )}
      {!loading && !error && approvals.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <caption className="sr-only">Operations approval records</caption>
              <thead className="border-b border-stone-100 bg-stone-50/70 text-xs uppercase tracking-wider text-stone-400">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Record</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Trust</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Amount</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Created by / date</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Fund</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Supporting document</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Status / history</th>
                  <th scope="col" className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map((approval) => {
                  const recordTrust = approvalTrustId(approval);
                  const recordStatus = approval.status || "pending_approval";
                  const recordType = field(approval, "record_type", "recordType") || "Operations record";
                  const amount = field(approval, "amount", "total_amount", "totalAmount");
                  const creator = field(approval, "requested_by_name", "requested_by_email", "requested_by", "created_by") || "—";
                  const fund = field(approval, "fund_name", "fund_id", "fundId") || "—";
                  const document = field(approval, "supporting_document_url", "document_url", "documentUrl");
                  const busy = actionId === approval.id;
                  return (
                    <tr key={approval.id} className="border-b border-stone-50 align-top last:border-b-0 hover:bg-stone-50/60">
                      <td className="px-5 py-4"><div className="font-semibold capitalize text-stone-800">{recordType.replaceAll("_", " ")}</div><div className="mt-1 text-xs text-stone-400">{approvalRecordId(approval) || approval.id}</div></td>
                      <td className="px-5 py-4 text-stone-600">{trustNames.get(recordTrust) || recordTrust || "All trusts"}</td>
                      <td className="px-5 py-4 text-right font-semibold text-stone-800">{money(amount, approval.currency || "INR")}</td>
                      <td className="px-5 py-4"><div className="text-stone-700">{creator}</div><time className="mt-1 block text-xs text-stone-400" dateTime={approval.requested_at || approval.created_at}>{approval.requested_at || approval.created_at || "—"}</time></td>
                      <td className="px-5 py-4 text-stone-600">{fund}</td>
                      <td className="px-5 py-4">{document ? <a href={document} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-xs font-semibold text-royal-700 hover:text-royal-900 ${focusRing}`}>Open <ExternalLink size={13} aria-hidden="true" /></a> : <span className="text-stone-400">—</span>}</td>
                      <td className="px-5 py-4"><StatusBadge status={recordStatus} /><div className="mt-2 max-w-44 text-xs text-stone-500">{approval.reason || approval.reviewed_at || "No review note"}</div></td>
                      <td className="px-5 py-4"><div className="flex min-w-40 flex-wrap justify-end gap-1.5">
                        {capabilities.canSubmit && ["draft", "rejected"].includes(recordStatus) && <ActionButton onClick={() => submit(approval)} disabled={busy} icon={Send}>Submit</ActionButton>}
                        {capabilities.canApprove && recordStatus === "pending_approval" && <ActionButton onClick={() => approve(approval)} disabled={busy} tone="primary" icon={Check}>Approve</ActionButton>}
                        {capabilities.canApprove && recordStatus === "pending_approval" && <ActionButton onClick={() => reject(approval)} disabled={busy} tone="danger" icon={XCircle}>Reject</ActionButton>}
                        {capabilities.canRetry && approvalAutomationId(approval) && (!field(approval, "delivery_status", "automation_status", "automationStatus") || ["failed", "retrying"].includes(field(approval, "delivery_status", "automation_status", "automationStatus"))) && <ActionButton onClick={() => retry(approval)} disabled={busy} tone="warning" icon={RotateCcw}>Retry</ActionButton>}
                        {capabilities.canApprove && ["approved", "posted"].includes(recordStatus) && <ActionButton onClick={() => reverse(approval)} disabled={busy} tone="danger" icon={RotateCcw}>Reverse</ActionButton>}
                        {!capabilities.canSubmit && !capabilities.canApprove && !capabilities.canRetry && <span className="text-xs text-stone-400">Read only</span>}
                      </div></td>
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
