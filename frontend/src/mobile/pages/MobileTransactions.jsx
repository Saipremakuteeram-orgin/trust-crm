import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, X, Filter, Download, FileText, Upload } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileListItem from "../components/MobileListItem";
import EmptyState from "../components/EmptyState";
import SwipeableRow from "../components/SwipeableRow";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

const emptyForm = {
  type: "credit", mode: "cash", digital_method: "upi", amount: "",
  party: "", description: "", txn_date: new Date().toISOString().slice(0, 10),
  notify_contact_ids: [], notify_group_ids: [], category_id: "", voucher_filed: null,
  function_id: "", function_category_id: "",
};

export default function MobileTransactions() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const role = profile?.role || "viewer";
  const canAdd = role === "admin" || role === "accountant";
  const canDelete = role === "admin";

  const [txns, setTxns] = useState([]);
  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [functions, setFunctions] = useState([]);
  const [functionCategories, setFunctionCategories] = useState([]);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterMode, setFilterMode] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [exporting, setExporting] = useState(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (params.get("new") === "1" && canAdd) {
      setEditing(null);
      setForm({ ...emptyForm });
      setOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, canAdd]);

  async function load() {
    try {
      const [t, g, cat, fn] = await Promise.all([
        api.get("/transactions"),
        api.get("/groups"),
        api.get("/categories"),
        api.get("/functions"),
      ]);
      setTxns(t.data.result || []);
      setGroups(g.data.result || []);
      setCategories(cat.data.result || []);
      setFunctions(fn.data.result || []);
    } catch {
      addToast("Failed to load transactions", "error");
    }
  }

  const filtered = useMemo(() => {
    return txns.filter((t) => {
      if (search) {
        const s = search.toLowerCase();
        if (!(t.party || "").toLowerCase().includes(s) && !(t.description || "").toLowerCase().includes(s)) return false;
      }
      if (filterType !== "all" && t.type !== filterType) return false;
      if (filterMode !== "all" && t.mode !== filterMode) return false;
      return true;
    });
  }, [txns, search, filterType, filterMode]);

  function toggleGroup(id) {
    setForm((f) => ({
      ...f,
      notify_group_ids: f.notify_group_ids.includes(id) ? f.notify_group_ids.filter((x) => x !== id) : [...f.notify_group_ids, id],
    }));
  }

  function loadFunctionCategories(fid) {
    setFunctionCategories([]);
    if (!fid) return;
    api.get(`/functions/${fid}`).then((r) => setFunctionCategories(r.data.result?.categories || [])).catch(() => setFunctionCategories([]));
  }

  function openAdd() { setEditing(null); setForm({ ...emptyForm }); setOpen(true); }

  function openEdit(t) {
    setEditing(t);
    setForm({
      type: t.type, mode: t.mode, digital_method: t.digital_method || "upi",
      amount: t.amount, party: t.party || "", description: t.description || "",
      txn_date: t.txn_date, notify_contact_ids: t.notify_contact_ids || [],
      notify_group_ids: t.notify_group_ids || [],
      category_id: t.category_id || "",
      voucher_filed: t.mode === "cash" ? !!t.voucher_filed : null,
      function_id: t.function_id || "",
      function_category_id: t.function_category_id || "",
    });
    loadFunctionCategories(t.function_id || "");
    setOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.mode === "cash" && form.voucher_filed === null) { addToast("Select voucher status for cash", "error"); return; }
    if (editing && !form.edit_reason?.trim()) { addToast("Reason required for edit", "error"); return; }
    setSaving(true);
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (!editing) delete payload.edit_reason;
      if (payload.mode !== "cash") delete payload.voucher_filed;
      if (!payload.function_id) { delete payload.function_id; delete payload.function_category_id; }
      if (!payload.function_category_id) delete payload.function_category_id;
      if (editing) await api.patch(`/transactions/${editing.id}`, { ...payload, edit_reason: form.edit_reason });
      else await api.post("/transactions", payload);
      addToast(editing ? "Transaction updated" : "Transaction created", "success");
      setOpen(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save", "error");
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this transaction?")) return;
    try {
      await api.delete(`/transactions/${id}`);
      addToast("Deleted", "success");
      load();
    } catch { addToast("Failed to delete", "error"); }
  }

  async function exportExcel() {
    setExporting("excel");
    try {
      const res = await api.post("/exports/transactions/excel", {}, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href = url; a.download = "transactions.xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      addToast("Excel downloaded", "success");
    } catch { addToast("Failed to export", "error"); }
    setExporting(null);
  }
  async function exportPDF() {
    setExporting("pdf");
    try {
      const res = await api.post("/exports/transactions/pdf", {}, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href = url; a.download = "transactions.pdf";
      document.body.appendChild(a); a.click(); a.remove();
      addToast("PDF downloaded", "success");
    } catch { addToast("Failed to export", "error"); }
    setExporting(null);
  }

  async function handleRestore(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) { addToast("Only .xlsx/.xls", "error"); return; }
    setRestoring(true);
    try {
      const ab = await file.arrayBuffer();
      const data = Array.from(new Uint8Array(ab));
      const res = await api.post("/backup/restore-excel", { fileBuffer: { data, type: "Buffer" }, fileName: file.name });
      const r = res.data.result;
      addToast(`Restored: ${r.inserted} inserted, ${r.skipped} skipped`, "success");
      load();
    } catch (err) { addToast(err.response?.data?.message || "Restore failed", "error"); }
    setRestoring(false);
    e.target.value = "";
  }

  return (
    <MobileShell
      title="Transactions"
      subtitle={`${filtered.length} of ${txns.length}`}
      rightAction={
        canAdd ? (
          <button onClick={openAdd} aria-label="Add" className="m-tap w-10 h-10 rounded-xl bg-gradient-to-br from-saffron-500 to-saffron-600 text-white flex items-center justify-center shadow-md active:scale-95">
            <Plus size={20} />
          </button>
        ) : null
      }
    >
      <div className="px-4 pt-3 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              placeholder="Search party or description"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 text-sm border-2 border-stone-200 rounded-xl focus:border-saffron-400"
            />
          </div>
          <button onClick={() => setFilterOpen((v) => !v)} aria-label="Filters" className="m-tap w-11 h-11 rounded-xl border-2 border-stone-200 flex items-center justify-center text-stone-600 active:bg-stone-50">
            <Filter size={16} />
          </button>
        </div>

        <AnimatePresence>
          {filterOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="grid grid-cols-2 gap-2">
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="border-2 border-stone-200 rounded-xl px-3 py-2 text-sm">
                  <option value="all">All types</option>
                  <option value="credit">Credit</option>
                  <option value="debit">Debit</option>
                </select>
                <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)} className="border-2 border-stone-200 rounded-xl px-3 py-2 text-sm">
                  <option value="all">All modes</option>
                  <option value="cash">Cash</option>
                  <option value="digital">Digital</option>
                </select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2">
          <button onClick={exportExcel} disabled={!!exporting} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-stone-200 bg-white text-stone-700 active:bg-stone-50">
            <Download size={14} />{exporting === "excel" ? "Exporting…" : "Excel"}
          </button>
          <button onClick={exportPDF} disabled={!!exporting} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-stone-200 bg-white text-stone-700 active:bg-stone-50">
            <FileText size={14} />{exporting === "pdf" ? "Exporting…" : "PDF"}
          </button>
          {canAdd && (
            <label className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-stone-200 bg-white text-stone-700 active:bg-stone-50">
              <Upload size={14} />{restoring ? "Restoring…" : "Restore"}
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleRestore} disabled={restoring} />
            </label>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={txns.length === 0 ? "No transactions yet" : "No matches"}
          message={txns.length === 0 ? "Add your first transaction to get started" : "Try adjusting your search or filters"}
          action={canAdd && txns.length === 0 ? (
            <button onClick={openAdd} className="mt-2 text-xs font-semibold px-4 py-2 rounded-xl bg-saffron-500 text-white">Add transaction</button>
          ) : null}
        />
      ) : (
        <div className="m-card !p-0 mx-4 mt-3 overflow-hidden">
          <ul className="m-list">
            {filtered.map((t) => {
              const rightActions = canDelete ? [{ label: "Delete", color: "bg-rose-500", onClick: () => handleDelete(t.id) }] : null;
              const leftActions = canAdd ? [{ label: "Edit", color: "bg-royal-500", onClick: () => openEdit(t) }] : null;
              return (
                <SwipeableRow key={t.id} leftActions={leftActions} rightActions={rightActions}>
                  <MobileListItem
                    onClick={() => navigate(`/m/transactions/${t.id}`)}
                    leading={
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold ${t.type === "credit" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                        {t.type === "credit" ? "+" : "-"}
                      </div>
                    }
                    title={t.party || t.description || "Untitled"}
                    subtitle={`${t.txn_date} · ${t.mode === "cash" ? "Cash" : (t.digital_method || "Digital").toUpperCase()}`}
                    trailing={
                      <div className={`text-right ${t.type === "credit" ? "text-emerald-700" : "text-rose-700"}`}>
                        <div className="text-sm font-bold">{fmt(t.amount)}</div>
                        {t.receipt_file_id && <div className="text-[10px] text-stone-400">Receipt</div>}
                      </div>
                    }
                  />
                </SwipeableRow>
              );
            })}
          </ul>
        </div>
      )}

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)} className="fixed inset-0 bg-black/50 z-40" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 280 }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <h2 className="text-base font-bold text-stone-900">{editing ? "Edit Transaction" : "Add Transaction"}</h2>
                <button onClick={() => setOpen(false)} aria-label="Close" className="m-tap w-10 h-10 rounded-xl flex items-center justify-center active:bg-stone-100">
                  <X size={20} />
                </button>
              </div>
              <div className="w-12 h-1.5 rounded-full bg-stone-200 mx-auto mb-2" />
              <form onSubmit={handleSubmit} className="space-y-3 px-4 pb-6">
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForm({ ...form, type: "credit" })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 ${form.type === "credit" ? "bg-emerald-600 text-white border-emerald-600" : "border-stone-200 text-stone-600"}`}>Credit (In)</button>
                  <button type="button" onClick={() => setForm({ ...form, type: "debit" })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 ${form.type === "debit" ? "bg-rose-600 text-white border-rose-600" : "border-stone-200 text-stone-600"}`}>Debit (Out)</button>
                </div>
                <input required type="number" placeholder="Amount" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm" />
                <input placeholder="Party" value={form.party}
                  onChange={(e) => setForm({ ...form, party: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm" />
                <div className="rounded-xl border-2 border-saffron-100 bg-saffron-50/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-stone-700">Function (optional)</span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setForm({ ...form, function_id: "", function_category_id: "" })}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 ${!form.function_id ? "bg-stone-200 text-stone-700 border-stone-300" : "border-stone-200 text-stone-500"}`}>Not linked</button>
                    <button type="button" onClick={() => setForm({ ...form, function_id: form.function_id || "_link_" })}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 ${form.function_id ? "bg-saffron-600 text-white border-saffron-600" : "border-stone-200 text-stone-500"}`}>Link</button>
                  </div>
                  {form.function_id && (
                    <>
                      <select value={form.function_id === "_link_" ? "" : form.function_id}
                        onChange={(e) => { setForm({ ...form, function_id: e.target.value, function_category_id: "" }); loadFunctionCategories(e.target.value); }}
                        className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm">
                        <option value="">Select a function…</option>
                        {functions.filter((f) => f.status === "active").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                      {form.function_id && form.function_id !== "_link_" && functionCategories.length > 0 && (
                        <select value={form.function_category_id} onChange={(e) => setForm({ ...form, function_category_id: e.target.value })}
                          className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm">
                          <option value="">Sub-category (optional)…</option>
                          {functionCategories.map((fc) => <option key={fc.id} value={fc.id}>{fc.category_name}</option>)}
                        </select>
                      )}
                    </>
                  )}
                </div>
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm">
                  <option value="">Category (optional)</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForm({ ...form, mode: "cash" })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 ${form.mode === "cash" ? "bg-saffron-600 text-white border-saffron-600" : "border-stone-200 text-stone-600"}`}>Cash</button>
                  <button type="button" onClick={() => setForm({ ...form, mode: "digital" })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 ${form.mode === "digital" ? "bg-royal-600 text-white border-royal-600" : "border-stone-200 text-stone-600"}`}>Digital</button>
                </div>
                {form.mode === "cash" && (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-stone-700">Voucher Filed? *</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setForm({ ...form, voucher_filed: true })}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 ${form.voucher_filed === true ? "bg-emerald-600 text-white border-emerald-600" : "border-stone-200"}`}>Filed</button>
                      <button type="button" onClick={() => setForm({ ...form, voucher_filed: false })}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 ${form.voucher_filed === false ? "bg-amber-600 text-white border-amber-600" : "border-stone-200"}`}>Pending</button>
                    </div>
                  </div>
                )}
                {form.mode === "digital" && (
                  <select value={form.digital_method} onChange={(e) => setForm({ ...form, digital_method: e.target.value })}
                    className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm">
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="card">Card</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                )}
                <input placeholder="Description (optional)" value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm" />
                <input required type="date" value={form.txn_date}
                  onChange={(e) => setForm({ ...form, txn_date: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm" />

                {groups.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold text-stone-700 mb-1">Groups to notify</div>
                    <div className="max-h-24 overflow-y-auto space-y-1 border-2 border-stone-200 rounded-xl p-2">
                      {groups.map((g) => (
                        <label key={g.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={form.notify_group_ids.includes(g.id)} onChange={() => toggleGroup(g.id)} className="rounded text-royal-600" />
                          <span>{g.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {editing && (
                  <textarea required rows={2} placeholder="Reason for edit *"
                    value={form.edit_reason || ""} onChange={(e) => setForm({ ...form, edit_reason: e.target.value })}
                    className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm resize-none" />
                )}

                <button type="submit" disabled={saving}
                  className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 text-white rounded-xl py-3 text-sm font-semibold shadow-lg shadow-saffron-500/25 disabled:opacity-50">
                  {saving ? "Saving…" : editing ? "Update" : "Save"}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </MobileShell>
  );
}
