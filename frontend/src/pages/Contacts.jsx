import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Trash2, Pencil, Search, RefreshCw, Upload, Download, FileSpreadsheet, CheckCircle, AlertTriangle, ArrowRight } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import useEscToClose from "../hooks/useEscToClose";

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
  const [refreshing, setRefreshing] = useState(false);
  useEscToClose(() => setOpen(false), open);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStep, setBulkStep] = useState(1);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkPreview, setBulkPreview] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  useEscToClose(() => { setBulkOpen(false); resetBulk(); }, bulkOpen);

  function resetBulk() {
    setBulkStep(1);
    setBulkFile(null);
    setBulkPreview(null);
    setBulkLoading(false);
    setBulkResult(null);
  }

  function load() { api.get("/contacts").then((res) => setContacts(res.data.result)); }
  useEffect(load, []);

  function handleRefresh() { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 600); }

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

  function handleFileDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) { addToast("Please upload a CSV file", "error"); return; }
    setBulkFile(file);
  }

  async function handlePreview() {
    if (!bulkFile) return;
    setBulkLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', bulkFile);
      const res = await api.post('/contacts/bulk/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const rows = res.data.result.rows.map((r) => ({ ...r, action: r.isDuplicate ? 'skip' : 'import' }));
      setBulkPreview({ ...res.data.result, rows });
      setBulkStep(2);
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to parse CSV", "error");
    }
    setBulkLoading(false);
  }

  function setRowAction(idx, action) {
    setBulkPreview((prev) => {
      const rows = [...prev.rows];
      rows[idx] = { ...rows[idx], action };
      return { ...prev, rows };
    });
  }

  function setAllDuplicatesAction(action) {
    setBulkPreview((prev) => {
      const rows = prev.rows.map((r) => r.isDuplicate ? { ...r, action } : r);
      return { ...prev, rows };
    });
  }

  async function handleBulkConfirm() {
    setBulkLoading(true);
    try {
      const payload = { rows: bulkPreview.rows };
      const res = await api.post('/contacts/bulk/confirm', payload);
      setBulkResult(res.data.result);
      setBulkStep(3);
      addToast(`Imported ${res.data.result.imported}, updated ${res.data.result.updated}`, "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Bulk import failed", "error");
    }
    setBulkLoading(false);
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Contacts</h1>
        <div className="flex items-center gap-2">
          {canAdd && (
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleRefresh}
              className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 transition-colors">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </motion.button>
          )}
          {canAdd && (
            <a href="/sample-contacts.csv" download
              className="flex items-center gap-2 border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
              <Download size={15} /> Sample CSV
            </a>
          )}
          {canAdd && (
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => { resetBulk(); setBulkOpen(true); }}
              className="flex items-center gap-2 border border-saffron-200 bg-saffron-50 text-saffron-700 hover:bg-saffron-100 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
              <Upload size={15} /> Bulk Upload
            </motion.button>
          )}
          {canAdd && (
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openAdd}
            className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-saffron-500/20 transition-all">
            <Plus size={16} /> Add Contact
          </motion.button>
        )}
        </div>
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

      <AnimatePresence>
        {bulkOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl shadow-black/20 max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h2 className="text-lg font-bold text-stone-900">Bulk Upload Contacts</h2>
                  <p className="text-xs text-stone-500 mt-0.5">Step {bulkStep} of 3</p>
                </div>
                <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                  onClick={() => { setBulkOpen(false); resetBulk(); }} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
              </div>

              {bulkStep === 1 && (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8">
                  <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full max-w-sm border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${dragOver ? 'border-saffron-400 bg-saffron-50' : 'border-stone-300 hover:border-saffron-300 hover:bg-stone-50'}`}>
                    <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileDrop} />
                    <FileSpreadsheet size={40} className={`mx-auto mb-3 ${dragOver ? 'text-saffron-500' : 'text-stone-400'}`} />
                    <p className="text-sm font-medium text-stone-700">{bulkFile ? bulkFile.name : 'Drop CSV file here or click to browse'}</p>
                    {bulkFile && <p className="text-xs text-stone-500 mt-1">{(bulkFile.size / 1024).toFixed(1)} KB</p>}
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={!bulkFile || bulkLoading}
                    onClick={handlePreview}
                    className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl px-6 py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                    {bulkLoading ? 'Parsing...' : 'Preview Contacts'} <ArrowRight size={16} />
                  </motion.button>
                </div>
              )}

              {bulkStep === 2 && bulkPreview && (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-medium text-stone-700">{bulkPreview.rows.length} rows found</span>
                      {bulkPreview.rows.some((r) => r.isDuplicate) && (
                        <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                          <AlertTriangle size={12} />
                          {bulkPreview.rows.filter((r) => r.isDuplicate).length} duplicates
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-stone-500">Duplicates:</span>
                      <button onClick={() => setAllDuplicatesAction('skip')}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${bulkPreview.rows.filter((r) => r.isDuplicate).every((r) => r.action === 'skip') ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
                        Skip All
                      </button>
                      <button onClick={() => setAllDuplicatesAction('overwrite')}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${bulkPreview.rows.filter((r) => r.isDuplicate).every((r) => r.action === 'overwrite') ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
                        Overwrite All
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto border border-stone-200 rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-stone-50 text-stone-500 text-left sticky top-0">
                        <tr>
                          <th className="px-3 py-2.5 font-semibold text-xs">#</th>
                          <th className="px-3 py-2.5 font-semibold text-xs">Name</th>
                          <th className="px-3 py-2.5 font-semibold text-xs">Email</th>
                          <th className="px-3 py-2.5 font-semibold text-xs">Phone</th>
                          <th className="px-3 py-2.5 font-semibold text-xs">Status</th>
                          <th className="px-3 py-2.5 font-semibold text-xs">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkPreview.rows.map((r, i) => (
                          <tr key={i} className={`border-t border-stone-100 ${r.isDuplicate ? 'bg-amber-50/50' : ''}`}>
                            <td className="px-3 py-2.5 text-stone-400 text-xs">{r.row}</td>
                            <td className="px-3 py-2.5 font-medium text-stone-800">{r.name}</td>
                            <td className="px-3 py-2.5 text-stone-600">{r.email || '-'}</td>
                            <td className="px-3 py-2.5 text-stone-600">{r.phone || '-'}</td>
                            <td className="px-3 py-2.5">
                              {r.isDuplicate ? (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Duplicate</span>
                              ) : (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">New</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {r.isDuplicate ? (
                                <select value={r.action} onChange={(e) => setRowAction(i, e.target.value)}
                                  className="text-xs border border-stone-200 rounded-lg px-2 py-1 focus:border-saffron-400 bg-white">
                                  <option value="skip">Skip</option>
                                  <option value="overwrite">Overwrite</option>
                                </select>
                              ) : (
                                <span className="text-xs text-emerald-600 font-medium">Will import</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-stone-100">
                    <button onClick={() => { setBulkStep(1); setBulkPreview(null); setBulkFile(null); }}
                      className="text-sm text-stone-500 hover:text-stone-700 transition-colors">Back</button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={bulkLoading}
                      onClick={handleBulkConfirm}
                      className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl px-6 py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                      {bulkLoading ? 'Importing...' : `Import ${bulkPreview.rows.filter((r) => r.action !== 'skip').length} contacts`}
                      <CheckCircle size={16} />
                    </motion.button>
                  </div>
                </div>
              )}

              {bulkStep === 3 && bulkResult && (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle size={32} className="text-emerald-600" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-lg font-bold text-stone-900">Import Complete</h3>
                    <p className="text-sm text-stone-500 mt-1">Your contacts have been processed</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-emerald-600">{bulkResult.imported}</p>
                      <p className="text-xs text-stone-500">Imported</p>
                    </div>
                    {bulkResult.updated > 0 && <div className="text-center">
                      <p className="text-2xl font-bold text-royal-600">{bulkResult.updated}</p>
                      <p className="text-xs text-stone-500">Updated</p>
                    </div>}
                    {bulkResult.skipped > 0 && <div className="text-center">
                      <p className="text-2xl font-bold text-stone-400">{bulkResult.skipped}</p>
                      <p className="text-xs text-stone-500">Skipped</p>
                    </div>}
                    {bulkResult.errors.length > 0 && <div className="text-center">
                      <p className="text-2xl font-bold text-rose-500">{bulkResult.errors.length}</p>
                      <p className="text-xs text-stone-500">Errors</p>
                    </div>}
                  </div>
                  {bulkResult.errors.length > 0 && (
                    <div className="w-full max-w-sm bg-rose-50 rounded-xl p-4 max-h-32 overflow-y-auto">
                      {bulkResult.errors.map((e, i) => (
                        <p key={i} className="text-xs text-rose-600">Row {e.row}: {e.reason}</p>
                      ))}
                    </div>
                  )}
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => { setBulkOpen(false); resetBulk(); }}
                    className="bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl px-6 py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all">
                    Done
                  </motion.button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
