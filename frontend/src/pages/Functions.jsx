import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import {
  Plus, X, Pencil, Trash2, ArrowLeft, RefreshCw, Wallet, Landmark,
  TrendingUp, TrendingDown, PartyPopper, AlertTriangle, Info
} from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import useEscToClose from "../hooks/useEscToClose";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

const STATUS_STYLES = {
  active: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  completed: "bg-royal-50 text-royal-700 ring-1 ring-royal-200",
  archived: "bg-stone-100 text-stone-500 ring-1 ring-stone-200",
};

const emptyForm = { name: "", description: "", budget_total: "", budget_cash: "", budget_digital: "", status: "active" };

function ProgressBar({ pct, over }) {
  const safe = Math.min(Math.max(pct, 0), 100);
  return (
    <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
      <motion.div initial={{ width: 0 }} animate={{ width: `${safe}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={`h-full rounded-full ${over ? "bg-rose-500" : pct > 80 ? "bg-amber-500" : "bg-emerald-500"}`} />
    </div>
  );
}

function FunctionCard({ fn, canEdit, onClick, onEdit, onDelete, onStatus }) {
  const spent = Number(fn.spent_total) || 0;
  const budget = Number(fn.budget_total) || 0;
  const pct = budget > 0 ? (spent / budget) * 100 : 0;
  const over = spent > budget;
  const income = (Number(fn.income_cash) || 0) + (Number(fn.income_digital) || 0);
  const net = income - spent;

  return (
    <motion.div layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm hover-lift cursor-pointer">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-saffron-50 flex items-center justify-center text-saffron-600">
            <PartyPopper size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-stone-900 leading-tight">{fn.name}</h3>
            <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${STATUS_STYLES[fn.status] || STATUS_STYLES.active}`}>
              {fn.status}
            </span>
          </div>
        </div>
        {over && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-200">
            <AlertTriangle size={10} /> OVER BUDGET
          </span>
        )}
      </div>

      {fn.description && <p className="text-xs text-stone-500 mb-4">{fn.description}</p>}

      <div className="mb-4">
        <div className="flex justify-between text-xs text-stone-500 mb-1.5">
          <span>Spent</span>
          <span className="font-semibold text-stone-700">{fmt(spent)} / {fmt(budget)}</span>
        </div>
        <ProgressBar pct={pct} over={over} />
        <div className="flex justify-between text-[11px] mt-1.5">
          <span className={over ? "text-rose-600 font-semibold" : "text-stone-400"}>
            {over ? `Over by ${fmt(spent - budget)}` : `${pct.toFixed(0)}% used`}
          </span>
          <span className="text-stone-400">{fmt(Math.max(budget - spent, 0))} remaining</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-stone-100 pt-4">
        <div className="flex items-center gap-2 text-xs text-stone-600">
          <Wallet size={13} className="text-saffron-500" />
          <div>
            <div className="text-[10px] text-stone-400">Cash Spent</div>
            <div className={`font-semibold ${(Number(fn.spent_cash) || 0) > (Number(fn.budget_cash) || 0) ? "text-rose-600" : "text-stone-800"}`}>
              {fmt(fn.spent_cash)} / {fmt(fn.budget_cash)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-stone-600">
          <Landmark size={13} className="text-royal-500" />
          <div>
            <div className="text-[10px] text-stone-400">Digital Spent</div>
            <div className={`font-semibold ${(Number(fn.spent_digital) || 0) > (Number(fn.budget_digital) || 0) ? "text-rose-600" : "text-stone-800"}`}>
              {fmt(fn.spent_digital)} / {fmt(fn.budget_digital)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3 border-t border-stone-100 pt-4">
        <div className="flex items-center gap-2 text-xs">
          <TrendingUp size={13} className="text-emerald-500" />
          <div>
            <div className="text-[10px] text-stone-400">Income</div>
            <div className="font-semibold text-emerald-700">{fmt(income)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <TrendingDown size={13} className={net >= 0 ? "text-royal-500" : "text-rose-500"} />
          <div>
            <div className="text-[10px] text-stone-400">Net (Income - Spent)</div>
            <div className={`font-semibold ${net >= 0 ? "text-royal-700" : "text-rose-600"}`}>{fmt(net)}</div>
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-stone-100">
          <select value={fn.status} onChange={(e) => onStatus(fn, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="text-xs border border-stone-200 rounded-lg px-2 py-1.5 text-stone-600 focus:outline-none focus:ring-2 focus:ring-saffron-400">
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
          <div className="flex items-center gap-1">
            <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); onEdit(fn); }}
              className="text-stone-300 hover:text-royal-600 transition-all p-1.5 rounded-lg hover:bg-royal-50" title="Edit">
              <Pencil size={15} />
            </motion.button>
            <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); onDelete(fn); }}
              className="text-stone-300 hover:text-rose-600 transition-all p-1.5 rounded-lg hover:bg-rose-50" title="Delete">
              <Trash2 size={15} />
            </motion.button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function Functions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canEdit = role === "admin" || role === "accountant";

  const [functions, setFunctions] = useState([]);
  const [detail, setDetail] = useState(null);
  const [sourceBalance, setSourceBalance] = useState(null);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [catForm, setCatForm] = useState({ category_id: "", budget_amount: "", budget_cash: "", budget_digital: "" });
  const [editingCat, setEditingCat] = useState(null);
  const [categories, setCategories] = useState([]);
  useEscToClose(() => setOpen(false), open);
  useEscToClose(() => { setCatOpen(false); setCatForm({ category_id: "", budget_amount: "", budget_cash: "", budget_digital: "" }); setEditingCat(null); }, catOpen);

  function load() {
    api.get("/functions").then((res) => setFunctions(res.data.result)).catch(() => setFunctions([]));
    api.get("/functions/summary/source-balance").then((res) => setSourceBalance(res.data.result)).catch(() => {});
    if (id) {
      api.get(`/functions/${id}`).then((res) => setDetail(res.data.result)).catch(() => setDetail(null));
    }
    api.get("/categories").then((res) => setCategories(res.data.result)).catch(() => {});
  }

  useEffect(load, [id]);

  function handleRefresh() { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 600); }

  const filtered = useMemo(() => {
    if (filter === "all") return functions;
    return functions.filter((f) => f.status === filter);
  }, [functions, filter]);

  function openAdd() { setEditing(null); setForm({ ...emptyForm }); setOpen(true); }

  function openEdit(fn) {
    setEditing(fn);
    setForm({
      name: fn.name, description: fn.description || "",
      budget_total: fn.budget_total, budget_cash: fn.budget_cash, budget_digital: fn.budget_digital,
      status: fn.status,
    });
    setOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { addToast("Function name is required", "error"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name, description: form.description,
        budget_total: Number(form.budget_total || 0),
        budget_cash: Number(form.budget_cash || 0),
        budget_digital: Number(form.budget_digital || 0),
      };
      if (editing) {
        await api.patch(`/functions/${editing.id}`, payload);
        addToast("Function updated", "success");
      } else {
        await api.post("/functions", payload);
        addToast("Function created", "success");
      }
      setOpen(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save function", "error");
    }
    setSaving(false);
  }

  async function handleDelete(fn) {
    if (!window.confirm(`Delete function "${fn.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/functions/${fn.id}`);
      addToast("Function deleted", "success");
      if (id) navigate("/functions");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to delete function", "error");
    }
  }

  async function handleStatus(fn, status) {
    try {
      await api.patch(`/functions/${fn.id}/status`, { status });
      addToast(`Function marked as ${status}`, "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to update status", "error");
    }
  }

  function openCatAdd() {
    setEditingCat(null);
    setCatForm({ category_id: "", budget_amount: "", budget_cash: "", budget_digital: "" });
    setCatOpen(true);
  }

  function openCatEdit(fc) {
    setEditingCat(fc);
    setCatForm({
      category_id: fc.category_id, budget_amount: fc.budget_amount,
      budget_cash: fc.budget_cash, budget_digital: fc.budget_digital,
    });
    setCatOpen(true);
  }

  async function handleCatSubmit(e) {
    e.preventDefault();
    if (!catForm.category_id) { addToast("Select a category", "error"); return; }
    setSaving(true);
    try {
      const payload = {
        category_id: catForm.category_id,
        budget_amount: Number(catForm.budget_amount || 0),
        budget_cash: Number(catForm.budget_cash || 0),
        budget_digital: Number(catForm.budget_digital || 0),
      };
      if (editingCat) {
        await api.patch(`/functions/${id}/categories/${editingCat.id}`, payload);
        addToast("Category budget updated", "success");
      } else {
        await api.post(`/functions/${id}/categories`, payload);
        addToast("Category budget added", "success");
      }
      setCatOpen(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save category budget", "error");
    }
    setSaving(false);
  }

  async function handleCatDelete(fc) {
    if (!window.confirm("Remove this category budget?")) return;
    try {
      await api.delete(`/functions/${id}/categories/${fc.id}`);
      addToast("Category budget removed", "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to remove category budget", "error");
    }
  }

  // ---- Detail view ----
  if (id) {
    const fn = detail;
    return (
      <AppLayout>
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => navigate("/functions")}
              className="p-2 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 transition-colors">
              <ArrowLeft size={16} />
            </motion.button>
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight">{fn?.name || "Function"}</h1>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openCatAdd}
                className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-saffron-500/20 transition-all">
                <Plus size={16} /> Add Category Budget
              </motion.button>
            )}
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleRefresh}
              className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 transition-colors">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </motion.button>
          </div>
        </motion.div>

        {!fn && (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
            <Info size={32} className="mx-auto mb-3" />
            <p>Function not found.</p>
          </div>
        )}

        {fn && (
          <div className="space-y-6">
            {/* Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm">
                <div className="text-sm text-stone-500 font-medium mb-1">Total Budget</div>
                <div className="text-2xl font-bold text-stone-900">{fmt(fn.budget_total)}</div>
                <div className="text-xs text-stone-400 mt-1">
                  Cash {fmt(fn.budget_cash)} · Digital {fmt(fn.budget_digital)}
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm">
                <div className="text-sm text-stone-500 font-medium mb-1">Total Spent</div>
                <div className={`text-2xl font-bold ${fn.overspend_total ? "text-rose-600" : "text-stone-900"}`}>{fmt(fn.spent_total)}</div>
                <div className="text-xs text-stone-400 mt-1">Cash {fmt(fn.spent_cash)} · Digital {fmt(fn.spent_digital)}</div>
              </div>
              <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm">
                <div className="text-sm text-stone-500 font-medium mb-1">Remaining</div>
                <div className={`text-2xl font-bold ${Number(fn.remaining_total) < 0 ? "text-rose-600" : "text-emerald-600"}`}>{fmt(fn.remaining_total)}</div>
                {fn.overspend_total && <div className="text-xs text-rose-500 mt-1 font-semibold">⚠ Over budget by {fmt(Math.abs(fn.remaining_total))}</div>}
              </div>
              <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm">
                <div className="text-sm text-stone-500 font-medium mb-1">Income Collected</div>
                <div className="text-2xl font-bold text-emerald-600">{fmt((Number(fn.income_cash) || 0) + (Number(fn.income_digital) || 0))}</div>
                <div className="text-xs text-stone-400 mt-1">Cash {fmt(fn.income_cash)} · Digital {fmt(fn.income_digital)}</div>
              </div>
            </div>

            {/* Category budgets */}
            <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-stone-700 mb-4">Category Budgets</h2>
              {(!fn.categories || fn.categories.length === 0) ? (
                <p className="text-sm text-stone-400">No category budgets yet. {canEdit ? "Add one to break down your budget." : ""}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-stone-400 uppercase tracking-wider">
                      <tr className="border-b border-stone-100">
                        <th className="py-2 pr-4 font-semibold">Category</th>
                        <th className="py-2 pr-4 font-semibold">Budget</th>
                        <th className="py-2 pr-4 font-semibold">Spent</th>
                        <th className="py-2 pr-4 font-semibold">Remaining</th>
                        <th className="py-2 pr-4 font-semibold w-1/3">Progress</th>
                        {canEdit && <th className="py-2 font-semibold text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {fn.categories.map((fc) => {
                        const spent = Number(fc.spent_total) || 0;
                        const budget = Number(fc.budget_amount) || 0;
                        const pct = budget > 0 ? (spent / budget) * 100 : 0;
                        const over = spent > budget;
                        return (
                          <tr key={fc.id} className="border-b border-stone-50">
                            <td className="py-3 pr-4 font-medium text-stone-800">{fc.category_name || "—"}</td>
                            <td className="py-3 pr-4 text-stone-600">{fmt(budget)}</td>
                            <td className={`py-3 pr-4 font-semibold ${over ? "text-rose-600" : "text-stone-800"}`}>{fmt(spent)}</td>
                            <td className={`py-3 pr-4 ${over ? "text-rose-600" : "text-emerald-600"}`}>{fmt(budget - spent)}</td>
                            <td className="py-3 pr-4">
                              <div className="w-full">
                                <ProgressBar pct={pct} over={over} />
                              </div>
                            </td>
                            {canEdit && (
                              <td className="py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} onClick={() => openCatEdit(fc)}
                                    className="text-stone-300 hover:text-royal-600 transition-all p-1.5 rounded-lg hover:bg-royal-50">
                                    <Pencil size={14} />
                                  </motion.button>
                                  <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} onClick={() => handleCatDelete(fc)}
                                    className="text-stone-300 hover:text-rose-600 transition-all p-1.5 rounded-lg hover:bg-rose-50">
                                    <Trash2 size={14} />
                                  </motion.button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Transactions for this function */}
            <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-stone-700 mb-4">Transactions ({fn.transactions?.length || 0})</h2>
              {(!fn.transactions || fn.transactions.length === 0) ? (
                <p className="text-sm text-stone-400">No transactions linked to this function yet.</p>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-stone-400 uppercase tracking-wider sticky top-0 bg-white">
                      <tr className="border-b border-stone-100">
                        <th className="py-2 pr-4 font-semibold">Date</th>
                        <th className="py-2 pr-4 font-semibold">Type</th>
                        <th className="py-2 pr-4 font-semibold">Party</th>
                        <th className="py-2 pr-4 font-semibold">Amount</th>
                        <th className="py-2 pr-4 font-semibold">Mode</th>
                        <th className="py-2 pr-4 font-semibold">Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fn.transactions.map((t) => (
                        <tr key={t.id} className="border-b border-stone-50">
                          <td className="py-3 pr-4 text-stone-600">{t.txn_date}</td>
                          <td className="py-3 pr-4">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.type === "credit" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                              {t.type === "credit" ? "Credit" : "Debit"}
                            </span>
                          </td>
                          <td className="py-3 pr-4 font-medium text-stone-800">{t.party || "-"}</td>
                          <td className={`py-3 pr-4 font-bold ${t.type === "credit" ? "text-emerald-700" : "text-rose-700"}`}>{fmt(t.amount)}</td>
                          <td className="py-3 pr-4 text-stone-500">{t.mode}</td>
                          <td className="py-3 pr-4 text-stone-500">{t.categories?.name || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Category Budget Modal */}
        <AnimatePresence>
          {catOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
              <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-bold text-stone-900">{editingCat ? "Edit Category Budget" : "Add Category Budget"}</h2>
                  <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                    onClick={() => setCatOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
                </div>
                <form onSubmit={handleCatSubmit} className="space-y-4">
                  <select value={catForm.category_id} onChange={(e) => setCatForm({ ...catForm, category_id: e.target.value })} disabled={!!editingCat}
                    className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors disabled:bg-stone-50">
                    <option value="">Select Category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input required type="number" placeholder="Budget Amount" value={catForm.budget_amount}
                    onChange={(e) => setCatForm({ ...catForm, budget_amount: e.target.value })}
                    className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" placeholder="Cash Budget" value={catForm.budget_cash}
                      onChange={(e) => setCatForm({ ...catForm, budget_cash: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    <input type="number" placeholder="Digital Budget" value={catForm.budget_digital}
                      onChange={(e) => setCatForm({ ...catForm, budget_digital: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={saving}
                    className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                    {saving ? "Saving..." : editingCat ? "Update" : "Add Budget"}
                  </motion.button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </AppLayout>
    );
  }

  // ---- List view ----
  const totalBudget = functions.reduce((s, f) => s + (Number(f.budget_total) || 0), 0);
  const totalSpent = functions.reduce((s, f) => s + (Number(f.spent_total) || 0), 0);
  const totalIncome = functions.reduce((s, f) => s + (Number(f.income_cash) || 0) + (Number(f.income_digital) || 0), 0);
  const overBudgetCount = functions.filter((f) => Number(f.overspend_total)).length;

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Functions & Budgets</h1>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleRefresh}
            className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 transition-colors">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </motion.button>
          {canEdit && (
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openAdd}
              className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-saffron-500/20 transition-all duration-300">
              <Plus size={16} /> Add Function
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg">
          <div className="text-xs font-medium opacity-80 mb-1">Total Allocated</div>
          <div className="text-2xl font-bold">{fmt(totalBudget)}</div>
        </div>
        <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-5 text-white shadow-lg">
          <div className="text-xs font-medium opacity-80 mb-1">Total Spent</div>
          <div className="text-2xl font-bold">{fmt(totalSpent)}</div>
        </div>
        <div className="bg-gradient-to-br from-saffron-500 to-amber-600 rounded-2xl p-5 text-white shadow-lg">
          <div className="text-xs font-medium opacity-80 mb-1">Total Income</div>
          <div className="text-2xl font-bold">{fmt(totalIncome)}</div>
        </div>
        <div className={`bg-gradient-to-br rounded-2xl p-5 text-white shadow-lg ${overBudgetCount > 0 ? "from-rose-600 to-red-700" : "from-royal-500 to-indigo-600"}`}>
          <div className="text-xs font-medium opacity-80 mb-1">Over Budget</div>
          <div className="text-2xl font-bold">{overBudgetCount}</div>
          <div className="text-xs opacity-80 mt-1">{overBudgetCount > 0 ? "Functions need attention" : "All within limits"}</div>
        </div>
      </div>

      {/* Source Balance */}
      {sourceBalance && (
        <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm mb-6">
          <h2 className="text-sm font-semibold text-stone-700 mb-4 flex items-center gap-2">
            <Wallet size={14} className="text-saffron-500" />
            Funding Source Balance
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-saffron-50 rounded-xl">
              <div className="text-xs text-saffron-700 font-medium mb-1">Cash Available</div>
              <div className="text-lg font-bold text-saffron-800">{fmt(sourceBalance.cash_available)}</div>
              <div className="text-[11px] text-saffron-600">Income {fmt(sourceBalance.total_cash_income)} - Non-function expenses {fmt(sourceBalance.total_cash_nonfunction_expenses)}</div>
            </div>
            <div className="p-4 bg-royal-50 rounded-xl">
              <div className="text-xs text-royal-700 font-medium mb-1">Digital Available</div>
              <div className="text-lg font-bold text-royal-800">{fmt(sourceBalance.digital_available)}</div>
              <div className="text-[11px] text-royal-600">Income {fmt(sourceBalance.total_digital_income)} - Non-function expenses {fmt(sourceBalance.total_digital_nonfunction_expenses)}</div>
            </div>
            <div className="p-4 bg-stone-50 rounded-xl">
              <div className="text-xs text-stone-600 font-medium mb-1">Unallocated Cash</div>
              <div className={`text-lg font-bold ${sourceBalance.cash_unallocated < 0 ? "text-rose-600" : "text-stone-800"}`}>{fmt(sourceBalance.cash_unallocated)}</div>
              <div className="text-[11px] text-stone-500">Allocated to functions: {fmt(sourceBalance.total_allocated_cash)}</div>
            </div>
            <div className="p-4 bg-stone-50 rounded-xl">
              <div className="text-xs text-stone-600 font-medium mb-1">Unallocated Digital</div>
              <div className={`text-lg font-bold ${sourceBalance.digital_unallocated < 0 ? "text-rose-600" : "text-stone-800"}`}>{fmt(sourceBalance.digital_unallocated)}</div>
              <div className="text-[11px] text-stone-500">Allocated to functions: {fmt(sourceBalance.total_allocated_digital)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {["all", "active", "completed", "archived"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${filter === s
              ? "bg-stone-900 text-white shadow-lg"
              : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"}`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Function cards grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
          <PartyPopper size={40} className="mx-auto mb-3 text-stone-300" />
          <p className="font-medium">{functions.length === 0 ? "No functions yet" : "No functions in this status"}</p>
          <p className="text-xs mt-1">{functions.length === 0 ? "Create your first function budget to get started" : "Try a different filter"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((fn) => (
            <FunctionCard key={fn.id} fn={fn} canEdit={canEdit}
              onClick={() => navigate(`/functions/${fn.id}`)}
              onEdit={(f) => openEdit(f)}
              onDelete={(f) => handleDelete(f)}
              onStatus={(f, s) => handleStatus(f, s)} />
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold text-stone-900">{editing ? "Edit Function" : "Add Function"}</h2>
                <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                  onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input required placeholder="Function Name (e.g., Annual Festival 2026)" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                <textarea placeholder="Description (optional)" rows={2} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors resize-none" />
                <input required type="number" placeholder="Total Budget (₹)" value={form.budget_total}
                  onChange={(e) => setForm({ ...form, budget_total: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-stone-500 mb-1 block">Cash Budget (optional)</label>
                    <input type="number" placeholder="₹" value={form.budget_cash}
                      onChange={(e) => setForm({ ...form, budget_cash: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-stone-500 mb-1 block">Digital Budget (optional)</label>
                    <input type="number" placeholder="₹" value={form.budget_digital}
                      onChange={(e) => setForm({ ...form, budget_digital: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                </div>
                {editing && (
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                )}
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={saving}
                  className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                  {saving ? "Saving..." : editing ? "Update Function" : "Create Function"}
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
