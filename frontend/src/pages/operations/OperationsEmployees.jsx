import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BriefcaseBusiness, Plus, RefreshCw, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";
import AppLayout from "../../components/AppLayout";
import { useAuth } from "../../lib/AuthContext";
import api from "../../lib/api";
import { ALL_TRUSTS_ID, useOperations } from "../../lib/OperationsContext";
import { isOperationsEnabled } from "../../lib/operationsFlags";
import { useToast } from "../../components/Toast";

const EMPTY_EMPLOYEE = { personId: "", employeeCode: "", startDate: "" };
const EMPTY_SALARY = {
  basic: "",
  allowance: "",
  tds: "",
  pf: "",
  esi: "",
  professionalTax: "",
  effectiveFrom: "",
};

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

function Field({ label, ...props }) {
  return (
    <label className="block text-xs font-semibold text-stone-500">
      {label}
      <input {...props} className="mt-1.5 w-full rounded-xl border-2 border-stone-200 px-3 py-2.5 text-sm font-normal text-stone-800 outline-none transition-colors focus:border-saffron-400 focus:ring-2 focus:ring-saffron-100" />
    </label>
  );
}

export default function OperationsEmployees() {
  const payrollEnabled = isOperationsEnabled("payroll");
  const { profile } = useAuth();
  const { trusts, selectedTrustId, setSelectedTrustId, loading: trustsLoading } = useOperations();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canManage = role === "admin" || role === "accountant";
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [salaryEmployee, setSalaryEmployee] = useState(null);
  const [employeeForm, setEmployeeForm] = useState(EMPTY_EMPLOYEE);
  const [salaryForm, setSalaryForm] = useState(EMPTY_SALARY);
  const [saving, setSaving] = useState(false);

  const loadEmployees = useCallback(async () => {
    if (!payrollEnabled) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get("/v2/operations/payroll/employees", {
        params: { trust_id: selectedTrustId || ALL_TRUSTS_ID },
      });
      setEmployees(Array.isArray(response.data?.result) ? response.data.result : []);
    } catch (requestError) {
      setEmployees([]);
      setError(requestError.response?.data?.message || "Unable to load employees");
    } finally {
      setLoading(false);
    }
  }, [payrollEnabled, selectedTrustId]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  function refresh() {
    setRefreshing(true);
    loadEmployees().finally(() => setTimeout(() => setRefreshing(false), 350));
  }

  function concreteTrustRequired() {
    if (selectedTrustId === ALL_TRUSTS_ID) {
      addToast("Select one trust before changing payroll records", "error");
      return false;
    }
    return true;
  }

  async function createEmployee(event) {
    event.preventDefault();
    if (!concreteTrustRequired()) return;
    setSaving(true);
    try {
      await api.post("/v2/operations/payroll/employees", {
        trust_id: selectedTrustId,
        personId: employeeForm.personId.trim(),
        employeeCode: employeeForm.employeeCode.trim(),
        startDate: employeeForm.startDate,
      });
      addToast("Employee added to the trust", "success");
      setEmployeeOpen(false);
      setEmployeeForm(EMPTY_EMPLOYEE);
      await loadEmployees();
    } catch (requestError) {
      addToast(requestError.response?.data?.message || "Unable to add employee", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveSalary(event) {
    event.preventDefault();
    if (!concreteTrustRequired()) return;
    const basic = Number(salaryForm.basic);
    if (!Number.isFinite(basic) || basic <= 0 || !salaryForm.effectiveFrom) {
      addToast("Basic salary and effective date are required", "error");
      return;
    }
    const components = [
      { code: "basic", name: "Basic", type: "basic", amount: basic },
    ];
    if (salaryForm.allowance !== "") components.push({ code: "allowance", name: "Allowance", type: "allowance", amount: Number(salaryForm.allowance) });
    if (salaryForm.tds !== "") components.push({ code: "tds", name: "TDS", type: "tax", amount: Number(salaryForm.tds) });
    if (salaryForm.pf !== "") components.push({ code: "pf", name: "Employee PF", type: "pf", calculationType: "percentage", base: "basic", amount: Number(salaryForm.pf) });
    if (salaryForm.esi !== "") components.push({ code: "esi", name: "Employee ESI", type: "esi", calculationType: "percentage", base: "gross", amount: Number(salaryForm.esi) });
    if (salaryForm.professionalTax !== "") components.push({ code: "professional_tax", name: "Professional tax", type: "professional_tax", amount: Number(salaryForm.professionalTax) });
    if (components.some((component) => !Number.isFinite(Number(component.amount)) || Number(component.amount) < 0)) {
      addToast("Salary values must be non-negative numbers", "error");
      return;
    }
    setSaving(true);
    try {
      await api.post("/v2/operations/payroll/salary-structures", {
        trust_id: selectedTrustId,
        employeeId: salaryEmployee.id,
        effectiveFrom: salaryForm.effectiveFrom,
        components,
      });
      addToast("Salary structure version saved", "success");
      setSalaryEmployee(null);
      setSalaryForm(EMPTY_SALARY);
    } catch (requestError) {
      addToast(requestError.response?.data?.message || "Unable to save salary structure", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!payrollEnabled) return <DisabledState />;

  return (
    <AppLayout>
      <div className="max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link to="/operations/payroll" className="mt-1 rounded-xl border border-stone-200 bg-white p-2 text-stone-600 transition-colors hover:bg-stone-50" aria-label="Back to payroll">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-saffron-600">Operations payroll</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">Employees</h1>
              <p className="mt-1 text-sm text-stone-500">Trust-specific employment records with versioned salary structures.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={refresh} className="rounded-xl border border-stone-200 bg-white p-2.5 text-stone-600 hover:bg-stone-50" aria-label="Refresh employees">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </button>
            {canManage && <button type="button" onClick={() => setEmployeeOpen(true)} className="flex items-center gap-2 rounded-xl bg-saffron-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-saffron-500/20 hover:bg-saffron-600"><Plus size={16} /> Add employee</button>}
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <label className="flex min-w-64 flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
            Trust context
            <select aria-label="Payroll employee trust context" value={selectedTrustId} onChange={(event) => setSelectedTrustId(event.target.value)} disabled={trustsLoading} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-stone-800 outline-none focus:border-saffron-400 focus:ring-2 focus:ring-saffron-100">
              <option value={ALL_TRUSTS_ID}>All trusts (read-only)</option>
              {trusts.map((trust) => <option key={trust.id} value={trust.id}>{trust.name}</option>)}
            </select>
          </label>
          {!canManage && <span className="text-xs font-medium text-stone-500">Viewer access is read-only.</span>}
        </div>

        {loading && <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">Loading employees…</div>}
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
        {!loading && !error && employees.length === 0 && <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center"><BriefcaseBusiness size={32} className="mx-auto text-stone-300" /><h2 className="mt-3 font-semibold text-stone-800">No employees in this trust context</h2><p className="mt-1 text-sm text-stone-500">Add an employee, then save their first salary structure.</p></div>}
        {!loading && !error && employees.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stone-100 bg-stone-50/70 text-xs uppercase tracking-wider text-stone-400"><tr><th className="px-5 py-3 font-semibold">Employee</th><th className="px-5 py-3 font-semibold">Trust</th><th className="px-5 py-3 font-semibold">Start date</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 text-right" /></tr></thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id} className="border-b border-stone-50 last:border-b-0 hover:bg-stone-50/60">
                      <td className="px-5 py-4"><div className="font-semibold text-stone-800">{employee.employee_code || employee.employeeCode}</div><div className="mt-0.5 text-xs text-stone-400">Person {employee.person_id || employee.personId}</div></td>
                      <td className="px-5 py-4 text-stone-600">{employee.trust_id || employee.trustId}</td>
                      <td className="px-5 py-4 text-stone-600">{employee.start_date || employee.startDate}</td>
                      <td className="px-5 py-4"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200">{employee.status || "active"}</span></td>
                      <td className="px-5 py-4 text-right">{canManage && selectedTrustId !== ALL_TRUSTS_ID && <button type="button" onClick={() => { setSalaryEmployee(employee); setSalaryForm({ ...EMPTY_SALARY, effectiveFrom: employee.start_date || "" }); }} className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-royal-700 hover:bg-stone-50"><WalletCards size={14} /> Salary structure</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {employeeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div role="dialog" aria-modal="true" aria-labelledby="add-employee-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><h2 id="add-employee-title" className="text-lg font-bold text-stone-900">Add employee</h2><p className="mt-1 text-xs text-stone-500">Employee identity stays linked to the shared Operations person record.</p></div><button type="button" onClick={() => setEmployeeOpen(false)} className="rounded-lg px-2 py-1 text-stone-400 hover:bg-stone-100" aria-label="Close">×</button></div><form onSubmit={createEmployee} className="space-y-4"><Field label="Person ID" required value={employeeForm.personId} onChange={(event) => setEmployeeForm({ ...employeeForm, personId: event.target.value })} placeholder="Operations person ID" /><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Employee code" required value={employeeForm.employeeCode} onChange={(event) => setEmployeeForm({ ...employeeForm, employeeCode: event.target.value.toUpperCase() })} placeholder="EMP-001" /><Field label="Start date" required type="date" value={employeeForm.startDate} onChange={(event) => setEmployeeForm({ ...employeeForm, startDate: event.target.value })} /></div><button type="submit" disabled={saving} className="w-full rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Add employee"}</button></form></div></div>
      )}

      {salaryEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div role="dialog" aria-modal="true" aria-labelledby="salary-structure-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><h2 id="salary-structure-title" className="text-lg font-bold text-stone-900">Save salary structure</h2><p className="mt-1 text-xs text-stone-500">{salaryEmployee.employee_code || salaryEmployee.employeeCode} · INR · rules remain configurable for accountant review.</p></div><button type="button" onClick={() => setSalaryEmployee(null)} className="rounded-lg px-2 py-1 text-stone-400 hover:bg-stone-100" aria-label="Close">×</button></div><form onSubmit={saveSalary} className="space-y-4"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Effective from" required type="date" value={salaryForm.effectiveFrom} onChange={(event) => setSalaryForm({ ...salaryForm, effectiveFrom: event.target.value })} /><Field label="Basic salary (INR)" required type="number" min="0" step="0.01" value={salaryForm.basic} onChange={(event) => setSalaryForm({ ...salaryForm, basic: event.target.value })} /></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Allowance (INR)" type="number" min="0" step="0.01" value={salaryForm.allowance} onChange={(event) => setSalaryForm({ ...salaryForm, allowance: event.target.value })} /><Field label="TDS (INR)" type="number" min="0" step="0.01" value={salaryForm.tds} onChange={(event) => setSalaryForm({ ...salaryForm, tds: event.target.value })} /><Field label="PF (% of basic)" type="number" min="0" step="0.01" value={salaryForm.pf} onChange={(event) => setSalaryForm({ ...salaryForm, pf: event.target.value })} /><Field label="ESI (% of gross)" type="number" min="0" step="0.01" value={salaryForm.esi} onChange={(event) => setSalaryForm({ ...salaryForm, esi: event.target.value })} /><Field label="Professional tax (INR)" type="number" min="0" step="0.01" value={salaryForm.professionalTax} onChange={(event) => setSalaryForm({ ...salaryForm, professionalTax: event.target.value })} /></div><button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save structure version"}</button></form></div></div>
      )}
    </AppLayout>
  );
}
