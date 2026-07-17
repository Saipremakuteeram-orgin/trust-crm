import { useEffect, useState } from "react";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Trash2 } from "lucide-react";
import { useAuth } from "../lib/AuthContext";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function Transactions() {
  const { profile } = useAuth();
  const role = profile?.role || "viewer";
  const canAdd = role === "admin" || role === "accountant";
  const canDelete = role === "admin";

  const [txns, setTxns] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: "credit",
    mode: "cash",
    digital_method: "upi",
    amount: "",
    party: "",
    description: "",
    txn_date: new Date().toISOString().slice(0, 10),
    notify_contact_ids: [],
  });

  function load() {
    api.get("/transactions").then((res) => setTxns(res.data.result));
    api.get("/contacts").then((res) => setContacts(res.data.result));
  }
  useEffect(load, []);

  function toggleContact(id) {
    setForm((f) => ({
      ...f,
      notify_contact_ids: f.notify_contact_ids.includes(id)
        ? f.notify_contact_ids.filter((x) => x !== id)
        : [...f.notify_contact_ids, id],
    }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true);
    await api.post("/transactions", { ...form, amount: Number(form.amount) });
    setSaving(false);
    setOpen(false);
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm("Are you sure you want to delete this transaction?")) return;
    await api.delete("/transactions/" + id);
    load();
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-stone-900">Transactions</h1>
        {canAdd && (
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm px-4 py-2 rounded-lg transition">
            <Plus size={16} /> Add Transaction
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Party</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Mode</th>
              <th className="px-4 py-3 font-medium">Notified</th>
              {canDelete && <th className="px-4 py-3 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {txns.map((t) => (
              <tr key={t.id} className="border-t border-stone-100">
                <td className="px-4 py-3 text-stone-600">{t.txn_date}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${t.type === "credit" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {t.type === "credit" ? "Credit" : "Debit"}
                  </span>
                </td>
                <td className="px-4 py-3 text-stone-800">{t.party || "-"}</td>
                <td className={`px-4 py-3 font-medium ${t.type === "credit" ? "text-emerald-700" : "text-red-700"}`}>{fmt(t.amount)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${t.mode === "cash" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
                    {t.mode === "cash" ? "Cash" : t.digital_method?.toUpperCase() || "Digital"}
                  </span>
                </td>
                <td className="px-4 py-3 text-stone-500 text-xs">{t.notification_status}</td>
                {canDelete && (
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(t.id)} className="text-stone-400 hover:text-red-600 transition" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {txns.length === 0 && (
              <tr><td colSpan={canDelete ? 7 : 6} className="px-4 py-8 text-center text-stone-400">No transactions yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-stone-900">Add Transaction</h2>
              <button onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="flex gap-2">
                <button type="button" onClick={() => setForm({ ...form, type: "credit" })} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${form.type === "credit" ? "bg-emerald-600 text-white border-emerald-600" : "border-stone-300 text-stone-600"}`}>Credit (In)</button>
                <button type="button" onClick={() => setForm({ ...form, type: "debit" })} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${form.type === "debit" ? "bg-red-600 text-white border-red-600" : "border-stone-300 text-stone-600"}`}>Debit (Out)</button>
              </div>

              <input required type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
              <input placeholder="Party (donor / vendor name)" value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />

              <div className="flex gap-2">
                <button type="button" onClick={() => setForm({ ...form, mode: "cash" })} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${form.mode === "cash" ? "bg-emerald-600 text-white border-emerald-600" : "border-stone-300 text-stone-600"}`}>Cash</button>
                <button type="button" onClick={() => setForm({ ...form, mode: "digital" })} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${form.mode === "digital" ? "bg-blue-600 text-white border-blue-600" : "border-stone-300 text-stone-600"}`}>Digital</button>
              </div>

              {form.mode === "digital" && (
                <select value={form.digital_method} onChange={(e) => setForm({ ...form, digital_method: e.target.value })} className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm">
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="card">Card</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </select>
              )}

              <input placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
              <input required type="date" value={form.txn_date} onChange={(e) => setForm({ ...form, txn_date: e.target.value })} className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />

              <div>
                <div className="text-sm font-medium text-stone-700 mb-2">Notify (email + Telegram) on save</div>
                <div className="space-y-1 max-h-32 overflow-y-auto border border-stone-200 rounded-lg p-2">
                  {contacts.length === 0 && <p className="text-xs text-stone-400">No contacts yet — add some first</p>}
                  {contacts.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-stone-700">
                      <input type="checkbox" checked={form.notify_contact_ids.includes(c.id)} onChange={() => toggleContact(c.id)} />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>

              <button disabled={saving} className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-lg py-2 text-sm font-medium">
                {saving ? "Saving..." : "Save Transaction"}
              </button>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
