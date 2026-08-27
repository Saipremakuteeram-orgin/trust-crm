import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Pencil, Trash2, ChevronRight, ChevronDown, BookOpen } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import useEscToClose from "../hooks/useEscToClose";

const ACCOUNT_TYPES = [
  { value: "asset", label: "Assets", color: "bg-emerald-100 text-emerald-700" },
  { value: "liability", label: "Liabilities", color: "bg-rose-100 text-rose-700" },
  { value: "equity", label: "Equity", color: "bg-blue-100 text-blue-700" },
  { value: "income", label: "Income", color: "bg-emerald-100 text-emerald-700" },
  { value: "expense", label: "Expenses", color: "bg-amber-100 text-amber-700" },
];

const emptyForm = {
  account_code: "",
  name: "",
  type: "expense",
  parent_id: "",
};

export default function Accounts() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canEdit = role === "admin";

  const [accounts, setAccounts] = useState([]);
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState({});
  useEscToClose(() => setOpen(false), open);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/accounts");
      setAccounts(res.data.result.flat || []);
      setTree(res.data.result.tree || []);
    } catch {
      addToast("Failed to load accounts", "error");
    }
    setLoading(false);
  }
  useEffect(() => { let cancelled = false; load().finally(() => { cancelled = true; }); return () => { cancelled = true; }; }, []);

  function openAdd(parentId = "") {
    setEditing(null);
    setForm({ ...emptyForm, parent_id: parentId });
    setSaving(false);
    setOpen(true);
  }

  function openEdit(account) {
    setEditing(account);
    setForm({
      account_code: account.account_code,
      name: account.name,
      type: account.type,
      parent_id: account.parent_id || "",
    });
    setSaving(false);
    setOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.account_code.trim() || !form.name.trim()) {
      addToast("Account code and name are required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        account_code: form.account_code.trim(),
        name: form.name.trim(),
        type: form.type,
        parent_id: form.parent_id || null,
      };

      if (editing) {
        await api.patch(`/accounts/${editing.id}`, payload);
        addToast("Account updated", "success");
      } else {
        await api.post("/accounts", payload);
        addToast("Account created", "success");
      }
      setOpen(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save account", "error");
    }
    setSaving(false);
  }

  async function handleDelete(account) {
    if (!window.confirm(`Delete account "${account.name}"?`)) return;
    try {
      await api.delete(`/accounts/${account.id}`);
      addToast("Account deleted", "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to delete account", "error");
    }
  }

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function getTypeStyle(type) {
    return ACCOUNT_TYPES.find(t => t.value === type)?.color || "bg-stone-100 text-stone-700";
  }

  function renderAccount(account, level = 0) {
    const hasChildren = account.children && account.children.length > 0;
    const isExpanded = expanded[account.id];

    return (
      <div key={account.id}>
        <div className="flex items-center gap-2 py-2 px-3 hover:bg-stone-50 rounded-lg group" style={{ paddingLeft: `${level * 20 + 12}px` }}>
          {hasChildren ? (
            <button onClick={() => toggleExpand(account.id)} className="text-stone-400 hover:text-stone-600">
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : (
            <div className="w-4" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-stone-800">{account.name}</span>
              <span className="text-xs text-stone-400">({account.account_code})</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getTypeStyle(account.type)}`}>
                {account.type}
              </span>
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => openAdd(account.id)} className="p-1.5 rounded-lg hover:bg-saffron-50 text-stone-400 hover:text-saffron-600" title="Add child account">
                <Plus size={14} />
              </button>
              <button onClick={() => openEdit(account)} className="p-1.5 rounded-lg hover:bg-royal-50 text-stone-400 hover:text-royal-600" title="Edit">
                <Pencil size={14} />
              </button>
              <button onClick={() => handleDelete(account)} className="p-1.5 rounded-lg hover:bg-rose-50 text-stone-400 hover:text-rose-600" title="Delete">
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div>
            {account.children.map(child => renderAccount(child, level + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BookOpen className="text-royal-600" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Chart of Accounts</h1>
              <p className="text-sm text-stone-500">Manage your accounting structure</p>
            </div>
          </div>
          {canEdit && (
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => openAdd()}
              className="flex items-center gap-2 bg-saffron-500 hover:bg-saffron-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
              <Plus size={18} /> Add Account
            </motion.button>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
            <p>Loading accounts...</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="p-4 border-b border-stone-100">
              <div className="grid grid-cols-12 gap-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                <div className="col-span-6">Account Name</div>
                <div className="col-span-3">Code</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>
            </div>
            <div className="divide-y divide-stone-50">
              {tree.map(account => renderAccount(account))}
            </div>
            {tree.length === 0 && (
              <div className="p-12 text-center text-stone-400">
                <p>No accounts yet. Create your first account to get started.</p>
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
                  <h2 className="text-lg font-bold text-stone-900">{editing ? "Edit Account" : "Add Account"}</h2>
                  <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                    onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Account Code</label>
                    <input type="text" required placeholder="e.g., 1000" value={form.account_code}
                      onChange={(e) => setForm({ ...form, account_code: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Account Name</label>
                    <input type="text" required placeholder="e.g., Cash in Hand" value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Type</label>
                    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                      {ACCOUNT_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Parent Account (optional)</label>
                    <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                      <option value="">None (Top Level)</option>
                      {accounts.filter(a => a.id !== editing?.id).map(a => (
                        <option key={a.id} value={a.id}>{a.name} ({a.account_code})</option>
                      ))}
                    </select>
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={saving}
                    className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                    {saving ? "Saving..." : editing ? "Update Account" : "Create Account"}
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
