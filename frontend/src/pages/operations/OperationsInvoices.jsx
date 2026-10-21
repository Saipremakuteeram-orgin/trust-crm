import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, FileText, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import AppLayout from "../../components/AppLayout";
import { useAuth } from "../../lib/AuthContext";
import api from "../../lib/api";
import { ALL_TRUSTS_ID, useOperations } from "../../lib/OperationsContext";
import { isOperationsEnabled } from "../../lib/operationsFlags";
import { useToast } from "../../components/Toast";

const EMPTY_LINE = { description: "", quantity: "1", rate: "", taxAmount: "0" };

function formatMoney(value, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function StatusBadge({ status }) {
  const styles = {
    draft: "bg-stone-100 text-stone-600 ring-stone-200",
    pending_approval: "bg-amber-50 text-amber-700 ring-amber-200",
    approved: "bg-sky-50 text-sky-700 ring-sky-200",
    sent: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    partially_paid: "bg-orange-50 text-orange-700 ring-orange-200",
    paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    overdue: "bg-rose-50 text-rose-700 ring-rose-200",
    cancelled: "bg-stone-100 text-stone-500 ring-stone-200",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${styles[status] || styles.draft}`}>
      {(status || "draft").replaceAll("_", " ")}
    </span>
  );
}

function DisabledState() {
  return (
    <AppLayout>
      <section className="max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-amber-900">Invoice management is not enabled</h1>
        <p className="mt-2 text-sm text-amber-800">Enable ENABLE_OPERATIONS_INVOICES for the additive Operations invoice surface.</p>
      </section>
    </AppLayout>
  );
}

function SummaryCard({ label, value, tone = "text-stone-900" }) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-stone-400">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${tone}`}>{formatMoney(value)}</div>
    </div>
  );
}

function lineTotal(line) {
  return (Number(line.quantity || 0) * Number(line.rate || 0));
}

export default function OperationsInvoices() {
  const invoicesEnabled = isOperationsEnabled("invoices");
  const { profile } = useAuth();
  const { trusts, selectedTrustId, setSelectedTrustId, loading: trustsLoading } = useOperations();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canPrepare = role === "admin" || role === "accountant";
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ personId: "", dueDate: "", currency: "INR", recipientEmail: "", lines: [{ ...EMPTY_LINE }] });

  const loadInvoices = useCallback(async () => {
    if (!invoicesEnabled) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get("/v2/operations/invoices", { params: { trust_id: selectedTrustId || ALL_TRUSTS_ID } });
      setInvoices(Array.isArray(response.data?.result) ? response.data.result : []);
    } catch (requestError) {
      setInvoices([]);
      setError(requestError.response?.data?.message || "Unable to load invoices");
    } finally {
      setLoading(false);
    }
  }, [invoicesEnabled, selectedTrustId]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const totals = useMemo(() => invoices.reduce((result, invoice) => ({
    total: result.total + Number(invoice.total_amount || invoice.totalAmount || 0),
    paid: result.paid + Number(invoice.paid_amount || invoice.paidAmount || 0),
    overdue: result.overdue + (invoice.status === "overdue" ? Number(invoice.total_amount || invoice.totalAmount || 0) - Number(invoice.paid_amount || invoice.paidAmount || 0) : 0),
  }), { total: 0, paid: 0, overdue: 0 }), [invoices]);

  function refresh() {
    setRefreshing(true);
    loadInvoices().finally(() => setTimeout(() => setRefreshing(false), 350));
  }

  function updateLine(index, patch) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    }));
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (selectedTrustId === ALL_TRUSTS_ID) {
      addToast("Select one trust before creating an invoice", "error");
      return;
    }
    if (!form.personId.trim() || !form.dueDate) {
      addToast("Person and due date are required", "error");
      return;
    }
    const lines = form.lines.map((line) => ({
      description: line.description.trim(),
      quantity: Number(line.quantity),
      rate: Number(line.rate),
      taxAmount: Number(line.taxAmount || 0),
    }));
    if (lines.some((line) => !line.description || line.quantity <= 0 || line.rate <= 0)) {
      addToast("Every line needs a description, positive quantity, and positive rate", "error");
      return;
    }
    const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
    const taxAmount = lines.reduce((sum, line) => sum + line.taxAmount, 0);
    setSaving(true);
    try {
      await api.post("/v2/operations/invoices", {
        trust_id: selectedTrustId,
        personId: form.personId.trim(),
        dueDate: form.dueDate,
        currency: form.currency.trim().toUpperCase(),
        recipientEmail: form.recipientEmail.trim() || undefined,
        lines,
        subtotal,
        taxAmount,
        totalAmount: subtotal + taxAmount,
      });
      addToast("Invoice draft created", "success");
      setCreateOpen(false);
      setForm({ personId: "", dueDate: "", currency: "INR", recipientEmail: "", lines: [{ ...EMPTY_LINE }] });
      await loadInvoices();
    } catch (requestError) {
      addToast(requestError.response?.data?.message || "Unable to create invoice", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!invoicesEnabled) return <DisabledState />;

  return (
    <AppLayout>
      <div className="max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-saffron-600">Operations</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">Invoices</h1>
            <p className="mt-1 text-sm text-stone-500">Trust-scoped invoice approval, delivery, and payment allocation.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={refresh} className="rounded-xl border border-stone-200 bg-white p-2.5 text-stone-600 transition-colors hover:bg-stone-50" aria-label="Refresh invoices">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </button>
            {canPrepare && (
              <button type="button" onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-xl bg-saffron-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-saffron-500/20 transition-colors hover:bg-saffron-600">
                <Plus size={16} /> Prepare invoice
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <label className="flex min-w-64 flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
            Trust context
            <select aria-label="Invoice trust context" value={selectedTrustId} onChange={(event) => setSelectedTrustId(event.target.value)} disabled={trustsLoading} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-stone-800 outline-none focus:border-saffron-400 focus:ring-2 focus:ring-saffron-100">
              <option value={ALL_TRUSTS_ID}>All trusts (read-only)</option>
              {trusts.map((trust) => <option key={trust.id} value={trust.id}>{trust.name}</option>)}
            </select>
          </label>
          {role === "viewer" && <span className="text-xs font-medium text-stone-500">Viewer access is read-only.</span>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard label="Invoiced" value={totals.total} />
          <SummaryCard label="Allocated payments" value={totals.paid} tone="text-emerald-600" />
          <SummaryCard label="Overdue balance" value={totals.overdue} tone="text-rose-600" />
        </div>

        {loading && <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">Loading invoices…</div>}
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
        {!loading && !error && invoices.length === 0 && (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
            <FileText size={32} className="mx-auto text-stone-300" />
            <h2 className="mt-3 font-semibold text-stone-800">No invoices in this trust context</h2>
            <p className="mt-1 text-sm text-stone-500">Prepare an invoice draft to start the approval and payment lifecycle.</p>
          </div>
        )}
        {!loading && !error && invoices.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stone-100 bg-stone-50/70 text-xs uppercase tracking-wider text-stone-400">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Invoice</th>
                    <th className="px-5 py-3 font-semibold">Trust / person</th>
                    <th className="px-5 py-3 font-semibold">Due</th>
                    <th className="px-5 py-3 text-right font-semibold">Total</th>
                    <th className="px-5 py-3 text-right font-semibold">Paid</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-stone-50 last:border-b-0 hover:bg-stone-50/60">
                      <td className="px-5 py-4"><div className="font-semibold text-stone-800">{invoice.invoice_number || invoice.invoiceNumber || invoice.id}</div><div className="mt-0.5 text-xs text-stone-400">{invoice.id}</div></td>
                      <td className="px-5 py-4"><div className="font-medium text-stone-700">{invoice.trust?.name || invoice.trust_id}</div><div className="mt-0.5 text-xs text-stone-400">{invoice.person?.full_name || invoice.person_id}</div></td>
                      <td className="px-5 py-4 text-stone-600">{invoice.due_date || invoice.dueDate || "—"}</td>
                      <td className="px-5 py-4 text-right font-semibold text-stone-800">{formatMoney(invoice.total_amount || invoice.totalAmount, invoice.currency)}</td>
                      <td className="px-5 py-4 text-right font-medium text-emerald-700">{formatMoney(invoice.paid_amount || invoice.paidAmount, invoice.currency)}</td>
                      <td className="px-5 py-4"><StatusBadge status={invoice.status} /></td>
                      <td className="px-5 py-4 text-right"><Link className="inline-flex items-center gap-1 text-xs font-semibold text-royal-600 hover:text-royal-800" to={`/operations/invoices/${invoice.id}?trust_id=${invoice.trust_id}`}>Details <ArrowRight size={14} /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="create-invoice-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between"><div><h2 id="create-invoice-title" className="text-lg font-bold text-stone-900">Prepare invoice</h2><p className="mt-1 text-xs text-stone-500">Manual invoices remain drafts until an Admin approves and sends them.</p></div><button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg px-2 py-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Close">×</button></div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="block text-xs font-semibold text-stone-500">Person ID<input required value={form.personId} onChange={(event) => setForm({ ...form, personId: event.target.value })} className="mt-1.5 w-full rounded-xl border-2 border-stone-200 px-3 py-2.5 text-sm font-normal text-stone-800 outline-none focus:border-saffron-400" placeholder="Operations person ID" /></label>
                <label className="block text-xs font-semibold text-stone-500">Due date<input required type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="mt-1.5 w-full rounded-xl border-2 border-stone-200 px-3 py-2.5 text-sm font-normal text-stone-800 outline-none focus:border-saffron-400" /></label>
                <label className="block text-xs font-semibold text-stone-500">Currency<input required maxLength="3" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} className="mt-1.5 w-full rounded-xl border-2 border-stone-200 px-3 py-2.5 text-sm font-normal text-stone-800 outline-none focus:border-saffron-400" /></label>
              </div>
              <label className="block text-xs font-semibold text-stone-500">Recipient email<input type="email" value={form.recipientEmail} onChange={(event) => setForm({ ...form, recipientEmail: event.target.value })} className="mt-1.5 w-full rounded-xl border-2 border-stone-200 px-3 py-2.5 text-sm font-normal text-stone-800 outline-none focus:border-saffron-400" placeholder="customer@example.com" /></label>
              <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-stone-800">Line items</h3><button type="button" onClick={() => setForm({ ...form, lines: [...form.lines, { ...EMPTY_LINE }] })} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-royal-600 hover:bg-stone-50">Add line</button></div>{form.lines.map((line, index) => <div key={`line-${index}`} className="grid grid-cols-1 gap-3 rounded-xl border border-stone-100 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"><input required value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} className="rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-saffron-400" placeholder="Description" /><input required type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} className="rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-saffron-400" placeholder="Qty" /><input required type="number" min="0.0001" step="0.0001" value={line.rate} onChange={(event) => updateLine(index, { rate: event.target.value })} className="rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-saffron-400" placeholder="Rate" /><input type="number" min="0" step="0.0001" value={line.taxAmount} onChange={(event) => updateLine(index, { taxAmount: event.target.value })} className="rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-saffron-400" placeholder="Tax" />{form.lines.length > 1 ? <button type="button" onClick={() => setForm({ ...form, lines: form.lines.filter((_, lineIndex) => lineIndex !== index) })} className="rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove line ${index + 1}`}><Trash2 size={16} /></button> : <span />}</div>)}</div>
              <button type="submit" disabled={saving} className="w-full rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-saffron-500/20 disabled:opacity-50">{saving ? "Preparing…" : "Create draft"}</button>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
