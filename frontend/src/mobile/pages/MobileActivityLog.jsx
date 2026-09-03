import { useEffect, useState } from "react";
import { History } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileListItem from "../components/MobileListItem";
import EmptyState from "../components/EmptyState";

export default function MobileActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/logs", { params: { limit: 100 } }).then((r) => { setLogs(r.data.result || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <MobileShell title="Activity Log" subtitle={`${logs.length} events`}>
      {loading ? (
        <div className="p-6 text-center text-sm text-stone-400">Loading…</div>
      ) : logs.length === 0 ? (
        <EmptyState icon={<History size={26} />} title="No activity yet" />
      ) : (
        <div className="m-card !p-0 mx-4 mt-3 overflow-hidden">
          <ul className="m-list">
            {logs.map((l) => (
              <MobileListItem
                key={l.id}
                title={l.action || l.event || "Activity"}
                subtitle={`${l.user_email || l.user || ""} · ${l.created_at || l.timestamp || ""}`}
              />
            ))}
          </ul>
        </div>
      )}
    </MobileShell>
  );
}
