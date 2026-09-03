import { useEffect, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import Card from "../components/Card";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function MobileRecurring() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const canDelete = profile?.role === "admin";
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
        <Card><div className="text-center text-xs text-stone-400 py-6">No recurring templates.</div></Card>
      ) : (
        <div className="p-4 space-y-2">
          {items.map((t) => (
            <Card key={t.id} padding={false}>
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-stone-800 truncate">{t.description || t.party || "Recurring"}</div>
                  <div className="text-[11px] text-stone-500">{t.frequency} · {fmt(t.amount)} · {t.is_active ? "Active" : "Paused"}</div>
                </div>
                <button onClick={() => runNow(t)} className="m-tap w-9 h-9 rounded-xl bg-royal-50 text-royal-600 flex items-center justify-center"><RefreshCw size={14} /></button>
                {canDelete && <button onClick={() => handleDelete(t.id)} className="m-tap w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><Trash2 size={14} /></button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </MobileShell>
  );
}
