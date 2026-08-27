import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Pencil, Trash2, Users, Heart, DollarSign, Calendar, ChevronRight, ChevronDown } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import useEscToClose from "../hooks/useEscToClose";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

const emptyForm = {
  contact_id: "",
  eligibility_start: new Date().toISOString().slice(0, 10),
  eligibility_end: "",
  category: "General",
  priority: 0,
  notes: "",
};

const emptyDisbursement = {
  amount: "",
  disbursement_date: new Date().toISOString().slice(0, 10),
  purpose: "",
  mode: "cash",
  reference_no: "",
  notes: "",
};

export default function Beneficiaries() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canEdit = role === "admin" || role === "accountant";

  const [beneficiaries, setBeneficiaries] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [disbursements, setDisbursements] = useState({});
  const [disbursementModal, setDisbursementModal] = useState({ open: false, beneficiaryId: null, editing: null });
  const [disbursementForm, setDisbursementForm] = useState({ ...emptyDisbursement });
  const [savingDisbursement, setSavingDisbursement] = useState(false);
  useEscToClose(() => setOpen(false), open);

  async function load() {
    setLoading(true);
    try {
      const [benRes, conRes] = await Promise.all([
        api.get("/beneficiaries"),
        api.get("/contacts"),
      ]);
      setBeneficiaries(benRes.data.result || []);
      setContacts(conRes.data.result || []);
    } catch {
      addToast("Failed to load beneficiaries", "error");
    }
    setLoading(false);
  }
  useEffect(() => { let cancelled = false; load().finally(() => { cancelled = true; }); return () => { cancelled = true; }; }, []);

  async function loadDisbursements(beneficiaryId) {
    try {
      const res = await api.get(`/beneficiaries/${beneficiaryId}/disbursements`);
      setDisbursements(prev => ({ ...prev, [beneficiaryId]: res.data.result || [] }));
    } catch {
      setDisbursements(prev => ({ ...prev, [beneficiaryId]: [] }));
    }
  }

  function toggleExpand(id) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadDisbursements(id);
    }
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm });
    setSaving(false);
    setOpen(true);
  }

  function openEdit(beneficiary) {
    setEditing(beneficiary);
    setForm({
      contact_id: beneficiary.contact_id || "",
      eligibility_start: beneficiary.eligibility_start || "",
      eligibility_end: beneficiary.eligibility_end || "",
      category: beneficiary.category || "General",
      priority: beneficiary.priority || 0,
      notes: beneficiary.notes || "",
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
        eligibility_start: form.eligibility_start,
        eligibility_end: form.eligibility_end || null,
        category: form.category || "General",
        priority: Number(form.priority) || 0,
        notes: form.notes.trim() || null,
      };

      if (editing) {
        await api.patch(`/beneficiaries/${editing.id}`, payload);
        addToast("Beneficiary updated", "success");
      } else {
        await api.post("/beneficiaries", payload);
        addToast("Beneficiary added", "success");
      }
      setOpen(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save beneficiary", "error");
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm("Remove this beneficiary?")) return;
    try {
      await api.delete(`/beneficiaries/${id}`);
      addToast("Beneficiary removed", "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to remove beneficiary", "error");
    }
  }

  function openAddDisbursement(beneficiaryId) {
    setDisbursementModal({ open: true, beneficiaryId, editing: null });
    setDisbursementForm({ ...emptyDisbursement });
    setSavingDisbursement(false);
  }

  function openEditDisbursement(beneficiaryId, disbursement) {
    setDisbursementModal({ open: true, beneficiaryId, editing: disbursement });
    setDisbursementForm({
      amount: String(disbursement.amount || ""),
      disbursement_date: disbursement.disbursement_date || "",
      purpose: disbursement.purpose || "",
      mode: disbursement.mode || "cash",
      reference_no: disbursement.reference_no || "",
      notes: disbursement.notes || "",
    });
    setSavingDisbursement(false);
  }

  async function handleSaveDisbursement(e) {
    e.preventDefault();
    if (!disbursementForm.purpose.trim()) {
      addToast("Purpose is required", "error");
      return;
    }
    setSavingDisbursement(true);
    try {
      const payload = {
        amount: Number(disbursementForm.amount) || 0,
        disbursement_date: disbursementForm.disbursement_date,
        purpose: disbursementForm.purpose.trim(),
        mode: disbursementForm.mode,
        reference_no: disbursementForm.reference_no.trim() || null,
        notes: disbursementForm.notes.trim() || null,
      };

      if (disbursementModal.editing) {
        await api.patch(`/beneficiaries/disbursements/${disbursementModal.editing.id}`, payload);
        addToast("Disbursement updated", "success");
      } else {
        await api.post(`/beneficiaries/${disbursementModal.beneficiaryId}/disbursements`, payload);
        addToast("Disbursement added", "success");
      }
      setDisbursementModal({ open: false, beneficiaryId: null, editing: null });
      loadDisbursements(disbursementModal.beneficiaryId);
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save disbursement", "error");
    }
    setSavingDisbursement(false);
  }

  async function handleDeleteDisbursement(disbursementId) {
    if (!window.confirm("Remove this disbursement record?")) return;
    try {
      await api.delete(`/beneficiaries/disbursements/${disbursementId}`);
      addToast("Disbursement removed", "success");
      loadDisbursements(disbursementModal.beneficiaryId);
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to remove disbursement", "error");
    }
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Heart className="text-rose-600" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Beneficiaries</h1>
              <p className="text-sm text-stone-500">Manage beneficiary registry and disbursements</p>
            </div>
          </div>
          {canEdit && (
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openAdd}
              className="flex items-center gap-2 bg-saffron-500 hover:bg-saffron-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
              <Plus size={18} /> Add Beneficiary
            </motion.button>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
            <p>Loading beneficiaries...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {beneficiaries.length === 0 ? (
              <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
                <p>No beneficiaries yet. Add your first beneficiary to get started.</p>
              </div>
            ) : (
              beneficiaries.map((beneficiary) => {
                const isExpanded = expandedId === beneficiary.id;
                const benDisbursements = disbursements[beneficiary.id] || [];
                const totalDisbursed = benDisbursements.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

                return (
                  <div key={beneficiary.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button onClick={() => toggleExpand(beneficiary.id)} className="text-stone-400 hover:text-stone-600">
                          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>
                        <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-sm font-bold">
                          {(beneficiary.contacts?.name || "?").split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-stone-800">{beneficiary.contacts?.name || "Unknown"}</div>
                          <div className="text-xs text-stone-500">{beneficiary.category} {beneficiary.contacts?.phone ? "- ${beneficiary.contacts.phone}" : ""}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs text-stone-500">Total Disbursed</div>
                          <div className="text-sm font-bold text-stone-900">{fmt(totalDisbursed)}</div>
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => openAddDisbursement(beneficiary.id)} className="p-1.5 rounded-lg hover:bg-saffron-50 text-stone-400 hover:text-saffron-600" title="Add disbursement">
                              <Plus size={14} />
                            </button>
                            <button onClick={() => openEdit(beneficiary)} className="p-1.5 rounded-lg hover:bg-royal-50 text-stone-400 hover:text-royal-600" title="Edit">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => handleDelete(beneficiary.id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-stone-400 hover:text-rose-600" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-stone-100 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-stone-700">Disbursements</h3>
                        </div>
                        {benDisbursements.length === 0 ? (
                          <p className="text-xs text-stone-400">No disbursements yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {benDisbursements.map((d) => (
                              <div key={d.id} className="flex items-center justify-between bg-stone-50 rounded-lg px-3 py-2">
                                <div>
                                  <div className="text-sm font-medium text-stone-800">{d.purpose}</div>
                                  <div className="text-xs text-stone-500">{d.disbursement_date} - {d.mode} {d.reference_no ? "- Ref: {d.reference_no}" : ""}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-stone-900">{fmt(d.amount)}</span>
                                  {canEdit && (
                                    <button onClick={() => handleDeleteDisbursement(d.id)} className="p-1 rounded hover:bg-rose-50 text-stone-400 hover:text-rose-600">
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

        {/* Add/Edit Beneficiary Modal */}
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
              <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-bold text-stone-900">{editing ? "Edit Beneficiary" : "Add Beneficiary"}</h2>
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
                        <option key={c.id} value={c.id}>{c.name} {c.email ? `({c.email})` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Eligibility Start</label>
                      <input type="date" required value={form.eligibility_start}
                        onChange={(e) => setForm({ ...form, eligibility_start: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Eligibility End</label>
                      <input type="date" value={form.eligibility_end}
                        onChange={(e) => setForm({ ...form, eligibility_end: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Category</label>
                    <input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Notes</label>
                    <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors resize-none" />
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={saving}
                    className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                    {saving ? "Saving..." : editing ? "Update Beneficiary" : "Add Beneficiary"}
                  </motion.button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Disbursement Modal */}
        <AnimatePresence>
          {disbursementModal.open && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
              <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-bold text-stone-900">{disbursementModal.editing ? "Edit Disbursement" : "Add Disbursement"}</h2>
                  <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                    onClick={() => setDisbursementModal({ open: false, beneficiaryId: null, editing: null })} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
                </div>
                <form onSubmit={handleSaveDisbursement} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Amount</label>
                    <input type="number" step="0.01" required value={disbursementForm.amount}
                      onChange={(e) => setDisbursementForm({ ...disbursementForm, amount: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Purpose</label>
                    <input type="text" required value={disbursementForm.purpose}
                      onChange={(e) => setDisbursementForm({ ...disbursementForm, purpose: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Date</label>
                      <input type="date" required value={disbursementForm.disbursement_date}
                        onChange={(e) => setDisbursementForm({ ...disbursementForm, disbursement_date: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Mode</label>
                      <select value={disbursementForm.mode} onChange={(e) => setDisbursementForm({ ...disbursementForm, mode: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                        <option value="cash">Cash</option>
                        <option value="digital">Digital</option>
                        <option value="cheque">Cheque</option>
                        <option value="bank_transfer">Bank Transfer</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Reference No (optional)</label>
                    <input type="text" value={disbursementForm.reference_no}
                      onChange={(e) => setDisbursementForm({ ...disbursementForm, reference_no: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Notes</label>
                    <textarea rows={2} value={disbursementForm.notes} onChange={(e) => setDisbursementForm({ ...disbursementForm, notes: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors resize-none" />
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={savingDisbursement}
                    className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                    {savingDisbursement ? "Saving..." : disbursementModal.editing ? "Update Disbursement" : "Add Disbursement"}
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
