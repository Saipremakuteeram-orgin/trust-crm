import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Trash2 } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileListItem from "../components/MobileListItem";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function MobileJournal() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const canDelete = profile?.role === "admin";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/journal-entries").then((r) => { setItems(r.data.result || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function post(id) {
    try {
      await api.post(`/journal-entries/${id}/post`);
      addToast("Posted", "success");
      const r = await api.get("/journal-entries");
      setItems(r.data.result || []);
    } catch (err) { addToast(err.response?.data?.message || "Failed", "error"); }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this entry?")) return;
    try { await api.delete(`/journal-entries/${id}`); addToast("Deleted", "success"); const r = await api.get("/journal-entries"); setItems(r.data.result || []); }
    catch { addToast("Failed", "error"); }
  }

  return (
    <MobileShell title="Journal Entries" subtitle={`${items.length} entries`}>
      {loading ? (
        <div className="p-6 text-center text-sm text-stone-400">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState title="No journal entries" message="Create entries on desktop for the full editing experience." />
      ) : (
        <div className="m-card !p-0 mx-4 mt-3 overflow-hidden">
          <ul className="m-list">
            {items.map((j) => (
              <MobileListItem
                key={j.id}
                leading={
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${j.is_posted ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                    {j.is_posted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </div>
                }
                title={j.entry_number || j.memo || "Entry"}
                subtitle={`${j.entry_date} · ${fmt(j.total_debit || 0)}`}
                trailing={
                  <div className="flex items-center gap-1">
                    {!j.is_posted && (
                      <button onClick={(e) => { e.stopPropagation(); post(j.id); }} className="text-[10px] font-bold px-2 py-1 rounded-full bg-saffron-100 text-saffron-700">POST</button>
                    )}
                    {canDelete && (
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(j.id); }} className="m-tap w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"><Trash2 size={14} /></button>
                    )}
                  </div>
                }
              />
            ))}
          </ul>
        </div>
      )}
    </MobileShell>
  );
}
