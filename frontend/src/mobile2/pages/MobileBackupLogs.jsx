import { useEffect, useState } from "react";
import { Database } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

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

  async function run() {
    setRunning(true);
    try {
      const r = await api.post("/backup/run-now");
      addToast(`Backup sent (${r.data.result?.totalRows || 0} rows)`, "success");
      const l = await api.get("/backup/logs"); setLogs(l.data.result || []);
    } catch (err) { addToast(err.response?.data?.message || "Failed", "error"); }
    setRunning(false);
  }

  return (
    <MobileShell title="Backup" subtitle={`${logs.length} runs`}>
      {canRun && (
        <div className="p-4">
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-saffron-50 text-saffron-600 flex items-center justify-center"><Database size={18} /></div>
              <div className="flex-1">
                <div className="text-sm font-bold text-stone-800">Trigger a backup</div>
                <div className="text-[11px] text-stone-500">Sends a fresh .xlsx to Telegram storage.</div>
              </div>
              <button onClick={run} disabled={running} className="m-tap text-xs font-bold px-3 py-2 rounded-2xl bg-saffron-500 text-white disabled:opacity-50">{running ? "Running…" : "Run now"}</button>
            </div>
          </Card>
        </div>
      )}
      {loading ? (
        <div className="p-6 text-center text-sm text-stone-400">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="px-4"><Card><EmptyState title="No backups yet" /></Card></div>
      ) : (
        <div className="p-4 space-y-2">
          {logs.slice(0, 30).map((l, i) => (
            <Card key={i} padding={false}>
              <div className="px-4 py-3">
                <div className="text-sm font-semibold text-stone-800">{l.file_name || "Backup"}</div>
                <div className="text-[11px] text-stone-500">{l.run_at || ""} · {l.status || ""}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </MobileShell>
  );
}
