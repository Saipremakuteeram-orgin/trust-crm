import { useEffect, useState } from "react";
import { Database } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileCard from "../components/MobileCard";
import MobileListItem from "../components/MobileListItem";
import EmptyState from "../components/EmptyState";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../lib/AuthContext";

export default function MobileBackupLogs() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const canRun = profile?.role === "admin";
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api.get("/backup/logs").then((r) => { setLogs(r.data.result || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function runBackup() {
    setRunning(true);
    try {
      const r = await api.post("/backup/run-now");
      addToast(`Backup sent (${r.data.result?.totalRows || 0} rows)`, "success");
      const l = await api.get("/backup/logs"); setLogs(l.data.result || []);
    } catch (err) { addToast(err.response?.data?.message || "Failed", "error"); }
    setRunning(false);
  }

  return (
    <MobileShell title="Backup & Restore" subtitle={`${logs.length} runs`}>
      {canRun && (
        <div className="p-4">
          <MobileCard>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-saffron-50 text-saffron-600 flex items-center justify-center"><Database size={18} /></div>
              <div className="flex-1">
                <div className="text-sm font-bold text-stone-800">Trigger a backup</div>
                <p className="text-[11px] text-stone-500">Sends a fresh .xlsx to Telegram storage.</p>
              </div>
              <button onClick={runBackup} disabled={running} className="m-tap text-xs font-semibold px-3 py-2 rounded-xl bg-saffron-500 text-white disabled:opacity-50">
                {running ? "Running…" : "Run now"}
              </button>
            </div>
          </MobileCard>
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-sm text-stone-400">Loading…</div>
      ) : logs.length === 0 ? (
        <EmptyState title="No backups yet" />
      ) : (
        <div className="m-card !p-0 mx-4 mt-3 overflow-hidden">
          <ul className="m-list">
            {logs.slice(0, 30).map((l) => (
              <MobileListItem
                key={l.id || `${l.run_at}-${l.file_name}`}
                title={l.file_name || "Backup"}
                subtitle={`${l.run_at || ""} · ${l.status || ""}`}
              />
            ))}
          </ul>
        </div>
      )}
    </MobileShell>
  );
}
