import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Pencil, Trash2, Calendar, CheckCircle2, Clock, AlertTriangle, FileText, ChevronRight } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import useEscToClose from "../hooks/useEscToClose";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

const CATEGORIES = ["FCRA", "12A", "80G", "Income Tax", "Charity Commissioner", "GST", "TDS", "Other"];
const STATUSES = ["pending", "in-progress", "filed", "overdue"];
const FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "half-yearly", "yearly", "one-time"];

const emptyForm = {
  name: "",
  category: "Other",
  frequency: "monthly",
  due_date: new Date().toISOString().slice(0, 10),
  responsible_person: "",
  status: "pending",
  notes: "",
};

const emptyReturn = {
  period: "",
  due_date: new Date().toISOString().slice(0, 10),
  filed_date: "",
  status: "pending",
  acknowledgement_number: "",
  file_url: "",
  notes: "",
};

export default function Compliance() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canEdit = role === "admin" || role === "accountant";

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [returns, setReturns] = useState({});
  const [returnModal, setReturnModal] = useState({ open: false, itemId: null, editing: null });
  const [returnForm, setReturnForm] = useState({ ...emptyReturn });
  const [savingReturn, setSavingReturn] = useState(false);
  useEscToClose(() => setOpen(false), open);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/compliance");
      setItems(res.data.result || []);
    } catch {
      addToast("Failed to load compliance items", "error");
    }
    setLoading(false);
  }
  useEffect(() => { let cancelled = false; load().finally(() => { cancelled = true; }); return () => { cancelled = true; }; }, []);

  async function loadReturns(itemId) {
    try {
      const res = await api.get(`/compliance/${itemId}/returns`);
      setReturns(prev => ({ ...prev, [itemId]: res.data.result || [] }));
    } catch {
      setReturns(prev => ({ ...prev, [itemId]: [] }));
    }
  }

  function toggleExpand(id) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadReturns(id);
    }
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm });
    setSaving(false);
    setOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({
      name: item.name || "",
      category: item.category || "Other",
      frequency: item.frequency || "monthly",
      due_date: item.due_date || "",
      responsible_person: item.responsible_person || "",
      status: item.status || "pending",
      notes: item.notes || "",
    });
    setSaving(false);
    setOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.due_date) {
      addToast("Name and due date are required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        frequency: form.frequency,
        due_date: form.due_date,
        responsible_person: form.responsible_person.trim() || null,
        status: form.status,
        notes: form.notes.trim() || null,
      };

      if (editing) {
        await api.patch(`/compliance/${editing.id}`, payload);
        addToast("Compliance item updated", "success");
      } else {
        await api.post("/compliance", payload);
        addToast("Compliance item added", "success");
      }
      setOpen(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save compliance item", "error");
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm("Remove this compliance item?")) return;
    try {
      await api.delete(`/compliance/${id}`);
      addToast("Compliance item removed", "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to remove compliance item", "error");
    }
  }

  function openAddReturn(itemId) {
    setReturnModal({ open: true, itemId, editing: null });
    setReturnForm({ ...emptyReturn });
    setSavingReturn(false);
  }

  function openEditReturn(itemId, ret) {
    setReturnModal({ open: true, itemId, editing: ret });
    setReturnForm({
      period: ret.period || "",
      due_date: ret.due_date || "",
      filed_date: ret.filed_date || "",
      status: ret.status || "pending",
      acknowledgement_number: ret.acknowledgement_number || "",
      file_url: ret.file_url || "",
      notes: ret.notes || "",
    });
    setSavingReturn(false);
  }

  async function handleSaveReturn(e) {
    e.preventDefault();
    if (!returnForm.period.trim() || !returnForm.due_date) {
      addToast("Period and due date are required", "error");
      return;
    }
    setSavingReturn(true);
    try {
      const payload = {
        period: returnForm.period.trim(),
        due_date: returnForm.due_date,
        filed_date: returnForm.filed_date || null,
        status: returnForm.status,
        acknowledgement_number: returnForm.acknowledgement_number.trim() || null,
        file_url: returnForm.file_url.trim() || null,
        notes: returnForm.notes.trim() || null,
      };

      if (returnModal.editing) {
        await api.patch(`/compliance/returns/${returnModal.editing.id}`, payload);
        addToast("Return updated", "success");
      } else {
        await api.post(`/compliance/${returnModal.itemId}/returns`, payload);
        addToast("Return added", "success");
      }
      setReturnModal({ open: false, itemId: null, editing: null });
      loadReturns(returnModal.itemId);
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save return", "error");
    }
    setSavingReturn(false);
  }

  async function handleDeleteReturn(returnId) {
    if (!window.confirm("Remove this return record?")) return;
    try {
      await api.delete(`/compliance/returns/${returnId}`);
      addToast("Return removed", "success");
      loadReturns(returnModal.itemId);
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to remove return", "error");
    }
  }

  function getStatusStyle(status) {
    switch (status) {
      case "filed": return "bg-emerald-100 text-emerald-700";
      case "in-progress": return "bg-amber-100 text-amber-700";
      case "overdue": return "bg-rose-100 text-rose-700";
      default: return "bg-stone-100 text-stone-600";
    }
  }

  function getStatusIcon(status) {
    switch (status) {
      case "filed": return <CheckCircle2 size={16} />;
      case "in-progress": return <Clock size={16} />;
      case "overdue": return <AlertTriangle size={16} />;
      default: return <FileText size={16} />;
    }
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Calendar className="text-royal-600" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Compliance Calendar</h1>
              <p className="text-sm text-stone-500">Track statutory filings and compliance deadlines</p>
            </div>
          </div>
          {canEdit && (
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openAdd}
              className="flex items-center gap-2 bg-saffron-500 hover:bg-saffron-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
              <Plus size={18} /> Add Compliance
            </motion.button>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
            <p>Loading compliance items...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.length === 0 ? (
              <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
                <p>No compliance items yet. Add your first compliance item to get started.</p>
              </div>
            ) : (
              items.map((item) => {
                const isExpanded = expandedId === item.id;
                const itemReturns = returns[item.id] || [];

                return (
                  <div key={item.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button onClick={() => toggleExpand(item.id)} className="text-stone-400 hover:text-stone-600">
                          {isExpanded ? <ChevronRight size={18} /> : <ChevronRight size={18} />}
                        </button>
                        <div className={`p-2 rounded-lg ${getStatusStyle(item.status)}`}>
                          {getStatusIcon(item.status)}
                        </div>
                        <div>
                          <div className="font-medium text-stone-800">{item.name}</div>
                          <div className="text-xs text-stone-500">
                            {item.category} - Due: {item.due_date} - {item.frequency}
                            {item.responsible_person && ` - ${item.responsible_person}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${getStatusStyle(item.status)}`}>
                          {item.status}
                        </span>
                        {canEdit && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => openAddReturn(item.id)} className="p-1.5 rounded-lg hover:bg-saffron-50 text-stone-400 hover:text-saffron-600" title="Add return">
                              <Plus size={14} />
                            </button>
                            <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-royal-50 text-stone-400 hover:text-royal-600" title="Edit">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-stone-400 hover:text-rose-600" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-stone-100 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-stone-700">Returns</h3>
                        </div>
                        {itemReturns.length === 0 ? (
                          <p className="text-xs text-stone-400">No returns yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {itemReturns.map((ret) => (
                              <div key={ret.id} className="flex items-center justify-between bg-stone-50 rounded-lg px-3 py-2">
                                <div>
                                  <div className="text-sm font-medium text-stone-800">{ret.period}</div>
                                  <div className="text-xs text-stone-500">
                                    Due: {ret.due_date} - Status: {ret.status}
                                    {ret.acknowledgement_number && ` - Ack: ${ret.acknowledgement_number}`}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {canEdit && (
                                    <button onClick={() => handleDeleteReturn(ret.id)} className="p-1 rounded hover:bg-rose-50 text-stone-400 hover:text-rose-600">
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Add/Edit Compliance Modal */}
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
              <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-bold text-stone-900">{editing ? "Edit Compliance" : "Add Compliance"}</h2>
                  <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                    onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Name</label>
                    <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Category</label>
                      <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                        {CATEGORIES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Frequency</label>
                      <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                        {FREQUENCIES.map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Due Date</label>
                      <input type="date" required value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Status</label>
                      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                        {STATUSES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Responsible Person</label>
                    <input type="text" value={form.responsible_person} onChange={(e) => setForm({ ...form, responsible_person: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Notes</label>
                    <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors resize-none" />
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={saving}
                    className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                    {saving ? "Saving..." : editing ? "Update Compliance" : "Add Compliance"}
                  </motion.button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Return Modal */}
        <AnimatePresence>
          {returnModal.open && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
              <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-bold text-stone-900">{returnModal.editing ? "Edit Return" : "Add Return"}</h2>
                  <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                    onClick={() => setReturnModal({ open: false, itemId: null, editing: null })} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
                </div>
                <form onSubmit={handleSaveReturn} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Period</label>
                    <input type="text" required value={returnForm.period} onChange={(e) => setReturnForm({ ...returnForm, period: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Due Date</label>
                      <input type="date" required value={returnForm.due_date} onChange={(e) => setReturnForm({ ...returnForm, due_date: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Filed Date</label>
                      <input type="date" value={returnForm.filed_date} onChange={(e) => setReturnForm({ ...returnForm, filed_date: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Status</label>
                    <select value={returnForm.status} onChange={(e) => setReturnForm({ ...returnForm, status: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                      {STATUSES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Acknowledgement Number</label>
                    <input type="text" value={returnForm.acknowledgement_number} onChange={(e) => setReturnForm({ ...returnForm, acknowledgement_number: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">File URL</label>
                    <input type="text" value={returnForm.file_url} onChange={(e) => setReturnForm({ ...returnForm, file_url: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Notes</label>
                    <textarea rows={2} value={returnForm.notes} onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors resize-none" />
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={savingReturn}
                    className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                    {savingReturn ? "Saving..." : returnModal.editing ? "Update Return" : "Add Return"}
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
