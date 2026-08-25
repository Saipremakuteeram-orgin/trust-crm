import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import {
  Plus, X, Pencil, Trash2, ArrowLeft, RefreshCw,
  TrendingUp, TrendingDown, PartyPopper, Info
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

function FunctionCard({ fn, canEdit, onClick, onEdit, onDelete, onStatus }) {
  const income = (Number(fn.income_cash) || 0) + (Number(fn.income_digital) || 0);
  const net = income - ((Number(fn.spent_cash) || 0) + (Number(fn.spent_digital) || 0));

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
      </div>

      {fn.description && <p className="text-xs text-stone-500 mb-4">{fn.description}</p>}

      <div className="grid grid-cols-2 gap-3 border-t border-stone-100 pt-4">
        <div className="flex items-center gap-2 text-xs text-stone-600">
          <TrendingUp size={13} className="text-emerald-500" />
          <div>
            <div className="text-[10px] text-stone-400">Income</div>
            <div className="font-semibold text-emerald-700">{fmt(income)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-stone-600">
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
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", status: "active" });
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [subCatModalOpen, setSubCatModalOpen] = useState(false);
  const [editingSubCat, setEditingSubCat] = useState(null);
  const [subCatForm, setSubCatForm] = useState({
    category_id: '',
    budget_amount: '',
    budget_cash: '',
    budget_digital: '',
  });
  const [savingSubCat, setSavingSubCat] = useState(false);
  useEscToClose(() => setOpen(false), open);

  function load() {
    api.get("/functions").then((res) => setFunctions(res.data.result)).catch(() => setFunctions([]));
    if (id) {
      api.get(`/functions/${id}`).then((res) => setDetail(res.data.result)).catch(() => setDetail(null));
      api.get("/categories").then((res) => setAvailableCategories(res.data.result || [])).catch(() => setAvailableCategories([]));
    }
  }

  useEffect(load, [id]);

  function handleRefresh() { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 600); }

  const filtered = useMemo(() => {
    if (filter === "all") return functions;
    return functions.filter((f) => f.status === filter);
  }, [functions, filter]);

  function openAdd() { setEditing(null); setForm({ name: "", description: "", status: "active" }); setOpen(true); }

  function openEdit(fn) {
    setEditing(fn);
    setForm({
      name: fn.name, description: fn.description || "",
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
        status: form.status,
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

  function getAvailableCategoriesForAdd() {
    if (!fn?.categories) return availableCategories;
    const linkedIds = new Set(fn.categories.map(c => c.category_id));
    return availableCategories.filter(c => !linkedIds.has(c.id));
  }

  function openAddSubCat() {
    const avail = getAvailableCategoriesForAdd();
    if (avail.length === 0) {
      addToast('All categories are already linked to this function', 'error');
      return;
    }
    setEditingSubCat(null);
    setSubCatForm({
      category_id: avail[0].id,
      budget_amount: '',
      budget_cash: '',
      budget_digital: '',
    });
    setSubCatModalOpen(true);
  }

  function openEditSubCat(cat) {
    setEditingSubCat(cat);
    setSubCatForm({
      category_id: cat.category_id,
      budget_amount: String(cat.budget_amount || ''),
      budget_cash: String(cat.budget_cash || ''),
      budget_digital: String(cat.budget_digital || ''),
    });
    setSubCatModalOpen(true);
  }

  async function handleSaveSubCat(e) {
    e.preventDefault();
    if (!subCatForm.category_id) { addToast('Category is required', 'error'); return; }
    setSavingSubCat(true);
    try {
      const payload = {
        category_id: subCatForm.category_id,
        budget_amount: Number(subCatForm.budget_amount) || 0,
        budget_cash: Number(subCatForm.budget_cash) || 0,
        budget_digital: Number(subCatForm.budget_digital) || 0,
      };
      if (editingSubCat) {
        await api.patch(`/functions/${fn.id}/categories/${editingSubCat.id}`, payload);
        addToast('Sub-category updated', 'success');
      } else {
        await api.post(`/functions/${fn.id}/categories`, payload);
        addToast('Sub-category added', 'success');
      }
      setSubCatModalOpen(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to save sub-category', 'error');
    }
    setSavingSubCat(false);
  }

  async function handleDeleteSubCat(cat) {
    if (!window.confirm(`Remove "${cat.category_name}" from this function?`)) return;
    try {
      await api.delete(`/functions/${fn.id}/categories/${cat.id}`);
      addToast('Sub-category removed', 'success');
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to remove sub-category', 'error');
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
                <div className="text-sm text-stone-500 font-medium mb-1">Income Collected</div>
                <div className="text-2xl font-bold text-emerald-600">{fmt((Number(fn.income_cash) || 0) + (Number(fn.income_digital) || 0))}</div>
                <div className="text-xs text-stone-400 mt-1">Cash {fmt(fn.income_cash)} · Digital {fmt(fn.income_digital)}</div>
              </div>
              <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm">
                <div className="text-sm text-stone-500 font-medium mb-1">Total Spent</div>
                <div className="text-2xl font-bold text-stone-900">{fmt((Number(fn.spent_cash) || 0) + (Number(fn.spent_digital) || 0))}</div>
                <div className="text-xs text-stone-400 mt-1">Cash {fmt(fn.spent_cash)} · Digital {fmt(fn.spent_digital)}</div>
              </div>
              <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm">
                <div className="text-sm text-stone-500 font-medium mb-1">Net (Income - Spent)</div>
                <div className={`text-2xl font-bold ${((Number(fn.income_cash) || 0) + (Number(fn.income_digital) || 0)) - ((Number(fn.spent_cash) || 0) + (Number(fn.spent_digital) || 0)) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmt(((Number(fn.income_cash) || 0) + (Number(fn.income_digital) || 0)) - ((Number(fn.spent_cash) || 0) + (Number(fn.spent_digital) || 0)))}</div>
              </div>
              <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm">
                <div className="text-sm text-stone-500 font-medium mb-1">Transactions</div>
                <div className="text-2xl font-bold text-stone-900">{fn.transactions?.length || 0}</div>
              </div>
            </div>

            {/* Sub-categories */}
            <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-stone-700">Sub-categories</h2>
                {canEdit && (
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openAddSubCat}
                    className="flex items-center gap-1.5 bg-saffron-500 hover:bg-saffron-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm">
                    <Plus size={14} /> Add Sub-category
                  </motion.button>
                )}
              </div>

              {(!fn.categories || fn.categories.length === 0) ? (
                <p className="text-sm text-stone-400">No sub-categories defined yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-stone-400 uppercase tracking-wider">
                      <tr className="border-b border-stone-100">
                        <th className="py-2 pr-3 font-semibold">Category</th>
                        <th className="py-2 pr-3 font-semibold text-right">Budget</th>
                        <th className="py-2 pr-3 font-semibold text-right">Spent</th>
                        <th className="py-2 pr-3 font-semibold text-right">Remaining</th>
                        {canEdit && <th className="py-2 pl-3 font-semibold text-center w-24">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {fn.categories.map((cat) => {
                        const budget = Number(cat.budget_amount) || 0;
                        const spent = Number(cat.spent_total) || 0;
                        const remaining = Number(cat.remaining_total) || 0;
                        const isOver = remaining < 0;
                        return (
                          <tr key={cat.id} className="border-b border-stone-50">
                            <td className="py-3 pr-3 font-medium text-stone-800">{cat.category_name}</td>
                            <td className="py-3 pr-3 text-right text-stone-600">{fmt(budget)}</td>
                            <td className="py-3 pr-3 text-right text-rose-600">{fmt(spent)}</td>
                            <td className={`py-3 pr-3 text-right font-semibold ${isOver ? 'text-rose-600' : 'text-emerald-600'}`}>{fmt(remaining)}</td>
                            {canEdit && (
                              <td className="py-3 pl-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => openEditSubCat(cat)} className="p-1.5 rounded-lg hover:bg-royal-50 text-stone-400 hover:text-royal-600 transition-colors">
                                    <Pencil size={14} />
                                  </button>
                                  <button onClick={() => handleDeleteSubCat(cat)} className="p-1.5 rounded-lg hover:bg-rose-50 text-stone-400 hover:text-rose-600 transition-colors">
                                    <Trash2 size={14} />
                                  </button>
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

        {/* Sub-category Modal */}
        <AnimatePresence>
          {subCatModalOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
              <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-bold text-stone-900">{editingSubCat ? 'Edit Sub-category' : 'Add Sub-category'}</h2>
                  <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                    onClick={() => setSubCatModalOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
                </div>
                <form onSubmit={handleSaveSubCat} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Category</label>
                    <select value={subCatForm.category_id} onChange={(e) => setSubCatForm({ ...subCatForm, category_id: e.target.value })}
                      disabled={!!editingSubCat}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors disabled:bg-stone-100 disabled:text-stone-500">
                      {editingSubCat ? (
                        <option value={subCatForm.category_id}>{fn?.categories?.find(c => c.category_id === subCatForm.category_id)?.category_name || 'Selected'}</option>
                      ) : (
                        getAvailableCategoriesForAdd().map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Budget Total</label>
                      <input type="number" step="0.01" min="0" placeholder="0" value={subCatForm.budget_amount}
                        onChange={(e) => setSubCatForm({ ...subCatForm, budget_amount: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Cash Budget</label>
                      <input type="number" step="0.01" min="0" placeholder="0" value={subCatForm.budget_cash}
                        onChange={(e) => setSubCatForm({ ...subCatForm, budget_cash: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Digital Budget</label>
                      <input type="number" step="0.01" min="0" placeholder="0" value={subCatForm.budget_digital}
                        onChange={(e) => setSubCatForm({ ...subCatForm, budget_digital: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={savingSubCat}
                    className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                    {savingSubCat ? 'Saving...' : editingSubCat ? 'Update Sub-category' : 'Add Sub-category'}
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
  const totalSpent = functions.reduce((s, f) => s + (Number(f.spent_total) || 0), 0);
  const totalIncome = functions.reduce((s, f) => s + (Number(f.income_cash) || 0) + (Number(f.income_digital) || 0), 0);

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Functions</h1>
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
          <div className="text-xs font-medium opacity-80 mb-1">Total Income</div>
          <div className="text-2xl font-bold">{fmt(totalIncome)}</div>
        </div>
        <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-5 text-white shadow-lg">
          <div className="text-xs font-medium opacity-80 mb-1">Total Spent</div>
          <div className="text-2xl font-bold">{fmt(totalSpent)}</div>
        </div>
        <div className="bg-gradient-to-br from-saffron-500 to-amber-600 rounded-2xl p-5 text-white shadow-lg">
          <div className="text-xs font-medium opacity-80 mb-1">Net (Income - Spent)</div>
          <div className="text-2xl font-bold">{fmt(totalIncome - totalSpent)}</div>
        </div>
        <div className="bg-gradient-to-br from-royal-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
          <div className="text-xs font-medium opacity-80 mb-1">Total Functions</div>
          <div className="text-2xl font-bold">{functions.length}</div>
          <div className="text-xs opacity-80 mt-1">{functions.filter((f) => f.status === "active").length} active</div>
        </div>
      </div>

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
          <p className="text-xs mt-1">{functions.length === 0 ? "Create your first function to get started" : "Try a different filter"}</p>
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
