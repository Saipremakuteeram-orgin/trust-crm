import { useEffect, useState } from "react";
import { Shield, Trash2 } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileListItem from "../components/MobileListItem";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

export default function MobileTrustees() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const canDelete = profile?.role === "admin";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/trustees").then((r) => { setItems(r.data.result || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleDelete(id) {
    if (!window.confirm("Delete this trustee?")) return;
    try { await api.delete(`/trustees/${id}`); addToast("Deleted", "success"); const r = await api.get("/trustees"); setItems(r.data.result || []); }
    catch { addToast("Failed", "error"); }
  }

  return (
    <MobileShell title="Trustees" subtitle={`${items.length} trustees`}>
      {loading ? (
        <div className="p-6 text-center text-sm text-stone-400">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState title="No trustees" message="Add trustees on desktop." />
      ) : (
        <div className="m-card !p-0 mx-4 mt-3 overflow-hidden">
          <ul className="m-list">
            {items.map((t) => (
              <MobileListItem
                key={t.id}
                leading={<div className="w-10 h-10 rounded-xl bg-royal-50 text-royal-600 flex items-center justify-center"><Shield size={18} /></div>}
                title={t.contact?.name || t.name || "Trustee"}
                subtitle={t.role || t.contact?.email || ""}
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
