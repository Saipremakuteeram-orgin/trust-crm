import { useEffect, useState } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileListItem from "../components/MobileListItem";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function MobileRecurring() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canEdit = role === "admin" || role === "accountant";
  const canDelete = role === "admin";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/recurring-transactions").then((r) => { setItems(r.data.result || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function runNow(t) {
    try {
      await api.post(`/recurring-transactions/${t.id}/run-now`);
      addToast("Transaction created", "success");
    } catch (err) { addToast(err.response?.data?.message || "Failed", "error"); }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this template?")) return;
    try { await api.delete(`/recurring-transactions/${id}`); addToast("Deleted", "success"); const r = await api.get("/recurring-transactions"); setItems(r.data.result || []); }
    catch { addToast("Failed", "error"); }
  }

  return (
    <MobileShell title="Recurring" subtitle={`${items.length} templates`}>
      {loading ? (
        <div className="p-6 text-center text-sm text-stone-400">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState title="No recurring templates" message="Create one on desktop to schedule automatic transactions." />
      ) : (
        <div className="m-card !p-0 mx-4 mt-3 overflow-hidden">
          <ul className="m-list">
            {items.map((t) => (
              <MobileListItem
                key={t.id}
                onClick={canEdit ? () => runNow(t) : undefined}
                leading={
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.is_active ? "bg-emerald-50 text-emerald-600" : "bg-stone-100 text-stone-500"}`}>
                    {t.is_active ? <Play size={16} /> : <Pause size={16} />}
                  </div>
                }
                title={t.description || t.party || "Recurring"}
                subtitle={`${t.frequency} · ${fmt(t.amount)}`}
                trailing={canDelete ? (
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} className="m-tap w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"><Trash2 size={14} /></button>
                ) : null}
              />
            ))}
          </ul>
        </div>
      )}
    </MobileShell>
  );
}
