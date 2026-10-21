import { useCallback, useEffect, useState } from "react";
import { Building2, Edit3, Plus, RefreshCw } from "lucide-react";
import OperationsLayout from "../../components/operations/OperationsLayout";
import StatusBadge from "../../components/operations/StatusBadge";
import operationsApi, { getRoleCapabilities, requestErrorMessage } from "../../lib/operationsApi";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron-300 focus-visible:ring-offset-2";
const EMPTY_TRUST = {
  code: "",
  name: "",
  legal_name: "",
  registration_number: "",
  pan: "",
  section_80g_number: "",
  section_12a_number: "",
  default_currency: "INR",
  timezone: "Asia/Kolkata",
  financial_year_start_month: "4",
  is_active: true,
};

function Field({ label, ...props }) {
  return (
    <label className="block text-xs font-semibold text-stone-600">
      {label}
      <input {...props} className={`mt-1.5 w-full rounded-xl border-2 border-stone-200 px-3 py-2.5 text-sm font-normal text-stone-800 outline-none transition-colors focus:border-saffron-400 focus:ring-2 focus:ring-saffron-100 ${focusRing}`} />
    </label>
  );
}

export default function OperationsTrusts() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const capabilities = getRoleCapabilities(profile?.role || "viewer");
  const [trusts, setTrusts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrust, setEditingTrust] = useState(null);
  const [form, setForm] = useState(EMPTY_TRUST);
  const [saving, setSaving] = useState(false);

  const loadTrusts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTrusts(await operationsApi.getTrusts());
    } catch (requestError) {
      setTrusts([]);
      setError(requestErrorMessage(requestError, "Unable to load Operations trusts"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrusts();
  }, [loadTrusts]);

  function refresh() {
    setRefreshing(true);
    loadTrusts().finally(() => setRefreshing(false));
  }

  function openCreate() {
    setEditingTrust(null);
    setForm(EMPTY_TRUST);
    setModalOpen(true);
  }

  function openEdit(trust) {
    setEditingTrust(trust);
    setForm({ ...EMPTY_TRUST, ...trust, financial_year_start_month: String(trust.financial_year_start_month || 4) });
    setModalOpen(true);
  }

  function closeModal() {
    if (!saving) setModalOpen(false);
  }

  async function saveTrust(event) {
    event.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      addToast("Trust code and name are required", "error");
      return;
    }
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      legal_name: form.legal_name.trim() || null,
      registration_number: form.registration_number.trim() || null,
      pan: form.pan.trim().toUpperCase() || null,
      section_80g_number: form.section_80g_number.trim() || null,
      section_12a_number: form.section_12a_number.trim() || null,
      default_currency: form.default_currency.trim().toUpperCase(),
      timezone: form.timezone.trim(),
      financial_year_start_month: Number(form.financial_year_start_month),
      is_active: Boolean(form.is_active),
    };
    setSaving(true);
    try {
      if (editingTrust) await operationsApi.updateTrust(editingTrust.id, payload);
      else await operationsApi.createTrust(payload);
      addToast(editingTrust ? "Trust details updated" : "Trust added", "success");
      setModalOpen(false);
      await loadTrusts();
    } catch (requestError) {
      addToast(requestErrorMessage(requestError, "Unable to save trust"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <OperationsLayout
      title="Trusts"
      description="Maintain the active trust registry used by the additive Operations modules. Legal and statutory identifiers stay trust-scoped."
      feature="trusts"
      actions={(
        <>
          <button type="button" onClick={refresh} className={`inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 ${focusRing}`} aria-label="Refresh trusts">
            <RefreshCw size={16} className={refreshing ? "motion-safe:animate-spin" : ""} aria-hidden="true" />
            Refresh
          </button>
          {capabilities.canManage && <button type="button" onClick={openCreate} className={`inline-flex items-center gap-2 rounded-xl bg-saffron-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-saffron-500/20 hover:bg-saffron-600 ${focusRing}`}><Plus size={16} aria-hidden="true" />Add trust</button>}
        </>
      )}
    >
      {!capabilities.canManage && <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">Trust management is restricted to Admins. You can still view active trust details.</div>}
      {loading && <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500" role="status">Loading trusts…</div>}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert">{error}</div>}
      {!loading && !error && trusts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <Building2 size={32} className="mx-auto text-stone-300" aria-hidden="true" />
          <h2 className="mt-3 font-semibold text-stone-800">No active trusts</h2>
          <p className="mt-1 text-sm text-stone-500">{capabilities.canManage ? "Add the first trust to make it available to Operations." : "An Admin has not configured an active trust yet."}</p>
        </div>
      )}
      {!loading && !error && trusts.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <caption className="sr-only">Operations trusts</caption>
              <thead className="border-b border-stone-100 bg-stone-50/70 text-xs uppercase tracking-wider text-stone-400"><tr><th scope="col" className="px-5 py-3 font-semibold">Trust</th><th scope="col" className="px-5 py-3 font-semibold">Legal name</th><th scope="col" className="px-5 py-3 font-semibold">Currency / timezone</th><th scope="col" className="px-5 py-3 font-semibold">Financial year</th><th scope="col" className="px-5 py-3 font-semibold">Status</th><th scope="col" className="px-5 py-3 text-right">Actions</th></tr></thead>
              <tbody>
                {trusts.map((trust) => (
                  <tr key={trust.id} className="border-b border-stone-50 last:border-b-0 hover:bg-stone-50/60">
                    <td className="px-5 py-4"><div className="font-semibold text-stone-800">{trust.name}</div><div className="mt-1 text-xs text-stone-400">{trust.code} · {trust.id}</div></td>
                    <td className="px-5 py-4 text-stone-600">{trust.legal_name || "—"}<div className="mt-1 text-xs text-stone-400">PAN {trust.pan || "not configured"}</div></td>
                    <td className="px-5 py-4 text-stone-600">{trust.default_currency || "INR"}<div className="mt-1 text-xs text-stone-400">{trust.timezone || "Asia/Kolkata"}</div></td>
                    <td className="px-5 py-4 text-stone-600">April–March<div className="mt-1 text-xs text-stone-400">Starts month {trust.financial_year_start_month || 4}</div></td>
                    <td className="px-5 py-4"><StatusBadge status={trust.is_active === false ? "cancelled" : "active"} label={trust.is_active === false ? "Inactive" : "Active"} /></td>
                    <td className="px-5 py-4 text-right">{capabilities.canManage ? <button type="button" onClick={() => openEdit(trust)} className={`inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-royal-700 hover:bg-stone-50 ${focusRing}`}><Edit3 size={14} aria-hidden="true" />Edit</button> : <span className="text-xs text-stone-400">Read only</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && capabilities.canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="trust-form-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id="trust-form-title" className="text-lg font-bold text-stone-900">{editingTrust ? "Edit trust" : "Add trust"}</h2><p className="mt-1 text-xs leading-5 text-stone-500">These values are saved to the Operations trust registry. Secrets and provider credentials are not accepted here.</p></div><button type="button" onClick={closeModal} className={`rounded-lg px-2 py-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 ${focusRing}`} aria-label="Close trust form">×</button></div>
            <form onSubmit={saveTrust} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Trust code" required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="TRUST-A" /><Field label="Display name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Example Trust" /></div>
              <Field label="Legal name" value={form.legal_name} onChange={(event) => setForm({ ...form, legal_name: event.target.value })} placeholder="Registered legal name" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Registration number" value={form.registration_number} onChange={(event) => setForm({ ...form, registration_number: event.target.value })} /><Field label="PAN" maxLength={10} value={form.pan} onChange={(event) => setForm({ ...form, pan: event.target.value.toUpperCase() })} /></div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="80G number" value={form.section_80g_number} onChange={(event) => setForm({ ...form, section_80g_number: event.target.value })} /><Field label="12A number" value={form.section_12a_number} onChange={(event) => setForm({ ...form, section_12a_number: event.target.value })} /></div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><Field label="Currency" maxLength={3} value={form.default_currency} onChange={(event) => setForm({ ...form, default_currency: event.target.value.toUpperCase() })} /><Field label="Timezone" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} /><Field label="Financial year start month" type="number" min="1" max="12" value={form.financial_year_start_month} onChange={(event) => setForm({ ...form, financial_year_start_month: event.target.value })} /></div>
              {editingTrust && <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} className="h-4 w-4 accent-orange-500" />Active trust</label>}
              <div className="flex justify-end gap-2 border-t border-stone-100 pt-4"><button type="button" onClick={closeModal} className={`rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 ${focusRing}`}>Cancel</button><button type="submit" disabled={saving} className={`rounded-xl bg-saffron-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-saffron-600 disabled:opacity-50 ${focusRing}`}>{saving ? "Saving…" : editingTrust ? "Save changes" : "Add trust"}</button></div>
            </form>
          </div>
        </div>
      )}
    </OperationsLayout>
  );
}
