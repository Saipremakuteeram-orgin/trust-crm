import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Pencil, Trash2, Download, FileText, DollarSign, Calendar, User, Hash } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import useEscToClose from "../hooks/useEscToClose";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

const PAYMENT_MODES = ["cash", "digital", "cheque", "bank_transfer"];

const emptyForm = {
  transaction_id: "",
  donor_id: "",
  amount: "",
  receipt_date: new Date().toISOString().slice(0, 10),
  payment_mode: "cash",
  section_80g: false,
  section_12a: false,
  acknowledgement_number: "",
  pan_number: "",
  address: "",
  notes: "",
};

export default function Receipts() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canEdit = role === "admin" || role === "accountant";

  const [receipts, setReceipts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  useEscToClose(() => setOpen(false), open);

  async function load() {
    setLoading(true);
    try {
      const [receiptsRes, contactsRes, txnsRes] = await Promise.all([
        api.get("/receipts"),
        api.get("/contacts"),
        api.get("/transactions"),
      ]);
      setReceipts(receiptsRes.data.result || []);
      setContacts(contactsRes.data.result || []);
      setTransactions(txnsRes.data.result || []);
    } catch {
      addToast("Failed to load receipts", "error");
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

  function openEdit(receipt) {
    setEditing(receipt);
    setForm({
      transaction_id: receipt.transaction_id || "",
      donor_id: receipt.donor_id || "",
      amount: String(receipt.amount || ""),
      receipt_date: receipt.receipt_date || "",
      payment_mode: receipt.payment_mode || "cash",
      section_80g: receipt.section_80g || false,
      section_12a: receipt.section_12a || false,
      acknowledgement_number: receipt.acknowledgement_number || "",
      pan_number: receipt.pan_number || "",
      address: receipt.address || "",
      notes: receipt.notes || "",
    });
    setSaving(false);
    setOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.donor_id || !form.amount || Number(form.amount) <= 0) {
      addToast("Donor and valid amount are required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        transaction_id: form.transaction_id || null,
        donor_id: form.donor_id,
        amount: Number(form.amount),
        receipt_date: form.receipt_date,
        payment_mode: form.payment_mode,
        section_80g: form.section_80g,
        section_12a: form.section_12a,
        acknowledgement_number: form.acknowledgement_number.trim() || null,
        pan_number: form.pan_number.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      };

      if (editing) {
        await api.patch(`/receipts/${editing.id}`, payload);
        addToast("Receipt updated", "success");
      } else {
        await api.post("/receipts", payload);
        addToast("Receipt created", "success");
      }
      setOpen(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save receipt", "error");
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm("Remove this receipt?")) return;
    try {
      await api.delete(`/receipts/${id}`);
      addToast("Receipt removed", "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to remove receipt", "error");
    }
  }

  function handlePrint(receipt) {
    addToast("Preparing receipt for download...", "success");
    setTimeout(() => {
      const receiptText = `
DONATION RECEIPT
================

Receipt Number: ${receipt.receipt_number}
Date: ${receipt.receipt_date}

Donor: ${receipt.contacts?.name || 'Unknown'}
${receipt.address ? `Address: ${receipt.address}` : ''}
${receipt.pan_number ? `PAN: ${receipt.pan_number}` : ''}

Amount: ${fmt(receipt.amount)}
Payment Mode: ${receipt.payment_mode}

${receipt.section_80g ? 'Section 80G Certificate Applicable' : ''}
${receipt.section_12a ? 'Section 12A Certificate Applicable' : ''}
${receipt.acknowledgement_number ? `Acknowledgement: ${receipt.acknowledgement_number}` : ''}

Notes: ${receipt.notes || 'N/A'}

Issued by: ${profile?.name || 'Admin'}
Issued at: ${new Date(receipt.issued_at || Date.now()).toLocaleString()}
      `.trim();

      const blob = new Blob([receiptText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${receipt.receipt_number}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    }, 500);
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FileText className="text-royal-600" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Donation Receipts</h1>
              <p className="text-sm text-stone-500">Manage donation receipts and certificates</p>
            </div>
          </div>
          {canEdit && (
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openAdd}
              className="flex items-center gap-2 bg-saffron-500 hover:bg-saffron-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
              <Plus size={18} /> New Receipt
            </motion.button>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
            <p>Loading receipts...</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-stone-400 uppercase tracking-wider bg-stone-50">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Receipt #</th>
                    <th className="py-3 px-4 font-semibold">Date</th>
                    <th className="py-3 px-4 font-semibold">Donor</th>
                    <th className="py-3 px-4 font-semibold">Amount</th>
                    <th className="py-3 px-4 font-semibold">Mode</th>
                    <th className="py-3 px-4 font-semibold">Tax Benefits</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {receipts.map((receipt) => (
                    <tr key={receipt.id} className="hover:bg-stone-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Hash size={14} className="text-stone-400" />
                          <span className="font-mono text-xs font-medium text-stone-800">{receipt.receipt_number}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-stone-600">{receipt.receipt_date}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-royal-100 text-royal-700 flex items-center justify-center text-xs font-bold">
                            {(receipt.contacts?.name || "?").split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-medium text-stone-800">{receipt.contacts?.name || "Unknown"}</div>
                            {receipt.contacts?.phone && <div className="text-xs text-stone-400">{receipt.contacts.phone}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-stone-900 font-semibold">{fmt(receipt.amount)}</td>
                      <td className="py-3 px-4 text-stone-600 capitalize">{receipt.payment_mode}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          {receipt.section_80g && (
                            <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">80G</span>
                          )}
                          {receipt.section_12a && (
                            <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700">12A</span>
                          )}
                          {!receipt.section_80g && !receipt.section_12a && (
                            <span className="text-xs text-stone-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {canEdit && (
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handlePrint(receipt)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-stone-400 hover:text-emerald-600" title="Print/Download">
                              <Download size={14} />
                            </button>
                            <button onClick={() => openEdit(receipt)} className="p-1.5 rounded-lg hover:bg-royal-50 text-stone-400 hover:text-royal-600" title="Edit">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => handleDelete(receipt.id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-stone-400 hover:text-rose-600" title="Delete">
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
            {receipts.length === 0 && (
              <div className="p-12 text-center text-stone-400">
                <p>No receipts yet. Create your first receipt to get started.</p>
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
                  <h2 className="text-lg font-bold text-stone-900">{editing ? "Edit Receipt" : "New Receipt"}</h2>
                  <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                    onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Donor</label>
                    <select required value={form.donor_id} onChange={(e) => setForm({ ...form, donor_id: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                      <option value="">Select donor</option>
                      {contacts.map(c => (
                        <option key={c.id} value={c.id}>{c.name} {c.email ? `(${c.email})` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Amount</label>
                      <input type="number" step="0.01" required value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Receipt Date</label>
                      <input type="date" required value={form.receipt_date}
                        onChange={(e) => setForm({ ...form, receipt_date: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Payment Mode</label>
                    <select value={form.payment_mode} onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                      {PAYMENT_MODES.map(m => (
                        <option key={m} value={m}>{m.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={form.section_80g} onChange={(e) => setForm({ ...form, section_80g: e.target.checked })}
                        className="rounded border-stone-300 text-saffron-600 focus:ring-saffron-500" />
                      <span className="text-sm text-stone-700">Section 80G</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={form.section_12a} onChange={(e) => setForm({ ...form, section_12a: e.target.checked })}
                        className="rounded border-stone-300 text-royal-600 focus:ring-royal-500" />
                      <span className="text-sm text-stone-700">Section 12A</span>
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">PAN Number</label>
                    <input type="text" value={form.pan_number} onChange={(e) => setForm({ ...form, pan_number: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Address</label>
                    <textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Notes</label>
                    <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors resize-none" />
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={saving}
                    className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                    {saving ? "Saving..." : editing ? "Update Receipt" : "Create Receipt"}
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
