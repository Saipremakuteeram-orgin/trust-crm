import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Pencil, Trash2, Users, Calendar, Shield, UserCheck } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import useEscToClose from "../hooks/useEscToClose";

const emptyForm = {
  contact_id: "",
  appointment_date: new Date().toISOString().slice(0, 10),
  term_end: "",
  role: "Trustee",
  designation: "",
  is_active: true,
  notes: "",
};

export default function Trustees() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canEdit = role === "admin" || role === "accountant";

  const [trustees, setTrustees] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  useEscToClose(() => setOpen(false), open);

  async function load() {
    setLoading(true);
    try {
      const [trusteesRes, contactsRes] = await Promise.all([
        api.get("/trustees"),
        api.get("/contacts"),
      ]);
      setTrustees(trusteesRes.data.result || []);
      setContacts(contactsRes.data.result || []);
    } catch {
      addToast("Failed to load trustees", "error");
    }
    setLoading(false);
  }
  useEffect(() => { let cancelled = false; load().finally(() => { cancelled = true; }); return () => { cancelled = true; }; }, []);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm });
    setSaving(false);
    setOpen(true);
  }

  function openEdit(trustee) {
    setEditing(trustee);
    setForm({
      contact_id: trustee.contact_id || "",
      appointment_date: trustee.appointment_date || "",
      term_end: trustee.term_end || "",
      role: trustee.role || "Trustee",
      designation: trustee.designation || "",
      is_active: trustee.is_active !== false,
      notes: trustee.notes || "",
    });
    setSaving(false);
    setOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.contact_id) {
      addToast("Please select a contact", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        contact_id: form.contact_id,
        appointment_date: form.appointment_date,
        term_end: form.term_end || null,
        role: form.role.trim() || "Trustee",
        designation: form.designation.trim() || null,
        is_active: form.is_active,
        notes: form.notes.trim() || null,
      };

      if (editing) {
        await api.patch(`/trustees/${editing.id}`, payload);
        addToast("Trustee updated", "success");
      } else {
        await api.post("/trustees", payload);
        addToast("Trustee added", "success");
      }
      setOpen(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save trustee", "error");
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm("Remove this trustee?")) return;
    try {
      await api.delete(`/trustees/${id}`);
      addToast("Trustee removed", "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to remove trustee", "error");
    }
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className="text-royal-600" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Trustees</h1>
              <p className="text-sm text-stone-500">Manage trustee registry</p>
            </div>
          </div>
          {canEdit && (
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openAdd}
              className="flex items-center gap-2 bg-saffron-500 hover:bg-saffron-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
              <Plus size={18} /> Add Trustee
            </motion.button>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
            <p>Loading trustees...</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-stone-400 uppercase tracking-wider bg-stone-50">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Name</th>
                    <th className="py-3 px-4 font-semibold">Role</th>
                    <th className="py-3 px-4 font-semibold">Appointment Date</th>
                    <th className="py-3 px-4 font-semibold">Term End</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {trustees.map((trustee) => (
                    <tr key={trustee.id} className="hover:bg-stone-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-royal-100 text-royal-700 flex items-center justify-center text-xs font-bold">
                            {(trustee.contacts?.name || "?").split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-medium text-stone-800">{trustee.contacts?.name || "Unknown"}</div>
                            <div className="text-xs text-stone-400">{trustee.contacts?.email || ""}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-stone-700">
                        {trustee.designation || trustee.role}
                      </td>
                      <td className="py-3 px-4 text-stone-600">{trustee.appointment_date}</td>
                      <td className="py-3 px-4 text-stone-600">{trustee.term_end || "-"}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${trustee.is_active ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>
                          {trustee.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {canEdit && (
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(trustee)} className="p-1.5 rounded-lg hover:bg-royal-50 text-stone-400 hover:text-royal-600">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => handleDelete(trustee.id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-stone-400 hover:text-rose-600">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {trustees.length === 0 && (
              <div className="p-12 text-center text-stone-400">
                <p>No trustees yet. Add your first trustee to get started.</p>
              </div>
            )}
          </div>
        )}

        {/* Add/Edit Modal */}
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
              <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-bold text-stone-900">{editing ? "Edit Trustee" : "Add Trustee"}</h2>
                  <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                    onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Contact</label>
                    <select required value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                      <option value="">Select contact</option>
                      {contacts.map(c => (
                        <option key={c.id} value={c.id}>{c.name} {c.email ? `(${c.email})` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Role / Designation</label>
                    <input type="text" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Appointment Date</label>
                      <input type="date" required value={form.appointment_date}
                        onChange={(e) => setForm({ ...form, appointment_date: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Term End</label>
                      <input type="date" value={form.term_end}
                        onChange={(e) => setForm({ ...form, term_end: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Notes</label>
                    <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors resize-none" />
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={saving}
                    className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                    {saving ? "Saving..." : editing ? "Update Trustee" : "Add Trustee"}
                  </motion.button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}
