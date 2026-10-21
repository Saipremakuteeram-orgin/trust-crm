import { useEffect, useState } from "react";
import { ArrowLeft, Check, RefreshCw, Send } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import AppLayout from "../../components/AppLayout";
import { useAuth } from "../../lib/AuthContext";
import api from "../../lib/api";
import { ALL_TRUSTS_ID, useOperations } from "../../lib/OperationsContext";
import { isOperationsEnabled } from "../../lib/operationsFlags";
import { useToast } from "../../components/Toast";

const fmt = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

function Metric({ label, value, tone = "text-stone-900" }) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-stone-400">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${tone}`}>{fmt(value)}</div>
    </div>
  );
}

function DisabledState() {
  return (
    <AppLayout>
      <section className="max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-amber-900">Fund management is not enabled</h1>
        <p className="mt-2 text-sm text-amber-800">Enable ENABLE_OPERATIONS_FUNDS to view fund details.</p>
      </section>
    </AppLayout>
  );
}

export default function OperationsFundDetail() {
  const fundsEnabled = isOperationsEnabled("funds");
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const { selectedTrustId } = useOperations();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canPrepare = role === "admin" || role === "accountant";
  const canApprove = role === "admin";
  const trustId = searchParams.get("trust_id") || selectedTrustId;
  const [fund, setFund] = useState(null);
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [transferForm, setTransferForm] = useState({ toFundId: "", amount: "", reason: "", overrideReason: "" });
  const [transferSaving, setTransferSaving] = useState(false);

  async function load() {
    if (!fundsEnabled || !id || !trustId || trustId === ALL_TRUSTS_ID) {
      if (trustId === ALL_TRUSTS_ID) setError("Select a concrete trust to view a fund detail");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [fundResponse, fundsResponse] = await Promise.all([
        api.get(`/v2/operations/funds/${id}`, { params: { trust_id: trustId } }),
        api.get("/v2/operations/funds", { params: { trust_id: trustId } }),
      ]);
      setFund(fundResponse.data?.result || null);
      setFunds(Array.isArray(fundsResponse.data?.result) ? fundsResponse.data.result : []);
    } catch (requestError) {
      setFund(null);
      setError(requestError.response?.data?.message || "Unable to load fund detail");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [fundsEnabled, id, trustId]);

  function refresh() {
    setRefreshing(true);
    load().finally(() => setTimeout(() => setRefreshing(false), 350));
  }

  async function handleTransfer(event) {
    event.preventDefault();
    if (!transferForm.toFundId || !transferForm.amount || !transferForm.reason.trim()) {
      addToast("Destination, amount, and reason are required", "error");
      return;
    }
    setTransferSaving(true);
    try {
      await api.post(`/v2/operations/funds/${id}/transfer`, {
        toFundId: transferForm.toFundId,
        amount: Number(transferForm.amount),
        reason: transferForm.reason.trim(),
        overrideReason: transferForm.overrideReason.trim() || undefined,
        trust_id: trustId,
      });
      addToast("Transfer submitted for Admin approval", "success");
      setTransferForm({ toFundId: "", amount: "", reason: "", overrideReason: "" });
      await load();
    } catch (requestError) {
      addToast(requestError.response?.data?.message || "Unable to submit transfer", "error");
    } finally {
      setTransferSaving(false);
    }
  }

  async function approveFund() {
    try {
      await api.post(`/v2/operations/funds/${id}/approve`, {}, { params: { trust_id: trustId } });
      addToast("Fund approved", "success");
      await load();
    } catch (requestError) {
      addToast(requestError.response?.data?.message || "Unable to approve fund", "error");
    }
  }

  async function approveTransfer(transferId) {
    try {
      await api.post(`/v2/operations/funds/${id}/transfers/${transferId}/approve`, {}, { params: { trust_id: trustId } });
      addToast("Transfer approved and posted", "success");
      await load();
    } catch (requestError) {
      addToast(requestError.response?.data?.message || "Unable to approve transfer", "error");
    }
  }

  if (!fundsEnabled) return <DisabledState />;

  const summary = fund?.summary || {};
  const otherFunds = funds.filter((item) => item.id !== id && item.status !== "closed");
  const allocations = summary.allocations || [];
  const commitments = summary.commitments || [];
  const transfers = summary.transfers || [];

  return (
    <AppLayout>
      <div className="max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button type="button" onClick={() => navigate("/operations/funds")} className="mt-1 rounded-xl border border-stone-200 bg-white p-2 text-stone-600 hover:bg-stone-50" aria-label="Back to funds">
              <ArrowLeft size={16} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-saffron-600">Fund detail</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">{fund?.name || "Fund"}</h1>
              <p className="mt-1 text-sm text-stone-500">{fund?.fund_type || "general"} · {fund?.status || "loading"} · trust {trustId}</p>
            </div>
          </div>
          <button type="button" onClick={refresh} className="rounded-xl border border-stone-200 bg-white p-2.5 text-stone-600 hover:bg-stone-50" aria-label="Refresh fund detail">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        {loading && <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">Loading fund detail…</div>}
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
        {!loading && !error && fund && (
          <>
            {fund.status === "draft" && canApprove && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div>
                  <div className="font-semibold text-amber-900">Fund approval is pending</div>
                  <div className="mt-1 text-sm text-amber-800">Admin approval is required before the opening balance becomes official.</div>
                </div>
                <button type="button" onClick={approveFund} className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"><Check size={16} /> Approve fund</button>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Opening" value={summary.opening} />
              <Metric label="Received" value={summary.received} tone="text-emerald-600" />
              <Metric label="Spent" value={summary.spent} tone="text-rose-600" />
              <Metric label="Committed" value={summary.committed} tone="text-amber-600" />
              <Metric label="Available" value={summary.available} tone={Number(summary.available || 0) < 0 ? "text-rose-600" : "text-royal-700"} />
              <Metric label="Budget" value={summary.budget} />
              <Metric label="Budget remaining" value={summary.budgetRemaining} tone={Number(summary.budgetRemaining || 0) < 0 ? "text-rose-600" : "text-emerald-700"} />
              <Metric label="Budget actual" value={summary.actual} tone="text-stone-700" />
            </div>

            {canPrepare && (
              <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2"><Send size={17} className="text-saffron-600" /><h2 className="font-semibold text-stone-800">Prepare transfer</h2></div>
                <form onSubmit={handleTransfer} className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                  <label className="text-xs font-semibold text-stone-500">Destination fund
                    <select required value={transferForm.toFundId} onChange={(event) => setTransferForm({ ...transferForm, toFundId: event.target.value })} className="mt-1.5 w-full rounded-xl border-2 border-stone-200 px-3 py-2.5 text-sm font-normal text-stone-800 outline-none focus:border-saffron-400">
                      <option value="">Select destination</option>
                      {otherFunds.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-stone-500">Amount
                    <input required type="number" min="0.01" step="0.01" value={transferForm.amount} onChange={(event) => setTransferForm({ ...transferForm, amount: event.target.value })} className="mt-1.5 w-full rounded-xl border-2 border-stone-200 px-3 py-2.5 text-sm font-normal text-stone-800 outline-none focus:border-saffron-400" placeholder="0" />
                  </label>
                  <label className="text-xs font-semibold text-stone-500">Reason
                    <input required value={transferForm.reason} onChange={(event) => setTransferForm({ ...transferForm, reason: event.target.value })} className="mt-1.5 w-full rounded-xl border-2 border-stone-200 px-3 py-2.5 text-sm font-normal text-stone-800 outline-none focus:border-saffron-400" placeholder="Why is the transfer needed?" />
                  </label>
                  <label className="text-xs font-semibold text-stone-500">Admin override reason (optional)
                    <input value={transferForm.overrideReason} onChange={(event) => setTransferForm({ ...transferForm, overrideReason: event.target.value })} className="mt-1.5 w-full rounded-xl border-2 border-stone-200 px-3 py-2.5 text-sm font-normal text-stone-800 outline-none focus:border-saffron-400" placeholder="Required only if balance is insufficient" />
                  </label>
                  <div className="lg:col-span-4 flex justify-end">
                    <button type="submit" disabled={transferSaving} className="rounded-xl bg-saffron-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-saffron-500/20 disabled:opacity-50">{transferSaving ? "Submitting…" : "Submit for approval"}</button>
                  </div>
                </form>
              </section>
            )}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 font-semibold text-stone-800">Allocations</h2>
                {allocations.length === 0 ? <p className="text-sm text-stone-500">No allocation rows yet.</p> : (
                  <div className="space-y-2">
                    {allocations.map((allocation) => (
                      <div key={allocation.id} className="flex items-center justify-between rounded-xl border border-stone-100 px-3 py-2.5">
                        <div><div className="text-sm font-medium capitalize text-stone-800">{allocation.allocation_type || "allocation"}</div><div className="text-xs text-stone-400">{allocation.status} · {allocation.transaction_id || "record"}</div></div>
                        <div className="font-semibold text-stone-800">{fmt(allocation.amount)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 font-semibold text-stone-800">Commitments</h2>
                {commitments.length === 0 ? <p className="text-sm text-stone-500">No approved commitments yet.</p> : (
                  <div className="space-y-2">
                    {commitments.map((commitment) => (
                      <div key={commitment.id} className="flex items-center justify-between rounded-xl border border-stone-100 px-3 py-2.5"><div><div className="text-sm font-medium text-stone-800">{commitment.description || "Fund commitment"}</div><div className="text-xs text-stone-400">{commitment.status}</div></div><div className="font-semibold text-amber-700">{fmt(commitment.amount)}</div></div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-semibold text-stone-800">Transfers</h2>
              {transfers.length === 0 ? <p className="text-sm text-stone-500">No posted transfers yet.</p> : (
                <div className="space-y-2">
                  {transfers.map((transfer) => {
                    const outgoing = transfer.from_fund_id === id;
                    return (
                      <div key={transfer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-100 px-3 py-2.5">
                        <div><div className="text-sm font-medium text-stone-800">{outgoing ? "Transfer out" : "Transfer in"}</div><div className="text-xs text-stone-400">{transfer.reason} · {transfer.status}</div></div>
                        <div className="flex items-center gap-3"><span className={`font-semibold ${outgoing ? "text-rose-700" : "text-emerald-700"}`}>{outgoing ? "−" : "+"}{fmt(transfer.amount)}</span>{canApprove && transfer.status === "pending_approval" && <button type="button" onClick={() => approveTransfer(transfer.id)} className="rounded-lg bg-royal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-royal-700">Approve</button>}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
        {!loading && !error && !fund && <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">Fund not found.</div>}
        <Link to="/operations/funds" className="inline-flex text-sm font-semibold text-royal-600 hover:text-royal-800">Back to all funds</Link>
      </div>
    </AppLayout>
  );
}
