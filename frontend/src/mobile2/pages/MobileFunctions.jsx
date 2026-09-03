import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import FunctionCard from "../components/FunctionCard";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import { useToast } from "../../components/Toast";

export default function MobileFunctions() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/functions").then((r) => { setItems(r.data.result || []); setLoading(false); }).catch(() => { addToast("Failed", "error"); setLoading(false); });
  }, []);

  return (
    <MobileShell title="Functions" subtitle={`${items.length} functions`}>
      {loading ? (
        <div className="p-6 text-center text-sm text-stone-400">Loading…</div>
      ) : items.length === 0 ? (
        <Card><EmptyState title="No functions" message="Create a function on desktop." /></Card>
      ) : (
        <div className="p-4 space-y-2">
          {items.map((f) => (
            <FunctionCard key={f.id} fn={f} onTap={(fn) => navigate(`/mobile/functions/${fn.id}`)} />
          ))}
        </div>
      )}
    </MobileShell>
  );
}
