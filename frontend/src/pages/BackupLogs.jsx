import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import { RefreshCw, CheckCircle, XCircle, Clock, Upload, ShieldAlert, Loader2, Send } from "lucide-react";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatSize(bytes) {
  if (!bytes) return "—";
  const b = Number(bytes);
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDuration(ms) {
  if (!ms) return "—";
  if (ms < 1000) return ms + "ms";
  return (ms / 1000).toFixed(1) + "s";
}

const statusConfig = {
  success: { icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-50", ring: "ring-emerald-200", label: "Success" },
  failed: { icon: XCircle, color: "text-rose-500", bg: "bg-rose-50", ring: "ring-rose-200", label: "Failed" },
  running: { icon: Clock, color: "text-amber-500", bg: "bg-amber-50", ring: "ring-amber-200", label: "Running" },
};

const triggerLabels = {
  scheduled: "⏰ Scheduled",
  manual: "👆 Manual",
  health_check_recovery: "🔧 Health Check",
};

export default function BackupLogs() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const fileInputRef = useCallback((node) => {
    if (node) node.value = "";
  }, []);

  const isAdmin = profile?.role === "admin";

  function loadLogs() {
    setLoading(true);
    api.get("/backup/logs").then((res) => setLogs(res.data.result || [])).catch(() => setLogs([])).finally(() => setLoading(false));
  }

  useEffect(loadLogs, []);

  function handleRefresh() { setRefreshing(true); loadLogs(); setTimeout(() => setRefreshing(false), 600); }

  async function handleBackupNow() {
    setBackingUp(true);
    try {
      const res = await api.post("/backup/run-now");
      const r = res.data.result;
      if (r.error) addToast(`Backup failed: ${r.error}`, "error");
      else addToast(`Backup sent: ${r.fileName} (${r.totalRows} rows)`, "success");
      loadLogs();
    } catch (err) {
      addToast(err.response?.data?.message || "Backup failed", "error");
    }
    setBackingUp(false);
  }

  async function handleRestoreFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      addToast("Please upload an Excel file (.xlsx or .xls)", "error");
      return;
    }
    setRestoring(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = Array.from(new Uint8Array(arrayBuffer));
      const res = await api.post("/backup/restore-excel", {
        fileBuffer: { data, type: "Buffer" },
        fileName: file.name,
      });
      const r = res.data.result;
      addToast(`Restored: ${r.inserted} inserted, ${r.skipped} skipped out of ${r.total}`, "success");
      loadLogs();
    } catch (err) {
      addToast(err.response?.data?.message || "Restore failed", "error");
    }
    setRestoring(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center">
          <ShieldAlert size={48} className="text-rose-400 mb-4" />
          <h2 className="text-xl font-bold text-stone-800">Access Denied</h2>
          <p className="text-sm text-stone-500 mt-2">Only administrators can access backup management.</p>
        </div>
      </AppLayout>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const todayLogs = logs.filter((l) => l.backup_date === today);
  const todaySuccess = todayLogs.some((l) => l.status === "success");
  const latestSuccess = logs.find((l) => l.status === "success");

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Backup & Restore</h1>
          <p className="text-sm text-stone-500 mt-1">Daily backups, health monitoring, and transaction restore</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleRefresh}
            className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 transition-colors">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </motion.button>
        </div>
      </motion.div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${todaySuccess ? "bg-emerald-50" : "bg-amber-50"}`}>
              {todaySuccess
                ? <CheckCircle size={20} className="text-emerald-500" />
                : <Clock size={20} className="text-amber-500" />}
            </div>
            <div>
              <p className="text-xs text-stone-500 font-medium">Today's Status</p>
              <p className={`text-sm font-bold ${todaySuccess ? "text-emerald-700" : "text-amber-700"}`}>
                {todaySuccess ? "Backup Complete" : "Pending / Failed"}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-royal-50">
              <Clock size={20} className="text-royal-500" />
            </div>
            <div>
              <p className="text-xs text-stone-500 font-medium">Last Successful Backup</p>
              <p className="text-sm font-bold text-stone-800">
                {latestSuccess ? formatDate(latestSuccess.created_at) : "Never"}
              </p>
              {latestSuccess && (
                <p className="text-[10px] text-stone-400 mt-0.5">
                  {latestSuccess.total_rows} rows · {formatSize(latestSuccess.file_size)}
                </p>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-saffron-50">
              <Send size={20} className="text-saffron-500" />
            </div>
            <div>
              <p className="text-xs text-stone-500 font-medium">Total Backups</p>
              <p className="text-sm font-bold text-stone-800">{logs.length} runs</p>
              <p className="text-[10px] text-stone-400 mt-0.5">
                {logs.filter((l) => l.status === "success").length} successful · {logs.filter((l) => l.status === "failed").length} failed
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Actions Row */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        className="flex flex-wrap items-center gap-3 mb-6">
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleBackupNow} disabled={backingUp}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold shadow-lg shadow-saffron-500/20 hover:shadow-xl transition-all disabled:opacity-50">
          {backingUp ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {backingUp ? "Backing up..." : "Backup Now"}
        </motion.button>

        <label className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-dashed border-stone-300 bg-white text-stone-600 text-sm font-medium cursor-pointer hover:border-saffron-400 hover:bg-saffron-50/30 transition-all">
          <Upload size={15} />
          {restoring ? "Restoring..." : "Restore from Excel"}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleRestoreFile} disabled={restoring} />
        </label>
      </motion.div>

      {/* Backup Logs Table */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100">
          <h2 className="text-sm font-semibold text-stone-700">Backup History</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-saffron-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-stone-400">
            <Clock size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No backup logs yet</p>
            <p className="text-sm mt-1">Backups will appear here after the first run</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-500 text-left">
                <tr>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Trigger</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Rows</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Size</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Telegram</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Duration</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Error</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {logs.map((log, i) => {
                    const cfg = statusConfig[log.status] || statusConfig.running;
                    const StatusIcon = cfg.icon;
                    return (
                      <motion.tr key={log.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }} className="border-t border-stone-100">
                        <td className="px-5 py-3 text-stone-600">
                          <div>{log.backup_date}</div>
                          <div className="text-[10px] text-stone-400">{formatDate(log.created_at)}</div>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color} ring-1 ${cfg.ring}`}>
                            <StatusIcon size={12} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-stone-600 text-xs">
                          {triggerLabels[log.trigger_type] || log.trigger_type}
                        </td>
                        <td className="px-5 py-3 text-stone-800 font-medium">{log.total_rows || "—"}</td>
                        <td className="px-5 py-3 text-stone-500 text-xs">{formatSize(log.file_size)}</td>
                        <td className="px-5 py-3">
                          {log.telegram_sent
                            ? <span className="text-xs text-emerald-600 font-medium">Sent</span>
                            : <span className="text-xs text-stone-400">No</span>}
                        </td>
                        <td className="px-5 py-3 text-stone-500 text-xs">{formatDuration(log.duration_ms)}</td>
                        <td className="px-5 py-3 text-xs max-w-[200px] truncate text-rose-500">{log.error_message || "—"}</td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </AppLayout>
  );
}
