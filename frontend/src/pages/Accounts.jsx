import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Pencil, Trash2, ChevronRight, ChevronDown, FolderTree, Search } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import useEscToClose from "../hooks/useEscToClose";

const accountTypes = [
  { value: "asset", label: "Asset", color: "bg-emerald-100 text-emerald-700" },
  { value: "liability", label: "Liability", color: "bg-rose-100 text-rose-700" },
  { value: "equity", label: "Equity", color: "bg-violet-100 text-violet-700" },
  { value: "income", label: "Income", color: "bg-sky-100 text-sky-700" },
  { value: "expense", label: "Expense", color: "bg-amber-100 text-amber-700" },
];

const emptyAccount = {
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
  const [filteredAccounts, setFilteredAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, editing: null });
  const [form, setForm] = useState({ ...emptyAccount });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  useEscToClose(() => setModal({ open: false, editing: null }), modal.open);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/accounts");
      setAccounts(res.data.result || []);
    } catch {
      addToast("Failed to load accounts", "error");
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    let result = accounts;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(q) || (a.account_code && a.account_code.toLowerCase().includes(q)));
    }
    if (typeFilter) {
      result = result.filter(a => a.type === typeFilter);
    }
    setFilteredAccounts(result);
  }, [accounts, search, typeFilter]);

  function openAdd(parentAccount) {
    setForm({
      account_code: "",
      name: "",
      type: "expense",
      parent_id: parentAccount ? parentAccount.id : "",
    });
    setModal({ open: true, editing: null });
    setSaving(false);
  }

  function openEdit(account) {
    setForm({
      account_code: account.account_code || "",
      name: account.name,
      type: account.type,
      parent_id: account.parent_id || "",
    });
    setModal({ open: true, editing: account });
    setSaving(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      addToast("Account name is required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        account_code: form.account_code.trim() || null,
        name: form.name.trim(),
        type: form.type,
        parent_id: form.parent_id || null,
      };

      if (modal.editing) {
        await api.patch(`/accounts/${modal.editing.id}`, payload);
        addToast("Account updated", "success");
      } else {
        await api.post("/accounts", payload);
        addToast("Account created", "success");
      }
      setModal({ open: false, editing: null });
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save account", "error");
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this account?")) return;
    try {
      await api.delete(`/accounts/${id}`);
      addToast("Account deleted", "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to delete account", "error");
    }
  }

  function getTypeStyle(type) {
    return accountTypes.find(t => t.value === type)?.color || "bg-stone-100 text-stone-600";
  }

  const rootAccounts = filteredAccounts.filter(a => !a.parent_id);
  const getChildren = (parentId) => filteredAccounts.filter(a => a.parent_id === parentId);

  function renderAccount(account, level = 0) {
    const children = getChildren(account.id);
    const hasChildren = children.length > 0;
    return (
      <div key={account.id}>
        <div
          className="flex items-center gap-2 px-3 py-2.5 hover:bg-stone-50 border-b border-stone-50"
          style={{ paddingLeft: `${12 + level * 20}px` }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {hasChildren && <span className="text-stone-400">{/* expand icon placeholder */}</span>}
              <span className="text-sm font-medium text-stone-800 truncate">{account.name}</span>
              {account.account_code && <span className="text-xs text-stone-400 font-mono">{account.account_code}</span>}
            </div>
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getTypeStyle(account.type)}`}>
            {account.type}
          </span>
          {canEdit && (
            <div className="flex items-center gap-1">
              <button onClick={() => openEdit(account)} className="p-1 rounded hover:bg-royal-50 text-stone-400 hover:text-royal-600">
                <Pencil size={14} />
              </button>
              <button onClick={() => handleDelete(account.id)} className="p-1 rounded hover:bg-rose-50 text-stone-400 hover:text-rose-600">
                <Trash2 size={14} />
              </button>
              <button onClick={() => openAdd(account)} className="p-1 rounded hover:bg-emerald-50 text-stone-400 hover:text-emerald-600">
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
        {hasChildren && children.map(child => renderAccount(child, level + 1))}
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FolderTree className="text-royal-600" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Chart of Accounts</h1>
              <p className="text-sm text-stone-500">Manage your account hierarchy</p>
            </div>
          </div>
          {canEdit && (
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => openAdd(null)}
              className="flex items-center gap-2 bg-saffron-500 hover:bg-saffron-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
              <Plus size={18} /> Add Account
            </motion.button>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          <div className="p-4 border-b border-stone-100 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                placeholder="Search accounts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border-2 border-stone-200 rounded-xl focus:border-saffron-400 transition-colors"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-sm border-2 border-stone-200 rounded-xl px-3 py-2 focus:border-saffron-400 transition-colors"
            >
              <option value="">All Types</option>
              {accountTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="p-12 text-center text-stone-400">Loading accounts...</div>
          ) : filteredAccounts.length === 0 ? (
            <div className="p-12 text-center text-stone-400">No accounts found.</div>
          ) : (
            <div className="divide-y divide-stone-50">
              {rootAccounts.map(account => renderAccount(account))}
            </div>
          )}
        </div>

        {/* Account Modal */}
        <AnimatePresence>
          {modal.open && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
              <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-bold text-stone-900">{modal.editing ? "Edit Account" : "New Account"}</h2>
                  <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                    onClick={() => setModal({ open: false, editing: null })} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
                </div>
                <form onSubmit={handleSave} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Account Name</label>
                    <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Account Code</label>
                      <input type="text" value={form.account_code} onChange={(e) => setForm({ ...form, account_code: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Type</label>
                      <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                        {accountTypes.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Parent Account</label>
                    <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                      <option value="">None (Top Level)</option>
                      {accounts.filter(a => a.id !== modal.editing?.id).map(a => (
                        <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                      ))}
                    </select>
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={saving}
                    className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                    {saving ? "Saving..." : modal.editing ? "Update Account" : "Create Account"}
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
