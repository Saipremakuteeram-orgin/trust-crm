import { useEffect, useState } from "react";
import { Heart, Trash2 } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileListItem from "../components/MobileListItem";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

export default function MobileBeneficiaries() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const canDelete = profile?.role === "admin";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/beneficiaries").then((r) => { setItems(r.data.result || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleDelete(id) {
    if (!window.confirm("Delete this beneficiary?")) return;
    try { await api.delete(`/beneficiaries/${id}`); addToast("Deleted", "success"); const r = await api.get("/beneficiaries"); setItems(r.data.result || []); }
    catch { addToast("Failed", "error"); }
  }

  return (
    <MobileShell title="Beneficiaries" subtitle={`${items.length} people`}>
      {loading ? (
        <div className="p-6 text-center text-sm text-stone-400">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState title="No beneficiaries" message="Add beneficiaries on desktop to track support." />
      ) : (
        <div className="m-card !p-0 mx-4 mt-3 overflow-hidden">
          <ul className="m-list">
            {items.map((b) => (
              <MobileListItem
                key={b.id}
                leading={<div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><Heart size={18} /></div>}
                title={b.name || b.contact?.name || "Beneficiary"}
                subtitle={b.notes || b.contact?.phone || ""}
                trailing={canDelete ? (
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(b.id); }} className="m-tap w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"><Trash2 size={14} /></button>
                ) : null}
              />
            ))}
          </ul>
        </div>
      )}
    </MobileShell>
  );
}
