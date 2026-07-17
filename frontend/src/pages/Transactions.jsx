import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Trash2 } from "lucide-react";
import { useAuth } from "../lib/AuthContext";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

const rowVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i) => ({ opacity: 1, x: 0, transition: { delay: i * 0.03, duration: 0.35, ease: [0.16, 1, 0.3, 1] } }),
  exit: { opacity: 0, x: 16, transition: { duration: 0.2 } },
};

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
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Transactions</h1>
        {canAdd && (
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-saffron-500/20 transition-all duration-300">
            <Plus size={16} /> Add Transaction
          </motion.button>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }}
        className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-stone-50 to-stone-100/80 text-stone-500 text-left">
            <tr>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Date</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Type</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Party</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Amount</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Mode</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Notified</th>
              {canDelete && <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {txns.map((t, i) => (
                <motion.tr key={t.id} custom={i} variants={rowVariants} initial="hidden" animate="visible" exit="exit"
                  className="border-t border-stone-100 table-row-animate">
                  <td className="px-5 py-3.5 text-stone-600">{t.txn_date}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      t.type === "credit"
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                    }`}>
                      {t.type === "credit" ? "Credit" : "Debit"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-stone-800 font-medium">{t.party || "-"}</td>
                  <td className={`px-5 py-3.5 font-bold ${t.type === "credit" ? "text-emerald-700" : "text-rose-700"}`}>{fmt(t.amount)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      t.mode === "cash"
                        ? "bg-saffron-50 text-saffron-700 ring-1 ring-saffron-200"
                        : "bg-royal-50 text-royal-700 ring-1 ring-royal-200"
                    }`}>
                      {t.mode === "cash" ? "Cash" : t.digital_method?.toUpperCase() || "Digital"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-stone-400 text-xs">{t.notification_status}</td>
                  {canDelete && (
                    <td className="px-5 py-3.5 text-right">
                      <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                        onClick={() => handleDelete(t.id)}
                        className="text-stone-300 hover:text-rose-600 transition-all duration-200 p-1.5 rounded-lg hover:bg-rose-50" title="Delete">
                        <Trash2 size={16} />
                      </motion.button>
                    </td>
                  )}
                </motion.tr>
              ))}
            </AnimatePresence>
            {txns.length === 0 && (
              <tr><td colSpan={canDelete ? 7 : 6} className="px-5 py-12 text-center text-stone-400">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-300">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  </div>
                  <p className="font-medium">No transactions yet</p>
                  <p className="text-xs">Add your first transaction to get started</p>
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold text-stone-900">Add Transaction</h2>
                <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                  onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
              </div>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="flex gap-2">
                  <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => setForm({ ...form, type: "credit" })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all duration-200 ${
                      form.type === "credit"
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-500/25"
                        : "border-stone-200 text-stone-600 hover:border-emerald-300"
                    }`}>Credit (In)</motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => setForm({ ...form, type: "debit" })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all duration-200 ${
                      form.type === "debit"
                        ? "bg-rose-600 text-white border-rose-600 shadow-lg shadow-rose-500/25"
                        : "border-stone-200 text-stone-600 hover:border-rose-300"
                    }`}>Debit (Out)</motion.button>
                </div>

                <input required type="number" placeholder="Amount" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                <input placeholder="Party (donor / vendor name)" value={form.party}
                  onChange={(e) => setForm({ ...form, party: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />

                <div className="flex gap-2">
                  <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => setForm({ ...form, mode: "cash" })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all duration-200 ${
                      form.mode === "cash"
                        ? "bg-saffron-600 text-white border-saffron-600 shadow-lg shadow-saffron-500/25"
                        : "border-stone-200 text-stone-600 hover:border-saffron-300"
                    }`}>Cash</motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => setForm({ ...form, mode: "digital" })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all duration-200 ${
                      form.mode === "digital"
                        ? "bg-royal-600 text-white border-royal-600 shadow-lg shadow-royal-500/25"
                        : "border-stone-200 text-stone-600 hover:border-royal-300"
                    }`}>Digital</motion.button>
                </div>

                <AnimatePresence>
                  {form.mode === "digital" && (
                    <motion.select initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }} value={form.digital_method}
                      onChange={(e) => setForm({ ...form, digital_method: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                      <option value="upi">UPI</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="card">Card</option>
                      <option value="cheque">Cheque</option>
                      <option value="other">Other</option>
                    </motion.select>
                  )}
                </AnimatePresence>

                <input placeholder="Description (optional)" value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                <input required type="date" value={form.txn_date}
                  onChange={(e) => setForm({ ...form, txn_date: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />

                <div>
                  <div className="text-sm font-semibold text-stone-700 mb-2">Notify (email + Telegram) on save</div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto border-2 border-stone-200 rounded-xl p-3">
                    {contacts.length === 0 && <p className="text-xs text-stone-400">No contacts yet — add some first</p>}
                    {contacts.map((c) => (
                      <label key={c.id} className="flex items-center gap-2.5 text-sm text-stone-700 cursor-pointer group">
                        <input type="checkbox" checked={form.notify_contact_ids.includes(c.id)}
                          onChange={() => toggleContact(c.id)}
                          className="rounded border-stone-300 text-saffron-600 focus:ring-saffron-500" />
                        <span className="group-hover:text-stone-900 transition-colors">{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={saving}
                  className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all duration-300 disabled:opacity-50">
                  {saving ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Saving...
                    </span>
                  ) : "Save Transaction"}
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
