import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileListItem from "../components/MobileListItem";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function MobileReceipts() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const canAdd = profile?.role === "admin" || profile?.role === "accountant";
  const canDelete = profile?.role === "admin";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/receipts").then((r) => { setItems(r.data.result || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleDelete(id) {
    if (!window.confirm("Delete this receipt?")) return;
    try { await api.delete(`/receipts/${id}`); addToast("Deleted", "success"); const r = await api.get("/receipts"); setItems(r.data.result || []); }
    catch { addToast("Failed", "error"); }
  }

  return (
    <MobileShell title="Receipts" subtitle={`${items.length} receipts`}>
      {loading ? (
        <div className="p-6 text-center text-sm text-stone-400">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No receipts yet"
          message={canAdd ? "Upload your first receipt from the desktop or attach a file to a transaction." : "No receipts have been uploaded yet."}
        />
      ) : (
        <div className="m-card !p-0 mx-4 mt-3 overflow-hidden">
          <ul className="m-list">
            {items.map((r) => (
              <MobileListItem
                key={r.id}
                title={r.receipt_number || r.description || "Receipt"}
                subtitle={`${r.receipt_date || ""} · ${fmt(r.amount)}`}
                trailing={canDelete ? (
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }} className="m-tap w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"><Trash2 size={14} /></button>
                ) : null}
              />
            ))}
          </ul>
        </div>
      )}
    </MobileShell>
  );
}
