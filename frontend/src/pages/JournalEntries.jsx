import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Pencil, Trash2, Send, BookOpen, CheckCircle2 } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import useEscToClose from "../hooks/useEscToClose";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

const emptyForm = {
  entry_date: new Date().toISOString().slice(0, 10),
  description: "",
  reference: "",
  lines: [{ account_id: "", description: "", debit: "", credit: "" }],
};

export default function JournalEntries() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canEdit = role === "admin" || role === "accountant";

  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  useEscToClose(() => setOpen(false), open);

  async function load() {
    setLoading(true);
    try {
      const [entriesRes, accountsRes] = await Promise.all([
        api.get("/journal-entries"),
        api.get("/accounts"),
      ]);
      setEntries(entriesRes.data.result || []);
      setAccounts(accountsRes.data.result.flat || []);
    } catch {
      addToast("Failed to load data", "error");
    }
    setLoading(false);
  }
  useEffect(load, []);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm });
    setSaving(false);
    setOpen(true);
  }

  function openEdit(entry) {
    setEditing(entry);
    const lines = entry.journal_entry_lines?.map(line => ({
      account_id: line.account_id || "",
      description: line.description || "",
      debit: line.debit || "",
      credit: line.credit || "",
    })) || [{ account_id: "", description: "", debit: "", credit: "" }];

    setForm({
      entry_date: entry.entry_date,
      description: entry.description,
      reference: entry.reference || "",
      lines,
    });
    setSaving(false);
    setOpen(true);
  }

  function addLine() {
    setForm(prev => ({
      ...prev,
      lines: [...prev.lines, { account_id: "", description: "", debit: "", credit: "" }]
    }));
  }

  function removeLine(index) {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index)
    }));
  }

  function updateLine(index, field, value) {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.map((line, i) => i === index ? { ...line, [field]: value } : line)
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.description.trim()) {
      addToast("Description is required", "error");
      return;
    }

    const validLines = form.lines.filter(l => l.account_id);
    if (validLines.length === 0) {
      addToast("At least one account line is required", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        entry_date: form.entry_date,
        description: form.description.trim(),
        reference: form.reference.trim() || null,
        lines: validLines.map(l => ({
          account_id: l.account_id,
          description: l.description.trim() || null,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        })),
      };

      if (editing) {
        await api.patch(`/journal-entries/${editing.id}`, payload);
        addToast("Journal entry updated", "success");
      } else {
        await api.post("/journal-entries", payload);
        addToast("Journal entry created as draft", "success");
      }
      setOpen(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save journal entry", "error");
    }
    setSaving(false);
  }

  async function handlePost(id) {
    try {
      await api.post(`/journal-entries/${id}/post`);
      addToast("Journal entry posted", "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to post entry", "error");
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this journal entry?")) return;
    try {
      await api.delete(`/journal-entries/${id}`);
      addToast("Journal entry deleted", "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to delete entry", "error");
    }
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BookOpen className="text-royal-600" size={28} />
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
        ) : (
          <div className="space-y-4">
            {entries.length === 0 ? (
              <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
                <p>No journal entries yet. Create your first entry to get started.</p>
              </div>
            ) : (
              entries.map((entry) => (
                <div key={entry.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-stone-900">{entry.entry_number}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${entry.is_posted ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {entry.is_posted ? "Posted" : "Draft"}
                          </span>
                        </div>
                        <div className="text-xs text-stone-500 mt-0.5">{entry.description}</div>
                        <div className="text-xs text-stone-400">{entry.entry_date} {entry.reference ? `- Ref: ${entry.reference}` : ""}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!entry.is_posted && canEdit && (
                        <>
                          <button onClick={() => handlePost(entry.id)} className="p-2 rounded-lg hover:bg-emerald-50 text-stone-400 hover:text-emerald-600" title="Post">
                            <Send size={16} />
                          </button>
                          <button onClick={() => openEdit(entry)} className="p-2 rounded-lg hover:bg-royal-50 text-stone-400 hover:text-royal-600" title="Edit">
                            <Pencil size={16} />
                          </button>
                          <button onClick={() => handleDelete(entry.id)} className="p-2 rounded-lg hover:bg-rose-50 text-stone-400 hover:text-rose-600" title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                      {entry.is_posted && (
                        <CheckCircle2 size={18} className="text-emerald-600" />
                      )}
                    </div>
                  </div>
                  <div className="border-t border-stone-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-stone-400 uppercase tracking-wider bg-stone-50">
                        <tr>
                          <th className="py-2 px-4 font-semibold">Account</th>
                          <th className="py-2 px-4 font-semibold">Description</th>
                          <th className="py-2 px-4 font-semibold text-right">Debit</th>
                          <th className="py-2 px-4 font-semibold text-right">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {entry.journal_entry_lines?.map((line, idx) => (
                          <tr key={idx}>
                            <td className="py-2 px-4 text-stone-700">{accounts.find(a => a.id === line.account_id)?.name || "-"}</td>
                            <td className="py-2 px-4 text-stone-500">{line.description || "-"}</td>
                            <td className="py-2 px-4 text-right font-medium text-stone-800">{line.debit ? fmt(line.debit) : "-"}</td>
                            <td className="py-2 px-4 text-right font-medium text-stone-800">{line.credit ? fmt(line.credit) : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
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
                className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl shadow-black/20 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-bold text-stone-900">{editing ? "Edit Journal Entry" : "New Journal Entry"}</h2>
                  <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                    onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Date</label>
                      <input type="date" required value={form.entry_date}
                        onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Reference (optional)</label>
                      <input type="text" placeholder="Invoice #, Receipt #" value={form.reference}
                        onChange={(e) => setForm({ ...form, reference: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Description</label>
                    <input type="text" required placeholder="e.g., Payment for event supplies" value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-stone-500">Lines</label>
                      <button type="button" onClick={addLine} className="text-xs text-saffron-600 hover:text-saffron-700 font-medium">+ Add Line</button>
                    </div>
                    <div className="space-y-2">
                      {form.lines.map((line, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                          <div className="col-span-4">
                            <select value={line.account_id} onChange={(e) => updateLine(idx, "account_id", e.target.value)}
                              className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-saffron-400 transition-colors">
                              <option value="">Select account</option>
                              {accounts.map(a => (
                                <option key={a.id} value={a.id}>{a.name} ({a.account_code})</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-3">
                            <input type="text" placeholder="Description" value={line.description}
                              onChange={(e) => updateLine(idx, "description", e.target.value)}
                              className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-saffron-400 transition-colors" />
                          </div>
                          <div className="col-span-2">
                            <input type="number" step="0.01" placeholder="Debit" value={line.debit}
                              onChange={(e) => updateLine(idx, "debit", e.target.value)}
                              className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-saffron-400 transition-colors" />
                          </div>
                          <div className="col-span-2">
                            <input type="number" step="0.01" placeholder="Credit" value={line.credit}
                              onChange={(e) => updateLine(idx, "credit", e.target.value)}
                              className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-saffron-400 transition-colors" />
                          </div>
                          <div className="col-span-1 flex items-center justify-center">
                            {form.lines.length > 1 && (
                              <button type="button" onClick={() => removeLine(idx)} className="p-1.5 rounded-lg hover:bg-rose-50 text-stone-400 hover:text-rose-600">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={saving}
                    className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                    {saving ? "Saving..." : editing ? "Update Entry" : "Save as Draft"}
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
