import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Trash2 } from "lucide-react";
import { useAuth } from "../lib/AuthContext";

const rowVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i) => ({ opacity: 1, x: 0, transition: { delay: i * 0.03, duration: 0.35, ease: [0.16, 1, 0.3, 1] } }),
  exit: { opacity: 0, x: 16, transition: { duration: 0.2 } },
};

export default function Contacts() {
  const { profile } = useAuth();
  const role = profile?.role || "viewer";
  const canAdd = role === "admin" || role === "accountant";
  const canDelete = role === "admin";

  const [contacts, setContacts] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", telegram_chat_id: "", phone: "", subscribe_monthly_report: false });

  function load() {
    api.get("/contacts").then((res) => setContacts(res.data.result));
  }
  useEffect(load, []);

  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true);
    await api.post("/contacts", form);
    setSaving(false);
    setOpen(false);
    setForm({ name: "", email: "", telegram_chat_id: "", phone: "", subscribe_monthly_report: false });
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm("Are you sure you want to delete this contact?")) return;
    await api.delete("/contacts/" + id);
    load();
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Contacts</h1>
        {canAdd && (
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-saffron-500/20 transition-all duration-300">
            <Plus size={16} /> Add Contact
          </motion.button>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }}
        className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-stone-50 to-stone-100/80 text-stone-500 text-left">
            <tr>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Name</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Email</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Telegram Chat ID</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Monthly Report</th>
              {canDelete && <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {contacts.map((c, i) => (
                <motion.tr key={c.id} custom={i} variants={rowVariants} initial="hidden" animate="visible" exit="exit"
                  className="border-t border-stone-100 table-row-animate">
                  <td className="px-5 py-3.5 font-semibold text-stone-800">{c.name}</td>
                  <td className="px-5 py-3.5 text-stone-600">{c.email || "-"}</td>
                  <td className="px-5 py-3.5 text-stone-600 font-mono text-xs">{c.telegram_chat_id || "-"}</td>
                  <td className="px-5 py-3.5">
                    {c.subscribe_monthly_report
                      ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Yes</span>
                      : <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-stone-100 text-stone-500">No</span>}
                  </td>
                  {canDelete && (
                    <td className="px-5 py-3.5 text-right">
                      <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                        onClick={() => handleDelete(c.id)}
                        className="text-stone-300 hover:text-rose-600 transition-all duration-200 p-1.5 rounded-lg hover:bg-rose-50" title="Delete">
                        <Trash2 size={16} />
                      </motion.button>
                    </td>
                  )}
                </motion.tr>
              ))}
            </AnimatePresence>
            {contacts.length === 0 && (
              <tr><td colSpan={canDelete ? 5 : 4} className="px-5 py-12 text-center text-stone-400">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-300">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </div>
                  <p className="font-medium">No contacts yet</p>
                  <p className="text-xs">Add a contact to receive notifications</p>
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
              className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20 animate-scale-in">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold text-stone-900">Add Contact</h2>
                <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                  onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
              </div>
              <form onSubmit={handleAdd} className="space-y-4">
                <input required placeholder="Name" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                <input type="email" placeholder="Email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                <input placeholder="Telegram Chat ID" value={form.telegram_chat_id}
                  onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                <input placeholder="Phone" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                <label className="flex items-center gap-2.5 text-sm text-stone-700 cursor-pointer group p-2 rounded-xl hover:bg-stone-50 transition-colors">
                  <input type="checkbox" checked={form.subscribe_monthly_report}
                    onChange={(e) => setForm({ ...form, subscribe_monthly_report: e.target.checked })}
                    className="rounded border-stone-300 text-saffron-600 focus:ring-saffron-500" />
                  <span className="group-hover:text-stone-900 transition-colors">Receive automatic monthly report</span>
                </label>
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
                  ) : "Save Contact"}
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
