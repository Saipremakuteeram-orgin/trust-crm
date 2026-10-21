import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Landmark, Plus, RefreshCw } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import { useAuth } from "../../lib/AuthContext";
import api from "../../lib/api";
import { ALL_TRUSTS_ID, useOperations } from "../../lib/OperationsContext";
import { isOperationsEnabled } from "../../lib/operationsFlags";
import { useToast } from "../../components/Toast";

const FUND_TYPES = [
  ["general", "General / unrestricted"],
  ["restricted", "Restricted"],
  ["designated", "Donor designated"],
  ["project", "Program / project"],
  ["endowment", "Endowment"],
];

const fmt = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

function StatusBadge({ status }) {
  const styles = {
    active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    draft: "bg-amber-50 text-amber-700 ring-amber-200",
    closed: "bg-stone-100 text-stone-500 ring-stone-200",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${styles[status] || styles.draft}`}>
      {status || "draft"}
    </span>
  );
}

function SummaryCard({ label, value, tone = "text-stone-900" }) {
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
        <p className="mt-2 text-sm text-amber-800">
          Enable ENABLE_OPERATIONS_FUNDS for the additive Operations fund surface. Existing Functions &amp; Budget remains available.
        </p>
      </section>
    </AppLayout>
  );
}

export default function OperationsFunds() {
  const fundsEnabled = isOperationsEnabled("funds");
  const { profile } = useAuth();
  const { trusts, selectedTrustId, setSelectedTrustId, loading: trustsLoading } = useOperations();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canPrepare = role === "admin" || role === "accountant";
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", type: "general", openingBalance: "", budget: "" });

  async function loadFunds() {
    if (!fundsEnabled) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get("/v2/operations/funds", {
        params: { trust_id: selectedTrustId || ALL_TRUSTS_ID },
      });
      setFunds(Array.isArray(response.data?.result) ? response.data.result : []);
    } catch (requestError) {
      setFunds([]);
      setError(requestError.response?.data?.message || "Unable to load funds");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFunds();
  }, [fundsEnabled, selectedTrustId]);

  const totals = useMemo(() => funds.reduce((total, fund) => {
    const summary = fund.summary || {};
    return {
      received: total.received + Number(summary.received || 0),
      spent: total.spent + Number(summary.spent || 0),
      committed: total.committed + Number(summary.committed || 0),
      available: total.available + Number(summary.available || 0),
    };
  }, { received: 0, spent: 0, committed: 0, available: 0 }), [funds]);

  function refresh() {
    setRefreshing(true);
    loadFunds().finally(() => setTimeout(() => setRefreshing(false), 350));
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (selectedTrustId === ALL_TRUSTS_ID) {
      addToast("Select one trust before creating a fund", "error");
      return;
    }
    if (!form.name.trim()) {
      addToast("Fund name is required", "error");
      return;
    }
    setSaving(true);
    try {
      await api.post("/v2/operations/funds", {
        trust_id: selectedTrustId,
        name: form.name.trim(),
        type: form.type,
        openingBalance: form.openingBalance === "" ? 0 : Number(form.openingBalance),
        budget: form.budget === "" ? undefined : Number(form.budget),
      });
      addToast("Fund prepared for Operations", "success");
      setCreateOpen(false);
      setForm({ name: "", type: "general", openingBalance: "", budget: "" });
      await loadFunds();
    } catch (requestError) {
      addToast(requestError.response?.data?.message || "Unable to create fund", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!fundsEnabled) return <DisabledState />;

  return (
    <AppLayout>
      <div className="max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-saffron-600">Operations</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">Funds</h1>
            <p className="mt-1 text-sm text-stone-500">Trust-scoped balances, commitments, budgets, and transfer approvals.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={refresh} className="rounded-xl border border-stone-200 bg-white p-2.5 text-stone-600 transition-colors hover:bg-stone-50" aria-label="Refresh funds">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </button>
            {canPrepare && (
              <button type="button" onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-xl bg-saffron-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-saffron-500/20 transition-colors hover:bg-saffron-600">
                <Plus size={16} /> Prepare fund
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <label className="flex min-w-64 flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
            Trust context
            <select
              aria-label="Fund trust context"
              value={selectedTrustId}
              onChange={(event) => setSelectedTrustId(event.target.value)}
              disabled={trustsLoading}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-stone-800 outline-none focus:border-saffron-400 focus:ring-2 focus:ring-saffron-100"
            >
              <option value={ALL_TRUSTS_ID}>All trusts (read-only)</option>
              {trusts.map((trust) => <option key={trust.id} value={trust.id}>{trust.name}</option>)}
            </select>
          </label>
          {role === "viewer" && <span className="text-xs font-medium text-stone-500">Viewer access is read-only.</span>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Received" value={totals.received} tone="text-emerald-600" />
          <SummaryCard label="Spent" value={totals.spent} tone="text-rose-600" />
          <SummaryCard label="Committed" value={totals.committed} tone="text-amber-600" />
          <SummaryCard label="Available" value={totals.available} tone={totals.available < 0 ? "text-rose-600" : "text-royal-700"} />
        </div>

        {loading && <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">Loading funds…</div>}
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
        {!loading && !error && funds.length === 0 && (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
            <Landmark size={32} className="mx-auto text-stone-300" />
            <h2 className="mt-3 font-semibold text-stone-800">No funds in this trust context</h2>
            <p className="mt-1 text-sm text-stone-500">Prepare a fund to start tracking restricted and program balances.</p>
          </div>
        )}
        {!loading && !error && funds.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stone-100 bg-stone-50/70 text-xs uppercase tracking-wider text-stone-400">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Fund</th>
                    <th className="px-5 py-3 font-semibold">Type</th>
                    <th className="px-5 py-3 text-right font-semibold">Received</th>
                    <th className="px-5 py-3 text-right font-semibold">Spent</th>
                    <th className="px-5 py-3 text-right font-semibold">Committed</th>
                    <th className="px-5 py-3 text-right font-semibold">Available</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {funds.map((fund) => {
                    const summary = fund.summary || {};
                    return (
                      <tr key={fund.id} className="border-b border-stone-50 last:border-b-0 hover:bg-stone-50/60">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-stone-800">{fund.name}</div>
                          <div className="mt-0.5 text-xs text-stone-400">{fund.code} · {fund.trust_id}</div>
                        </td>
                        <td className="px-5 py-4 capitalize text-stone-600">{fund.fund_type || "general"}</td>
                        <td className="px-5 py-4 text-right font-medium text-emerald-700">{fmt(summary.received)}</td>
                        <td className="px-5 py-4 text-right font-medium text-rose-700">{fmt(summary.spent)}</td>
                        <td className="px-5 py-4 text-right font-medium text-amber-700">{fmt(summary.committed)}</td>
                        <td className={`px-5 py-4 text-right font-bold ${Number(summary.available || 0) < 0 ? "text-rose-700" : "text-royal-700"}`}>{fmt(summary.available)}</td>
                        <td className="px-5 py-4"><StatusBadge status={fund.status} /></td>
                        <td className="px-5 py-4 text-right">
                          <Link className="inline-flex items-center gap-1 text-xs font-semibold text-royal-600 hover:text-royal-800" to={`/operations/funds/${fund.id}?trust_id=${fund.trust_id}`}>
                            Details <ArrowRight size={14} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="create-fund-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 id="create-fund-title" className="text-lg font-bold text-stone-900">Prepare fund</h2>
                <p className="mt-1 text-xs text-stone-500">Opening balances are routed for Admin approval.</p>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg px-2 py-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Close">×</button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <label className="block text-xs font-semibold text-stone-500">Name
                <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 w-full rounded-xl border-2 border-stone-200 px-4 py-2.5 text-sm font-normal text-stone-800 outline-none focus:border-saffron-400" placeholder="e.g. Education Program" />
              </label>
              <label className="block text-xs font-semibold text-stone-500">Fund type
                <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className="mt-1.5 w-full rounded-xl border-2 border-stone-200 px-4 py-2.5 text-sm font-normal text-stone-800 outline-none focus:border-saffron-400">
                  {FUND_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-stone-500">Opening balance
                  <input type="number" min="0" step="0.01" value={form.openingBalance} onChange={(event) => setForm({ ...form, openingBalance: event.target.value })} className="mt-1.5 w-full rounded-xl border-2 border-stone-200 px-4 py-2.5 text-sm font-normal text-stone-800 outline-none focus:border-saffron-400" placeholder="0" />
                </label>
                <label className="block text-xs font-semibold text-stone-500">Budget
                  <input type="number" min="0" step="0.01" value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })} className="mt-1.5 w-full rounded-xl border-2 border-stone-200 px-4 py-2.5 text-sm font-normal text-stone-800 outline-none focus:border-saffron-400" placeholder="Optional" />
                </label>
              </div>
              <button type="submit" disabled={saving} className="w-full rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-saffron-500/20 disabled:opacity-50">
                {saving ? "Preparing…" : "Prepare fund"}
              </button>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
