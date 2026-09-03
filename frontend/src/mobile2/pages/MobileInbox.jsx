import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import InboxList from "../components/InboxList";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";

export default function MobileInbox() {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.get("/mail/logs"),
      api.get("/logs", { params: { limit: 50 } }),
    ]).then((results) => {
      const mail = results[0].status === "fulfilled" ? (results[0].value.data.result || []) : [];
      const logs = results[1].status === "fulfilled" ? (results[1].value.data.result || []) : [];
      const normalized = [
        ...mail.map((m) => ({ ...m, _type: "mail" })),
        ...logs.map((l) => ({ ...l, _type: "activity" })),
      ].sort((a, b) => new Date(b.created_at || b.timestamp || 0) - new Date(a.created_at || a.timestamp || 0));
      setItems(normalized);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <MobileShell title="Inbox" subtitle={`${items.length} items`}>
      {loading ? (
        <div className="p-6 text-center text-sm text-stone-400">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Bell size={26} />} title="All clear" message="No new notifications or activity." />
      ) : (
        <div className="px-4 pt-3"><InboxList items={items} /></div>
      )}
    </MobileShell>
  );
}
