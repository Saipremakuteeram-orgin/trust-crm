import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, RefreshCw, Send, XCircle } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import AppLayout from "../../components/AppLayout";
import { useAuth } from "../../lib/AuthContext";
import api from "../../lib/api";
import { ALL_TRUSTS_ID, useOperations } from "../../lib/OperationsContext";
import { isOperationsEnabled } from "../../lib/operationsFlags";
import { useToast } from "../../components/Toast";

function formatMoney(value, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function StatusBadge({ status }) {
  const tones = { draft: "bg-stone-100 text-stone-600", pending_approval: "bg-amber-50 text-amber-700", sent: "bg-indigo-50 text-indigo-700", partially_paid: "bg-orange-50 text-orange-700", paid: "bg-emerald-50 text-emerald-700", overdue: "bg-rose-50 text-rose-700", cancelled: "bg-stone-100 text-stone-500" };
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${tones[status] || tones.draft}`}>{(status || "draft").replaceAll("_", " ")}</span>;
}

function DisabledState() {
  return <AppLayout><section className="max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6"><h1 className="text-xl font-bold text-amber-900">Invoice management is not enabled</h1><p className="mt-2 text-sm text-amber-800">Enable ENABLE_OPERATIONS_INVOICES to view invoice details.</p></section></AppLayout>;
}

function Metric({ label, value, tone = "text-stone-900", currency }) {
  return <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm"><div className="text-xs font-medium uppercase tracking-wider text-stone-400">{label}</div><div className={`mt-2 text-2xl font-bold ${tone}`}>{formatMoney(value, currency)}</div></div>;
}

export default function OperationsInvoiceDetail() {
  const invoicesEnabled = isOperationsEnabled("invoices");
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
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [payment, setPayment] = useState({ amount: "", paymentReference: "" });
  const [savingPayment, setSavingPayment] = useState(false);

  const load = useCallback(async () => {
    if (!invoicesEnabled || !id || !trustId || trustId === ALL_TRUSTS_ID) {
      if (trustId === ALL_TRUSTS_ID) setError("Select a concrete trust to view an invoice detail");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/v2/operations/invoices/${id}`, { params: { trust_id: trustId } });
      setInvoice(response.data?.result || null);
    } catch (requestError) {
      setInvoice(null);
      setError(requestError.response?.data?.message || "Unable to load invoice detail");
    } finally {
      setLoading(false);
    }
  }, [invoicesEnabled, id, trustId]);

  useEffect(() => { load(); }, [load]);

  function refresh() {
    setRefreshing(true);
    load().finally(() => setTimeout(() => setRefreshing(false), 350));
  }

  async function postAction(path, body, successMessage) {
    try {
      await api.post(`/v2/operations/invoices/${id}/${path}`, body, { params: { trust_id: trustId } });
      addToast(successMessage, "success");
      await load();
    } catch (requestError) {
      addToast(requestError.response?.data?.message || "Invoice action failed", "error");
    }
  }

  async function submit() { await postAction("submit", {}, "Invoice submitted for Admin approval"); }
  async function approve() { await postAction("approve", {}, "Invoice approved and queued for delivery"); }
  async function reject() {
    const reason = window.prompt("Reason for rejecting this invoice:");
    if (reason?.trim()) await postAction("reject", { reason: reason.trim() }, "Invoice returned to draft");
  }
  async function cancelAndReissue() {
    const reason = window.prompt("Reason for cancelling and reissuing this invoice:");
    if (reason?.trim()) await postAction("cancel-and-reissue", { reason: reason.trim() }, "Invoice cancelled and replacement draft created");
  }
  async function recordPayment(event) {
    event.preventDefault();
    if (!payment.amount || !payment.paymentReference.trim()) {
      addToast("Amount and payment reference are required", "error");
      return;
    }
    setSavingPayment(true);
    try {
      await api.post(`/v2/operations/invoices/${id}/payment`, { amount: Number(payment.amount), paymentReference: payment.paymentReference.trim() }, { params: { trust_id: trustId } });
      addToast("Payment allocated to the invoice", "success");
      setPayment({ amount: "", paymentReference: "" });
      await load();
    } catch (requestError) {
      addToast(requestError.response?.data?.message || "Unable to record payment", "error");
    } finally {
      setSavingPayment(false);
    }
  }

  if (!invoicesEnabled) return <DisabledState />;
  const currency = invoice?.currency || "INR";
  const status = invoice?.status;
  const lines = invoice?.lines || [];
  const payments = invoice?.payments || [];
  const deliveries = invoice?.deliveries || [];

  return (
    <AppLayout>
      <div className="max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3"><button type="button" onClick={() => navigate("/operations/invoices")} className="mt-1 rounded-xl border border-stone-200 bg-white p-2 text-stone-600 hover:bg-stone-50" aria-label="Back to invoices"><ArrowLeft size={16} /></button><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-saffron-600">Invoice detail</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">{invoice?.invoice_number || invoice?.invoiceNumber || "Invoice"}</h1><p className="mt-1 text-sm text-stone-500">{invoice?.trust?.name || trustId} · {invoice?.person?.full_name || invoice?.person_id || "person"}</p></div></div>
          <div className="flex items-center gap-3"><StatusBadge status={status} /><button type="button" onClick={refresh} className="rounded-xl border border-stone-200 bg-white p-2.5 text-stone-600 hover:bg-stone-50" aria-label="Refresh invoice detail"><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /></button></div>
        </div>

        {loading && <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">Loading invoice detail…</div>}
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
        {!loading && !error && invoice && <>
          {status === "pending_approval" && canApprove && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div><div className="font-semibold text-amber-900">Admin approval is pending</div><div className="mt-1 text-sm text-amber-800">Approval sends the immutable invoice document to the person.</div></div><div className="flex gap-2"><button type="button" onClick={reject} className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"><XCircle size={15} className="mr-1 inline" />Reject</button><button type="button" onClick={approve} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"><Check size={15} className="mr-1 inline" />Approve &amp; send</button></div></div>}
          {status === "draft" && canPrepare && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"><div><div className="font-semibold text-stone-800">Draft invoice</div><div className="mt-1 text-sm text-stone-500">Submit this invoice for Admin approval before delivery.</div></div><button type="button" onClick={submit} className="rounded-xl bg-saffron-500 px-4 py-2 text-sm font-semibold text-white hover:bg-saffron-600">Submit for approval</button></div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Subtotal" value={invoice.subtotal} currency={currency} /><Metric label="Tax" value={invoice.tax_amount} currency={currency} /><Metric label="Total" value={invoice.total_amount} currency={currency} /><Metric label="Paid" value={invoice.paid_amount} currency={currency} tone="text-emerald-600" /></div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.6fr]">
            <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-5"><div><h2 className="font-semibold text-stone-800">Line items</h2><p className="mt-1 text-xs text-stone-400">Issue date {invoice.issue_date || "—"} · due {invoice.due_date || "—"} · {currency}</p></div><div className="text-xs text-stone-500">Trust: {invoice.trust?.name || invoice.trust_id}</div></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-stone-50/70 text-xs uppercase tracking-wider text-stone-400"><tr><th className="px-5 py-3">Description</th><th className="px-5 py-3 text-right">Qty</th><th className="px-5 py-3 text-right">Rate</th><th className="px-5 py-3 text-right">Tax</th><th className="px-5 py-3 text-right">Amount</th></tr></thead><tbody>{lines.map((line) => <tr key={line.id || line.line_number} className="border-t border-stone-50"><td className="px-5 py-4 font-medium text-stone-800">{line.description}</td><td className="px-5 py-4 text-right text-stone-600">{line.quantity}</td><td className="px-5 py-4 text-right text-stone-600">{formatMoney(line.unit_price, currency)}</td><td className="px-5 py-4 text-right text-stone-600">{formatMoney(line.tax_amount, currency)}</td><td className="px-5 py-4 text-right font-semibold text-stone-800">{formatMoney(line.line_amount, currency)}</td></tr>)}</tbody></table></div></section>
            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-stone-800">Payment allocation</h2><p className="mt-1 text-sm text-stone-500">Journal events are created by the accounting adapter. Invoice lines remain unchanged.</p>{canPrepare && ["sent", "partially_paid", "overdue"].includes(status) && <form onSubmit={recordPayment} className="mt-5 space-y-3"><label className="block text-xs font-semibold text-stone-500">Amount<input required type="number" min="0.0001" step="0.0001" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} className="mt-1.5 w-full rounded-xl border-2 border-stone-200 px-3 py-2.5 text-sm font-normal text-stone-800 outline-none focus:border-saffron-400" /></label><label className="block text-xs font-semibold text-stone-500">Payment reference<input required value={payment.paymentReference} onChange={(event) => setPayment({ ...payment, paymentReference: event.target.value })} className="mt-1.5 w-full rounded-xl border-2 border-stone-200 px-3 py-2.5 text-sm font-normal text-stone-800 outline-none focus:border-saffron-400" placeholder="Bank or gateway reference" /></label><button type="submit" disabled={savingPayment} className="w-full rounded-xl bg-royal-600 py-2.5 text-sm font-semibold text-white hover:bg-royal-700 disabled:opacity-50">{savingPayment ? "Allocating…" : "Record payment"}</button></form>}</section>
          </div>
          {status && ["sent", "partially_paid", "paid", "overdue"].includes(status) && canApprove && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4"><div><div className="font-semibold text-rose-900">Need a correction?</div><div className="mt-1 text-sm text-rose-800">Cancel the sent invoice and create a new draft; historical details stay intact.</div></div><button type="button" onClick={cancelAndReissue} className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"><Send size={15} className="mr-1 inline" />Cancel &amp; reissue</button></div>}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-semibold text-stone-800">Payment history</h2>{payments.length === 0 ? <p className="text-sm text-stone-500">No payment events returned for this invoice.</p> : <div className="space-y-2">{payments.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl border border-stone-100 px-3 py-2.5"><div><div className="text-sm font-medium text-stone-800">{item.provider_reference || item.payment_id}</div><div className="text-xs text-stone-400">{item.status} · {item.completed_at || item.created_at}</div></div><span className="font-semibold text-emerald-700">{formatMoney(item.amount, currency)}</span></div>)}</div>}</section><section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-semibold text-stone-800">Documents &amp; delivery</h2>{deliveries.length === 0 ? <p className="text-sm text-stone-500">No delivery events yet.</p> : <div className="space-y-2">{deliveries.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl border border-stone-100 px-3 py-2.5"><div><div className="text-sm font-medium text-stone-800">Invoice document</div><div className="text-xs text-stone-400">{item.recipient_email} · attempt {item.attempt_count || 0}</div></div><StatusBadge status={item.status} /></div>)}</div>}</section></div>
        </>}
        {!loading && !error && !invoice && <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">Invoice not found.</div>}
        <Link to="/operations/invoices" className="inline-flex text-sm font-semibold text-royal-600 hover:text-royal-800">Back to all invoices</Link>
      </div>
    </AppLayout>
  );
}
