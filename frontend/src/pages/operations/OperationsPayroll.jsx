import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, Plus, RefreshCw, UsersRound, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";
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

function StatusBadge({ status }) {
  const styles = {
    pending_approval: "bg-amber-50 text-amber-700 ring-amber-200",
    approved: "bg-sky-50 text-sky-700 ring-sky-200",
    posted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    paid: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    draft: "bg-stone-100 text-stone-600 ring-stone-200",
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${styles[status] || styles.draft}`}>{String(status || "draft").replaceAll("_", " ")}</span>;
}

function DisabledState() {
  return (
    <AppLayout>
      <section className="max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-amber-900">Payroll is not enabled</h1>
        <p className="mt-2 text-sm text-amber-800">Enable ENABLE_OPERATIONS_PAYROLL for the additive Operations payroll surface.</p>
      </section>
    </AppLayout>
  );
}

export default function OperationsPayroll() {
  const payrollEnabled = isOperationsEnabled("payroll");
  const { profile } = useAuth();
  const { trusts, selectedTrustId, setSelectedTrustId, loading: trustsLoading } = useOperations();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canPrepare = role === "admin" || role === "accountant";
  const canApprove = role === "admin";
  const [employees, setEmployees] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [period, setPeriod] = useState("");
  const [paymentReferences, setPaymentReferences] = useState({});
  const [payslips, setPayslips] = useState({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!payrollEnabled) return;
    setLoading(true);
    setError(null);
    try {
      const [employeeResponse, runResponse] = await Promise.all([
        api.get("/v2/operations/payroll/employees", { params: { trust_id: selectedTrustId || ALL_TRUSTS_ID } }),
        api.get("/v2/operations/payroll/runs", { params: { trust_id: selectedTrustId || ALL_TRUSTS_ID } }),
      ]);
      setEmployees(Array.isArray(employeeResponse.data?.result) ? employeeResponse.data.result : []);
      setRuns(Array.isArray(runResponse.data?.result) ? runResponse.data.result : []);
    } catch (requestError) {
      setEmployees([]);
      setRuns([]);
      setError(requestError.response?.data?.message || "Unable to load payroll");
    } finally {
      setLoading(false);
    }
  }, [payrollEnabled, selectedTrustId]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => runs.reduce((result, run) => ({
    gross: result.gross + Number(run.gross_total || run.grossTotal || 0),
    net: result.net + Number(run.net_total || run.netTotal || 0),
    pending: result.pending + (run.status === "pending_approval" ? 1 : 0),
  }), { gross: 0, net: 0, pending: 0 }), [runs]);

  function refresh() {
    setRefreshing(true);
    load().finally(() => setTimeout(() => setRefreshing(false), 350));
  }

  function toggleEmployee(employeeId) {
    setSelectedEmployees((current) => current.includes(employeeId)
      ? current.filter((id) => id !== employeeId)
      : [...current, employeeId]);
  }

  async function prepareRun(event) {
    event.preventDefault();
    if (selectedTrustId === ALL_TRUSTS_ID) {
      addToast("Select one trust before preparing payroll", "error");
      return;
    }
    if (!period || selectedEmployees.length === 0) {
      addToast("Select a payroll month and at least one employee", "error");
      return;
    }
    setSaving(true);
    try {
      await api.post("/v2/operations/payroll/runs", {
        trust_id: selectedTrustId,
        period,
        employeeIds: selectedEmployees,
      });
      addToast("Payroll prepared for Admin approval", "success");
      setSelectedEmployees([]);
      await load();
    } catch (requestError) {
      addToast(requestError.response?.data?.message || "Unable to prepare payroll", "error");
    } finally {
      setSaving(false);
    }
  }

  async function approveRun(run) {
    try {
      await api.post(`/v2/operations/payroll/runs/${run.id}/approve`, { trust_id: run.trust_id || selectedTrustId }, { params: { trust_id: run.trust_id || selectedTrustId } });
      addToast("Payroll approved, posted, and payslips issued", "success");
      await load();
    } catch (requestError) {
      addToast(requestError.response?.data?.message || "Unable to approve payroll", "error");
    }
  }

  async function recordPayment(run) {
    const paymentReference = String(paymentReferences[run.id] || "").trim();
    if (!paymentReference) {
      addToast("Enter the bank payment reference first", "error");
      return;
    }
    try {
      await api.post(`/v2/operations/payroll/runs/${run.id}/payment`, { trust_id: run.trust_id || selectedTrustId, paymentReference }, { params: { trust_id: run.trust_id || selectedTrustId } });
      addToast("Payroll payment marked completed", "success");
      await load();
    } catch (requestError) {
      addToast(requestError.response?.data?.message || "Unable to record payroll payment", "error");
    }
  }

  async function loadPayslips(run) {
    try {
      const response = await api.get(`/v2/operations/payroll/runs/${run.id}/payslips`, { params: { trust_id: run.trust_id || selectedTrustId } });
      setPayslips((current) => ({ ...current, [run.id]: Array.isArray(response.data?.result) ? response.data.result : [] }));
    } catch (requestError) {
      addToast(requestError.response?.data?.message || "Unable to load payslips", "error");
    }
  }

  if (!payrollEnabled) return <DisabledState />;

  return (
    <AppLayout>
      <div className="max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-saffron-600">Operations</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">Payroll</h1>
            <p className="mt-1 text-sm text-stone-500">Prepare INR payroll in Asia/Kolkata, approve it, then track payment separately.</p>
          </div>
          <div className="flex items-center gap-2"><Link to="/operations/payroll/employees" className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-royal-700 hover:bg-stone-50"><UsersRound size={16} /> Employees</Link><button type="button" onClick={refresh} className="rounded-xl border border-stone-200 bg-white p-2.5 text-stone-600 hover:bg-stone-50" aria-label="Refresh payroll"><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /></button></div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <label className="flex min-w-64 flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">Trust context<select aria-label="Payroll trust context" value={selectedTrustId} onChange={(event) => setSelectedTrustId(event.target.value)} disabled={trustsLoading} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-stone-800 outline-none focus:border-saffron-400 focus:ring-2 focus:ring-saffron-100"><option value={ALL_TRUSTS_ID}>All trusts (read-only)</option>{trusts.map((trust) => <option key={trust.id} value={trust.id}>{trust.name}</option>)}</select></label>{role === "viewer" && <span className="text-xs font-medium text-stone-500">Viewer access is read-only.</span>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm"><div className="text-xs font-medium uppercase tracking-wider text-stone-400">Gross prepared</div><div className="mt-2 text-2xl font-bold text-stone-900">{fmt(totals.gross)}</div></div><div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm"><div className="text-xs font-medium uppercase tracking-wider text-stone-400">Net payable</div><div className="mt-2 text-2xl font-bold text-royal-700">{fmt(totals.net)}</div></div><div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm"><div className="text-xs font-medium uppercase tracking-wider text-stone-400">Awaiting approval</div><div className="mt-2 text-2xl font-bold text-amber-600">{totals.pending}</div></div></div>

        {canPrepare && (
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"><div className="mb-4 flex items-center gap-2"><Plus size={17} className="text-saffron-600" /><h2 className="font-semibold text-stone-800">Prepare monthly run</h2></div><form onSubmit={prepareRun} className="space-y-4"><div className="flex flex-wrap items-end gap-4"><label className="min-w-52 text-xs font-semibold text-stone-500">Payroll month<input required type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="mt-1.5 w-full rounded-xl border-2 border-stone-200 px-3 py-2.5 text-sm font-normal text-stone-800 outline-none focus:border-saffron-400" /></label><span className="pb-2 text-xs text-stone-500">Financial year follows April–March. Admin approval is mandatory before posting.</span></div><div className="rounded-xl border border-stone-100 bg-stone-50/60 p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">Employees in this run</span><span className="text-xs text-stone-400">{selectedEmployees.length} selected</span></div>{employees.length === 0 ? <p className="text-sm text-stone-500">No employees yet. <Link className="font-semibold text-royal-700" to="/operations/payroll/employees">Add an employee</Link>.</p> : <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{employees.filter((employee) => ["active", "on_leave"].includes(employee.status || "active")).map((employee) => <label key={employee.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-700 hover:border-saffron-300"><input type="checkbox" checked={selectedEmployees.includes(employee.id)} onChange={() => toggleEmployee(employee.id)} className="h-4 w-4 accent-orange-500" /><span><span className="block font-semibold">{employee.employee_code || employee.employeeCode}</span><span className="text-xs text-stone-400">{employee.person_id || employee.personId}</span></span></label>)}</div>}</div><button type="submit" disabled={saving || selectedTrustId === ALL_TRUSTS_ID} className="rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-saffron-500/20 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Preparing…" : "Prepare for approval"}</button></form></section>
        )}

        {loading && <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">Loading payroll runs…</div>}
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
        {!loading && !error && runs.length === 0 && <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center"><ClipboardList size={32} className="mx-auto text-stone-300" /><h2 className="mt-3 font-semibold text-stone-800">No payroll runs in this trust context</h2><p className="mt-1 text-sm text-stone-500">Prepare a monthly run after employee salary structures are configured.</p></div>}
        {!loading && !error && runs.length > 0 && <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-stone-100 bg-stone-50/70 text-xs uppercase tracking-wider text-stone-400"><tr><th className="px-5 py-3 font-semibold">Run</th><th className="px-5 py-3 font-semibold">Period</th><th className="px-5 py-3 text-right font-semibold">Gross</th><th className="px-5 py-3 text-right font-semibold">Net</th><th className="px-5 py-3 font-semibold">Approval</th><th className="px-5 py-3 font-semibold">Payment</th><th className="px-5 py-3" /></tr></thead><tbody>{runs.map((run) => { const runPayslips = payslips[run.id]; const isPosted = ["posted", "paid"].includes(run.status); return <tr key={run.id} className="border-b border-stone-50 last:border-b-0 hover:bg-stone-50/60"><td className="px-5 py-4"><div className="font-semibold text-stone-800">{run.run_number || run.runNumber || run.id}</div><div className="mt-0.5 text-xs text-stone-400">{run.trust_id || run.trustId}</div></td><td className="px-5 py-4 text-stone-600">{run.period_name || run.periodName || run.period?.periodName || "—"}</td><td className="px-5 py-4 text-right font-medium text-stone-700">{fmt(run.gross_total || run.grossTotal)}</td><td className="px-5 py-4 text-right font-semibold text-royal-700">{fmt(run.net_total || run.netTotal)}</td><td className="px-5 py-4"><StatusBadge status={run.status} /></td><td className="px-5 py-4"><span className="text-xs font-semibold text-stone-500">{run.payment_status || run.paymentStatus || (isPosted ? "Pending" : "Not available")}</span></td><td className="px-5 py-4"><div className="flex flex-wrap items-center justify-end gap-2">{canApprove && run.status === "pending_approval" && <button type="button" onClick={() => approveRun(run)} className="inline-flex items-center gap-1 rounded-lg bg-royal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-royal-700"><Check size={14} /> Approve &amp; post</button>}{isPosted && <button type="button" onClick={() => loadPayslips(run)} className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-royal-700 hover:bg-stone-50"><WalletCards size={14} /> Payslips</button>}{isPosted && canPrepare && <div className="flex items-center gap-1"><input aria-label={`Payment reference for ${run.run_number || run.id}`} value={paymentReferences[run.id] || ""} onChange={(event) => setPaymentReferences((current) => ({ ...current, [run.id]: event.target.value }))} placeholder="Bank reference" className="w-32 rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-saffron-400" /><button type="button" onClick={() => recordPayment(run)} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Record payment</button></div>}</div>{Array.isArray(runPayslips) && <div className="mt-3 space-y-1 text-right">{runPayslips.map((payslip) => <div key={payslip.id} className="text-xs text-stone-500">{payslip.payslip_number || payslip.payslipNumber} · {fmt(payslip.net_amount || payslip.netAmount)} · <span className="text-emerald-700">{payslip.status}</span></div>)}</div>}</td></tr>; })}</tbody></table></div></div>}
      </div>
    </AppLayout>
  );
}
