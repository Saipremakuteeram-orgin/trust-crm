import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PartyPopper } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileListItem from "../components/MobileListItem";
import EmptyState from "../components/EmptyState";
import { useToast } from "../../components/Toast";

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function MobileFunctions() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/functions").then((r) => { setItems(r.data.result || []); setLoading(false); }).catch(() => { addToast("Failed", "error"); setLoading(false); });
  }, []);

  return (
    <MobileShell title="Functions & Budget" subtitle={`${items.length} functions`}>
      {loading ? (
        <div className="p-6 text-center text-sm text-stone-400">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState title="No functions yet" message="Create a function on desktop to start tracking event budgets." />
      ) : (
        <div className="m-card !p-0 mx-4 mt-3 overflow-hidden">
          <ul className="m-list">
            {items.map((f) => (
              <MobileListItem
                key={f.id}
                onClick={() => navigate(`/m/functions/${f.id}`)}
                leading={
                  <div className="w-10 h-10 rounded-xl bg-saffron-50 text-saffron-600 flex items-center justify-center"><PartyPopper size={18} /></div>
                }
                title={f.name}
                subtitle={`${f.status} · Budget ${fmt(f.budget)}`}
              />
            ))}
          </ul>
        </div>
      )}
    </MobileShell>
  );
}
