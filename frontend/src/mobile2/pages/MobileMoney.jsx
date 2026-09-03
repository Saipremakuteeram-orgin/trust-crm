import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Plus, X } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import FilterChips from "../components/FilterChips";
import FeedCard from "../components/FeedCard";
import Card from "../components/Card";
import SectionTitle from "../components/SectionTitle";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

export default function MobileMoney() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const role = profile?.role || "viewer";
  const canAdd = role === "admin" || role === "accountant";

  const [txns, setTxns] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (params.get("new") === "1" && canAdd) {
      document.querySelector('[aria-label="Log transaction"]')?.click();
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, canAdd]);

  async function load() {
    try {
      const res = await api.get("/transactions");
      setTxns(res.data.result || []);
    } catch { addToast("Failed to load", "error"); }
  }

  const filtered = useMemo(() => {
    const now = new Date();
    return txns.filter((t) => {
      if (search) {
        const s = search.toLowerCase();
        if (!(t.party || "").toLowerCase().includes(s) && !(t.description || "").toLowerCase().includes(s)) return false;
      }
      if (filter === "all") return true;
      const d = new Date(t.txn_date);
      if (filter === "today") return d.toDateString() === now.toDateString();
      if (filter === "week") {
        const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
        return d >= weekAgo;
      }
      if (filter === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      return true;
    });
  }, [txns, filter, search]);

  function handleEdit(t) {
    setEditing(t);
  }

  function handleDelete(id) {
    if (!window.confirm("Delete this transaction?")) return;
    api.delete(`/transactions/${id}`).then(() => { addToast("Deleted", "success"); load(); }).catch(() => addToast("Failed", "error"));
  }

  return (
    <MobileShell title="Money" subtitle={`${filtered.length} transactions`} rightAction={canAdd ? (
      <button onClick={() => document.querySelector('[aria-label="Log transaction"]')?.click()} aria-label="Add" className="m-tap w-10 h-10 rounded-xl bg-saffron-500 text-white flex items-center justify-center shadow-md active:scale-95">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    ) : null}>
      <div className="px-4 pt-3 space-y-3">
        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input placeholder="Search party or description…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2.5 text-sm border-2 border-stone-200 rounded-2xl focus:border-saffron-400" />
        </div>
      </div>

      <div className="px-4 pt-3 space-y-2">
        {filtered.length === 0 ? (
          <Card>
            <EmptyState title="No transactions" message="Tap the + button to log your first transaction." />
          </Card>
        ) : (
          filtered.map((t) => (
            <FeedCard
              key={t.id}
              txn={t}
              expanded={expanded === t.id}
              onToggleExpand={() => setExpanded(expanded === t.id ? null : t.id)}
              onEdit={handleEdit}
              onDelete={() => handleDelete(t.id)}
            />
          ))
        )}
      </div>

      {editing && (
        <InlineEditModal txn={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </MobileShell>
  );
}

function InlineEditModal({ txn, onClose, onSaved }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ ...txn });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/transactions/${txn.id}`, { ...form, amount: Number(form.amount) });
      addToast("Updated", "success");
      onSaved();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed", "error");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl p-4 space-y-3 max-h-[80vh] overflow-y-auto" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} onClick={(e) => e.stopPropagation()}>
        <div className="w-12 h-1.5 rounded-full bg-stone-200 mx-auto mb-2" />
        <div className="text-base font-bold text-stone-900">Edit transaction</div>
        <input value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} placeholder="Party" className="w-full border-2 border-stone-200 rounded-2xl px-4 py-3 text-sm" />
        <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" className="w-full border-2 border-stone-200 rounded-2xl px-4 py-3 text-sm" />
        <textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="w-full border-2 border-stone-200 rounded-2xl px-4 py-3 text-sm resize-none" />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border-2 border-stone-200 text-stone-700 py-3 rounded-2xl text-sm font-bold">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 bg-saffron-500 text-white py-3 rounded-2xl text-sm font-bold disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
