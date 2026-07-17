import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Trash2, Pencil, Search } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";

const emptyForm = { name: "", email: "", telegram_chat_id: "", phone: "", subscribe_monthly_report: false };

export default function Contacts() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canAdd = role === "admin" || role === "accountant";
  const canDelete = role === "admin";
  const canEdit = role === "admin" || role === "accountant";

  const [contacts, setContacts] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [search, setSearch] = useState("");

  function load() { api.get("/contacts").then((res) => setContacts(res.data.result)); }
  useEffect(load, []);

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (c.name || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q) || (c.phone || "").includes(q);
    });
  }, [contacts, search]);

  function openAdd() { setEditing(null); setForm({ ...emptyForm }); setOpen(true); }

  function openEdit(contact) {
    setEditing(contact);
    setForm({ name: contact.name, email: contact.email || "", telegram_chat_id: contact.telegram_chat_id || "", phone: contact.phone || "", subscribe_monthly_report: contact.subscribe_monthly_report || false });
    setOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.patch("/contacts/" + editing.id, form);
        addToast("Contact updated successfully", "success");
      } else {
        await api.post("/contacts", form);
        addToast("Contact created successfully", "success");
      }
      setOpen(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save contact", "error");
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm("Are you sure you want to delete this contact?")) return;
    try {
      await api.delete("/contacts/" + id);
      addToast("Contact deleted", "success");
      load();
    } catch (err) {
      addToast("Failed to delete contact", "error");
    }
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Contacts</h1>
        {canAdd && (
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openAdd}
            className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-saffron-500/20 transition-all">
            <Plus size={16} /> Add Contact
          </motion.button>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-5">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input placeholder="Search by name, email or phone..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md pl-9 pr-4 py-2 text-sm border-2 border-stone-200 rounded-xl focus:border-saffron-400 transition-colors" />
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-stone-50 to-stone-100/80 text-stone-500 text-left">
            <tr>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Name</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Email</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Phone</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Telegram</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Monthly Report</th>
              {(canEdit || canDelete) && <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {filtered.map((c, i) => (
                <motion.tr key={c.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }} className="border-t border-stone-100 table-row-animate">
                  <td className="px-5 py-3.5 font-semibold text-stone-800">{c.name}</td>
                  <td className="px-5 py-3.5 text-stone-600">{c.email || "-"}</td>
                  <td className="px-5 py-3.5 text-stone-600">{c.phone || "-"}</td>
                  <td className="px-5 py-3.5 text-stone-600 font-mono text-xs">{c.telegram_chat_id || "-"}</td>
                  <td className="px-5 py-3.5">
                    {c.subscribe_monthly_report
                      ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Yes</span>
                      : <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-stone-100 text-stone-500">No</span>}
                  </td>
                  {(canEdit || canDelete) && (
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                            onClick={() => openEdit(c)} className="text-stone-300 hover:text-royal-600 transition-all p-1.5 rounded-lg hover:bg-royal-50" title="Edit">
                            <Pencil size={15} />
                          </motion.button>
                        )}
                        {canDelete && (
                          <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                            onClick={() => handleDelete(c.id)} className="text-stone-300 hover:text-rose-600 transition-all p-1.5 rounded-lg hover:bg-rose-50" title="Delete">
                            <Trash2 size={15} />
                          </motion.button>
                        )}
                      </div>
                    </td>
                  )}
                </motion.tr>
              ))}
            </AnimatePresence>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-stone-400">
                <p className="font-medium">{contacts.length === 0 ? "No contacts yet" : "No matches found"}</p>
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
              className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold text-stone-900">{editing ? "Edit Contact" : "Add Contact"}</h2>
                <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                  onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                <input placeholder="Telegram Chat ID" value={form.telegram_chat_id} onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                <label className="flex items-center gap-2.5 text-sm text-stone-700 cursor-pointer p-2 rounded-xl hover:bg-stone-50 transition-colors">
                  <input type="checkbox" checked={form.subscribe_monthly_report} onChange={(e) => setForm({ ...form, subscribe_monthly_report: e.target.checked })}
                    className="rounded border-stone-300 text-saffron-600 focus:ring-saffron-500" />
                  Receive automatic monthly report
                </label>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={saving}
                  className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                  {saving ? "Saving..." : editing ? "Update Contact" : "Save Contact"}
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
