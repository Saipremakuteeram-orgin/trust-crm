import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Trash2, Pencil, Search, Download, FileText, RefreshCw, Upload } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import useEscToClose from "../hooks/useEscToClose";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

const emptyForm = {
  type: "credit", mode: "cash", digital_method: "upi", amount: "",
  party: "", description: "", txn_date: new Date().toISOString().slice(0, 10),
  notify_contact_ids: [], notify_group_ids: [], category_id: "", voucher_filed: null, edit_reason: "",
};

export default function Transactions() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canAdd = role === "admin" || role === "accountant";
  const canDelete = role === "admin";

  const [txns, setTxns] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterMode, setFilterMode] = useState("all");
  useEscToClose(() => setOpen(false), open);
  const [exporting, setExporting] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  function load() {
    api.get("/transactions").then((res) => setTxns(res.data.result));
    api.get("/contacts").then((res) => setContacts(res.data.result));
    api.get("/groups").then((res) => setGroups(res.data.result)).catch(() => {});
    api.get("/categories").then((res) => setCategories(res.data.result)).catch(() => {});
  }
  useEffect(load, []);

  function handleRefresh() { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 600); }

  const filtered = useMemo(() => {
    return txns.filter((t) => {
      if (search && !(t.party || "").toLowerCase().includes(search.toLowerCase()) && !(t.description || "").toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType !== "all" && t.type !== filterType) return false;
      if (filterMode !== "all" && t.mode !== filterMode) return false;
      return true;
    });
  }, [txns, search, filterType, filterMode]);

  function toggleContact(id) {
    setForm((f) => ({
      ...f,
      notify_contact_ids: f.notify_contact_ids.includes(id)
        ? f.notify_contact_ids.filter((x) => x !== id)
        : [...f.notify_contact_ids, id],
    }));
  }

  function toggleGroup(id) {
    setForm((f) => ({
      ...f,
      notify_group_ids: f.notify_group_ids.includes(id)
        ? f.notify_group_ids.filter((x) => x !== id)
        : [...f.notify_group_ids, id],
    }));
  }

  async function handleToggleVoucher(txn) {
    const newVal = !txn.voucher_filed;
    const reason = window.prompt(`Reason for changing voucher status to "${newVal ? "Filed" : "Not Filed"}":`);
    if (reason === null || !reason.trim()) {
      if (reason !== null) addToast("Please provide a reason", "error");
      return;
    }
    try {
      await api.patch("/transactions/" + txn.id, { voucher_filed: newVal, edit_reason: reason.trim() });
      addToast(`Voucher marked as ${newVal ? "filed" : "not filed"}`, "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to update voucher status", "error");
    }
  }

  function openAdd() { setEditing(null); setForm({ ...emptyForm }); setOpen(true); }

  function openEdit(txn) {
    setEditing(txn);
    setForm({
      type: txn.type, mode: txn.mode, digital_method: txn.digital_method || "upi",
      amount: txn.amount, party: txn.party || "", description: txn.description || "",
      txn_date: txn.txn_date, notify_contact_ids: txn.notify_contact_ids || [],
      notify_group_ids: txn.notify_group_ids || [],
      category_id: txn.category_id || "",
      voucher_filed: txn.mode === "cash" ? !!txn.voucher_filed : null,
      edit_reason: "",
    });
    setOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.mode === "cash" && form.voucher_filed === null) {
      addToast("Please select voucher filed status for cash transactions", "error");
      return;
    }
    if (editing && !form.edit_reason.trim()) {
      addToast("Please provide a reason for this edit", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (payload.mode !== "cash") delete payload.voucher_filed;
      if (!editing) delete payload.edit_reason;
      if (editing) {
        await api.patch("/transactions/" + editing.id, payload);
        addToast("Transaction updated successfully", "success");
      } else {
        await api.post("/transactions", payload);
        addToast("Transaction created successfully", "success");
      }
      setOpen(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save transaction", "error");
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm("Are you sure you want to delete this transaction?")) return;
    try {
      await api.delete("/transactions/" + id);
      addToast("Transaction deleted", "success");
      load();
    } catch (err) {
      addToast("Failed to delete transaction", "error");
    }
  }

  async function exportExcel() {
    setExporting("excel");
    try {
      const res = await api.post("/exports/transactions/excel", {}, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "transactions.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast("Downloaded Excel file", "success");
    } catch (err) {
      addToast("Failed to export Excel", "error");
    } finally {
      setExporting(null);
    }
  }

  async function exportPDF() {
    setExporting("pdf");
    try {
      const res = await api.post("/exports/transactions/pdf", {}, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "transactions.pdf");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast("Downloaded PDF file", "success");
    } catch (err) {
      addToast("Failed to export PDF", "error");
    } finally {
      setExporting(null);
    }
  }

  async function handleRestoreUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      addToast("Please upload an Excel file (.xlsx or .xls)", "error");
      return;
    }
    setRestoring(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = Array.from(new Uint8Array(arrayBuffer));
      const res = await api.post("/backup/restore-excel", {
        fileBuffer: { data, type: "Buffer" },
        fileName: file.name,
      });
      const r = res.data.result;
      addToast(`Restored: ${r.inserted} inserted, ${r.skipped} skipped out of ${r.total}`, "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Restore failed", "error");
    }
    setRestoring(false);
    e.target.value = "";
  }

  const canEdit = role === "admin" || role === "accountant";

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Transactions</h1>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleRefresh}
            className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 transition-colors">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </motion.button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={exportExcel} disabled={exporting === "excel"}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50">
            <Download size={15} className={exporting === "excel" ? "animate-bounce" : ""} />
            {exporting === "excel" ? "Exporting..." : "Excel"}
          </motion.button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={exportPDF} disabled={exporting === "pdf"}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50">
            <FileText size={15} className={exporting === "pdf" ? "animate-pulse" : ""} />
            {exporting === "pdf" ? "Exporting..." : "PDF"}
          </motion.button>
          {canAdd && (
            <label className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors cursor-pointer">
              <Upload size={15} />
              {restoring ? "Restoring..." : "Restore"}
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleRestoreUpload} disabled={restoring} />
            </label>
          )}
          {canAdd && (
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={openAdd}
              className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-saffron-500/20 transition-all duration-300">
              <Plus size={16} /> Add Transaction
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* Search & Filters */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input placeholder="Search by party or description..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border-2 border-stone-200 rounded-xl focus:border-saffron-400 transition-colors" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="border-2 border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-saffron-400 transition-colors">
          <option value="all">All Types</option>
          <option value="credit">Credit</option>
          <option value="debit">Debit</option>
        </select>
        <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)}
          className="border-2 border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-saffron-400 transition-colors">
          <option value="all">All Modes</option>
          <option value="cash">Cash</option>
          <option value="digital">Digital</option>
        </select>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-stone-50 to-stone-100/80 text-stone-500 text-left">
            <tr>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Date</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Type</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Party</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Amount</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Mode</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Category</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Voucher</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Notified</th>
              {(canEdit || canDelete) && <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {filtered.map((t, i) => (
                <motion.tr key={t.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }} className="border-t border-stone-100 table-row-animate">
                  <td className="px-5 py-3.5 text-stone-600">{t.txn_date}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      t.type === "credit" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                    }`}>{t.type === "credit" ? "Credit" : "Debit"}</span>
                    {t.is_recurring && (
                      <span className="ml-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-royal-50 text-royal-600 ring-1 ring-royal-200 uppercase tracking-wider">Recurring</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-stone-800 font-medium">{t.party || "-"}</td>
                  <td className={`px-5 py-3.5 font-bold ${t.type === "credit" ? "text-emerald-700" : "text-rose-700"}`}>{fmt(t.amount)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      t.mode === "cash" ? "bg-saffron-50 text-saffron-700 ring-1 ring-saffron-200" : "bg-royal-50 text-royal-700 ring-1 ring-royal-200"
                    }`}>{t.mode === "cash" ? "Cash" : t.digital_method?.toUpperCase() || "Digital"}</span>
                  </td>
                  <td className="px-5 py-3.5 text-stone-500 text-xs">{t.categories?.name || "-"}</td>
                  <td className="px-5 py-3.5">
                    {t.mode === "cash" ? (
                      <button onClick={() => handleToggleVoucher(t)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-all hover:scale-105 ${
                          t.voucher_filed
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                            : "bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
                        }`} title="Click to toggle">
                        {t.voucher_filed ? "Filed" : "Pending"}
                      </button>
                    ) : (
                      <span className="text-xs text-stone-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      t.notification_status === "sent" ? "bg-emerald-50 text-emerald-600" :
                      t.notification_status === "partial" ? "bg-amber-50 text-amber-600" :
                      t.notification_status === "failed" ? "bg-rose-50 text-rose-600" : "bg-stone-100 text-stone-500"
                    }`}>{t.notification_status}</span>
                  </td>
                  {(canEdit || canDelete) && (
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                            onClick={() => openEdit(t)}
                            className="text-stone-300 hover:text-royal-600 transition-all p-1.5 rounded-lg hover:bg-royal-50" title="Edit">
                            <Pencil size={15} />
                          </motion.button>
                        )}
                        {canDelete && (
                          <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                            onClick={() => handleDelete(t.id)}
                            className="text-stone-300 hover:text-rose-600 transition-all p-1.5 rounded-lg hover:bg-rose-50" title="Delete">
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
              <tr><td colSpan={9} className="px-5 py-12 text-center text-stone-400">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-300">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  </div>
                  <p className="font-medium">{txns.length === 0 ? "No transactions yet" : "No matches found"}</p>
                  <p className="text-xs">{txns.length === 0 ? "Add your first transaction to get started" : "Try adjusting your search or filters"}</p>
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
                <h2 className="text-lg font-bold text-stone-900">{editing ? "Edit Transaction" : "Add Transaction"}</h2>
                <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                  onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex gap-2">
                  <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => setForm({ ...form, type: "credit" })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${form.type === "credit" ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-500/25" : "border-stone-200 text-stone-600 hover:border-emerald-300"}`}>Credit (In)</motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => setForm({ ...form, type: "debit" })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${form.type === "debit" ? "bg-rose-600 text-white border-rose-600 shadow-lg shadow-rose-500/25" : "border-stone-200 text-stone-600 hover:border-rose-300"}`}>Debit (Out)</motion.button>
                </div>

                <input required type="number" placeholder="Amount" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                <input placeholder="Party (donor / vendor name)" value={form.party}
                  onChange={(e) => setForm({ ...form, party: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />

                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                  <option value="">Select Category (optional)</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                <div className="flex gap-2">
                  <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => setForm({ ...form, mode: "cash" })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${form.mode === "cash" ? "bg-saffron-600 text-white border-saffron-600 shadow-lg shadow-saffron-500/25" : "border-stone-200 text-stone-600 hover:border-saffron-300"}`}>Cash</motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => setForm({ ...form, mode: "digital" })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${form.mode === "digital" ? "bg-royal-600 text-white border-royal-600 shadow-lg shadow-royal-500/25" : "border-stone-200 text-stone-600 hover:border-royal-300"}`}>Digital</motion.button>
                </div>

                <AnimatePresence>
                  {form.mode === "cash" && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2">
                      <label className="text-sm font-semibold text-stone-700">Voucher Filed? <span className="text-rose-500">*</span></label>
                      <div className="flex gap-2">
                        <motion.button whileTap={{ scale: 0.95 }} type="button"
                          onClick={() => setForm({ ...form, voucher_filed: true })}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                            form.voucher_filed === true
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-500/25"
                              : "border-stone-200 text-stone-600 hover:border-emerald-300"
                          }`}>Yes, Filed</motion.button>
                        <motion.button whileTap={{ scale: 0.95 }} type="button"
                          onClick={() => setForm({ ...form, voucher_filed: false })}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                            form.voucher_filed === false
                              ? "bg-amber-600 text-white border-amber-600 shadow-lg shadow-amber-500/25"
                              : "border-stone-200 text-stone-600 hover:border-amber-300"
                          }`}>No, Not Filed</motion.button>
                      </div>
                      {form.voucher_filed === null && (
                        <p className="text-xs text-rose-500">Please select voucher status</p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

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
                  <div className="text-sm font-semibold text-stone-700 mb-2">Notify (email + Telegram)</div>
                  {groups.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-stone-500 mb-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-royal-500" />
                        Groups
                      </p>
                      <div className="space-y-1.5 border-2 border-royal-100 rounded-xl p-3 bg-royal-50/30">
                        {groups.map((g) => (
                          <label key={g.id} className="flex items-center justify-between text-sm text-stone-700 cursor-pointer group">
                            <div className="flex items-center gap-2.5">
                              <input type="checkbox" checked={form.notify_group_ids.includes(g.id)}
                                onChange={() => toggleGroup(g.id)} className="rounded border-stone-300 text-royal-600 focus:ring-royal-500" />
                              <span className="group-hover:text-stone-900 transition-colors font-medium">{g.name}</span>
                            </div>
                            <span className="text-[10px] text-stone-400">{g.member_count} members</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5 max-h-32 overflow-y-auto border-2 border-stone-200 rounded-xl p-3">
                    <p className="text-xs font-medium text-stone-500 mb-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-saffron-500" />
                      Individual Contacts
                    </p>
                    {contacts.length === 0 && <p className="text-xs text-stone-400">No contacts yet</p>}
                    {contacts.map((c) => (
                      <label key={c.id} className="flex items-center gap-2.5 text-sm text-stone-700 cursor-pointer group">
                        <input type="checkbox" checked={form.notify_contact_ids.includes(c.id)}
                          onChange={() => toggleContact(c.id)} className="rounded border-stone-300 text-saffron-600 focus:ring-saffron-500" />
                        <span className="group-hover:text-stone-900 transition-colors">{c.name}</span>
                      </label>
                    ))}
                  </div>
                  {(form.notify_group_ids.length > 0 || form.notify_contact_ids.length > 0) && (
                    <p className="text-xs text-stone-400 mt-1.5">
                      {form.notify_group_ids.length > 0 && `${form.notify_group_ids.length} group(s)`}
                      {form.notify_group_ids.length > 0 && form.notify_contact_ids.length > 0 && " + "}
                      {form.notify_contact_ids.length > 0 && `${form.notify_contact_ids.length} contact(s)`}
                      {" "}will be notified
                    </p>
                  )}
                </div>

                <AnimatePresence>
                  {editing && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }} className="space-y-1">
                      <label className="text-sm font-semibold text-stone-700">Reason for edit <span className="text-rose-500">*</span></label>
                      <textarea required rows={2} placeholder="Why are you editing this transaction?"
                        value={form.edit_reason} onChange={(e) => setForm({ ...form, edit_reason: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors resize-none" />
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={saving}
                  className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                  {saving ? "Saving..." : editing ? "Update Transaction" : "Save Transaction"}
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
