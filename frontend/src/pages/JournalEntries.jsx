import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Pencil, Trash2, Send, CheckCircle2, Clock, FileText, Calendar } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import useEscToClose from "../hooks/useEscToClose";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

const emptyLine = { account_id: "", description: "", debit: "", credit: "" };

export default function JournalEntries() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canEdit = role === "admin" || role === "accountant";

  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, editing: null });
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), description: "", reference: "", lines: [{ ...emptyLine }, { ...emptyLine }] });
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  useEscToClose(() => setModal({ open: false, editing: null }), modal.open);

  async function load() {
    setLoading(true);
    try {
      const [entriesRes, accountsRes] = await Promise.all([
        api.get("/journal-entries"),
        api.get("/accounts"),
      ]);
      setEntries(entriesRes.data.result || []);
      setAccounts(accountsRes.data.result || []);
    } catch {
      addToast("Failed to load data", "error");
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openAdd() {
    setForm({ date: new Date().toISOString().slice(0, 10), description: "", reference: "", lines: [{ ...emptyLine }, { ...emptyLine }] });
    setModal({ open: true, editing: null });
    setSaving(false);
  }

  function openEdit(entry) {
    const lines = entry.journal_entry_lines?.map(l => ({
      account_id: l.account_id || "",
      description: l.description || "",
      debit: l.debit || "",
      credit: l.credit || "",
    })) || [{ ...emptyLine }, { ...emptyLine }];
    setForm({
      date: entry.entry_date,
      description: entry.description,
      reference: entry.reference || "",
      lines,
    });
    setModal({ open: true, editing: entry });
    setSaving(false);
  }

  function addLine() {
    setForm({ ...form, lines: [...form.lines, { ...emptyLine }] });
  }

  function updateLine(index, field, value) {
    const newLines = [...form.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setForm({ ...form, lines: newLines });
  }

  function removeLine(index) {
    if (form.lines.length <= 2) {
      addToast("At least 2 lines are required", "error");
      return;
    }
    const newLines = form.lines.filter((_, i) => i !== index);
    setForm({ ...form, lines: newLines });
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.description.trim()) {
      addToast("Description is required", "error");
      return;
    }
    const validLines = form.lines.filter(l => l.account_id);
    if (validLines.length < 2) {
      addToast("At least 2 lines with accounts are required", "error");
      return;
    }

    const totalDebit = form.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const totalCredit = form.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      addToast("Debits must equal credits", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        date: form.date,
        description: form.description.trim(),
        reference: form.reference.trim() || null,
        lines: form.lines.filter(l => l.account_id).map(l => ({
          account_id: l.account_id,
          description: l.description?.trim() || null,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        })),
      };

      if (modal.editing) {
        await api.patch(`/journal-entries/${modal.editing.id}`, payload);
        addToast("Entry updated", "success");
      } else {
        await api.post("/journal-entries", payload);
        addToast("Entry created", "success");
      }
      setModal({ open: false, editing: null });
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save entry", "error");
    }
    setSaving(false);
  }

  async function handlePost(id) {
    setPosting(true);
    try {
      await api.post(`/journal-entries/${id}/post`);
      addToast("Entry posted successfully", "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to post entry", "error");
    }
    setPosting(false);
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this journal entry?")) return;
    try {
      await api.delete(`/journal-entries/${id}`);
      addToast("Entry deleted", "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to delete entry", "error");
    }
  }

  const totalDebit = form.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = form.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FileText className="text-royal-600" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Journal Entries</h1>
              <p className="text-sm text-stone-500">Record and manage double-entry transactions</p>
            </div>
          </div>
          {canEdit && (
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openAdd}
              className="flex items-center gap-2 bg-saffron-500 hover:bg-saffron-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
              <Plus size={18} /> New Entry
            </motion.button>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
            <p>Loading journal entries...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
            <p>No journal entries yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-stone-400 uppercase tracking-wider bg-stone-50">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Entry #</th>
                    <th className="py-3 px-4 font-semibold">Date</th>
                    <th className="py-3 px-4 font-semibold">Description</th>
                    <th className="py-3 px-4 font-semibold text-right">Total Debit</th>
                    <th className="py-3 px-4 font-semibold text-right">Total Credit</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {entries.map((entry) => {
                    const debitTotal = entry.journal_entry_lines?.reduce((s, l) => s + (Number(l.debit) || 0), 0) || 0;
                    const creditTotal = entry.journal_entry_lines?.reduce((s, l) => s + (Number(l.credit) || 0), 0) || 0;
                    return (
                      <tr key={entry.id} className="hover:bg-stone-50">
                        <td className="py-3 px-4 font-mono text-stone-600">{entry.entry_number}</td>
                            <td className="py-3 px-4 text-stone-600">{entry.entry_date}</td>
                        <td className="py-3 px-4">
                          <div className="text-stone-800">{entry.description}</div>
                          {entry.reference && <div className="text-xs text-stone-400">Ref: {entry.reference}</div>}
                        </td>
                        <td className="py-3 px-4 text-right text-rose-700">{fmt(debitTotal)}</td>
                        <td className="py-3 px-4 text-right text-emerald-700">{fmt(creditTotal)}</td>
                        <td className="py-3 px-4">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${entry.is_posted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {entry.is_posted ? 'Posted' : 'Draft'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {!entry.is_posted && canEdit && (
                            <>
                              <button onClick={() => openEdit(entry)} className="text-stone-400 hover:text-royal-600 mr-2">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => handlePost(entry.id)} disabled={posting} className="text-stone-400 hover:text-emerald-600 mr-2" title="Post">
                                <Send size={14} />
                              </button>
                              <button onClick={() => handleDelete(entry.id)} className="text-stone-400 hover:text-rose-600">
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Entry Modal */}
        <AnimatePresence>
          {modal.open && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
              <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white rounded-2xl p-6 w-full max-w-3xl shadow-2xl shadow-black/20 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-bold text-stone-900">{modal.editing ? "Edit Journal Entry" : "New Journal Entry"}</h2>
                  <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                    onClick={() => setModal({ open: false, editing: null })} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
                </div>
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Date</label>
                      <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Reference</label>
                      <input type="text" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Description</label>
                    <input type="text" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>

                  <div className="border-2 border-stone-200 rounded-xl overflow-hidden">
                    <div className="bg-stone-50 px-4 py-2 border-b border-stone-200">
                      <h3 className="text-xs font-semibold text-stone-700 uppercase tracking-wider">Entry Lines</h3>
                    </div>
                    <div className="divide-y divide-stone-100">
                      {form.lines.map((line, index) => (
                        <div key={index} className="p-3 grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-12 sm:col-span-4">
                            <select value={line.account_id} onChange={(e) => updateLine(index, "account_id", e.target.value)}
                              className="w-full border-2 border-stone-200 rounded-lg px-3 py-2 text-sm focus:border-saffron-400 transition-colors">
                              <option value="">Select Account</option>
                              {accounts.map(a => (
                                <option key={a.id} value={a.id}>{a.account_code ? `${a.account_code} - ` : ''}{a.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-6 sm:col-span-3">
                            <input type="text" placeholder="Description" value={line.description} onChange={(e) => updateLine(index, "description", e.target.value)}
                              className="w-full border-2 border-stone-200 rounded-lg px-3 py-2 text-sm focus:border-saffron-400 transition-colors" />
                          </div>
                          <div className="col-span-3 sm:col-span-2">
                            <input type="number" step="0.01" placeholder="Debit" value={line.debit} onChange={(e) => updateLine(index, "debit", e.target.value)}
                              className="w-full border-2 border-stone-200 rounded-lg px-3 py-2 text-sm focus:border-saffron-400 transition-colors" />
                          </div>
                          <div className="col-span-3 sm:col-span-2">
                            <input type="number" step="0.01" placeholder="Credit" value={line.credit} onChange={(e) => updateLine(index, "credit", e.target.value)}
                              className="w-full border-2 border-stone-200 rounded-lg px-3 py-2 text-sm focus:border-saffron-400 transition-colors" />
                          </div>
                          <div className="col-span-12 sm:col-span-1 flex justify-end">
                            <button type="button" onClick={() => removeLine(index)} className="p-1 rounded hover:bg-rose-50 text-stone-400 hover:text-rose-600">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-stone-50 px-4 py-3 border-t border-stone-200 flex items-center justify-between">
                      <button type="button" onClick={addLine} className="flex items-center gap-1 text-xs font-semibold text-saffron-600 hover:text-saffron-700">
                        <Plus size={14} /> Add Line
                      </button>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-stone-600">Debit: <span className="font-semibold">{fmt(totalDebit)}</span></span>
                        <span className="text-stone-600">Credit: <span className="font-semibold">{fmt(totalCredit)}</span></span>
                        <span className={`font-semibold ${isBalanced ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isBalanced ? 'Balanced' : 'Not Balanced'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={saving || !isBalanced}
                    className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                    {saving ? "Saving..." : modal.editing ? "Update Entry" : "Create Entry"}
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
