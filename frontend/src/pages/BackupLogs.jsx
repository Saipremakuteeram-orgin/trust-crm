import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import { RefreshCw, CheckCircle, XCircle, Clock, Upload, ShieldAlert, Loader2, Send, GitCompareArrows, Plus, Pencil, Trash2, ArrowRight, FileText, Sun, Moon, ArrowDownCircle, Users, UsersRound, Tag, ChevronDown, ChevronRight } from "lucide-react";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
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

const actionConfig = {
  create: { icon: Plus, color: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-200", label: "Added" },
  update: { icon: Pencil, color: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-200", label: "Modified" },
  delete: { icon: Trash2, color: "text-rose-600", bg: "bg-rose-50", ring: "ring-rose-200", label: "Deleted" },
};

function fmt(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

const entityIcons = {
  transactions: ArrowDownCircle,
  contacts: Users,
  categories: Tag,
  contact_groups: UsersRound,
};

const entityLabels = {
  transactions: "Transactions",
  contacts: "Contacts",
  categories: "Categories",
  contact_groups: "Groups",
};

const txnFields = [
  { key: "type", label: "Type" },
  { key: "mode", label: "Mode" },
  { key: "amount", label: "Amount", fmt: (v) => fmt(v) },
  { key: "party", label: "Party" },
  { key: "txn_date", label: "Date" },
  { key: "description", label: "Notes" },
  { key: "digital_method", label: "Method" },
  { key: "reference_no", label: "Ref #" },
];

const contactFields = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "telegram_chat_id", label: "Telegram" },
  { key: "enabled", label: "Enabled" },
];

const categoryFields = [{ key: "name", label: "Name" }];

const groupFields = [
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
];

const fieldsByEntity = {
  transactions: txnFields,
  contacts: contactFields,
  categories: categoryFields,
  contact_groups: groupFields,
};

function RowDataInline({ row, fields }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {fields.map((f) => {
        let val = row[f.key];
        if (val == null || val === "") return null;
        if (f.key === "amount") val = fmt(val);
        else if (typeof val === "boolean") val = val ? "Yes" : "No";
        else if (typeof val === "string" && val.length > 60) val = val.slice(0, 60) + "...";
        return (
          <span key={f.key} className="text-stone-600">
            <span className="text-stone-400 font-medium">{f.label}:</span>{" "}
            <span className="font-medium text-stone-700">{val}</span>
          </span>
        );
      })}
    </div>
  );
}

function FieldDiff({ fields, before, after }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {fields.map((f) => {
        const bv = before[f.key];
        const av = after[f.key];
        const bvStr = bv == null ? "—" : (f.key === "amount" ? fmt(bv) : String(bv));
        const avStr = av == null ? "—" : (f.key === "amount" ? fmt(av) : String(av));
        if (bvStr === avStr) return null;
        return (
          <span key={f.key} className="inline-flex items-center gap-1">
            <span className="text-stone-400 font-medium">{f.label}:</span>
            <span className="text-rose-500 line-through">{bvStr}</span>
            <ArrowRight size={10} className="text-stone-400" />
            <span className="text-emerald-600 font-medium">{avStr}</span>
          </span>
        );
      })}
    </div>
  );
}

function VersionLogTab() {
  const [versionLog, setVersionLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState({});

  function loadVersionLog() {
    setLoading(true);
    api.get("/backup/version-log")
      .then((res) => setVersionLog(res.data.result))
      .catch(() => setVersionLog(null))
      .finally(() => setLoading(false));
  }

  useEffect(loadVersionLog, []);

  function toggleSection(key) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-saffron-500" />
      </div>
    );
  }

  if (!versionLog || !versionLog.summary) {
    return (
      <div className="text-center py-16 text-stone-400">
        <GitCompareArrows size={40} className="mx-auto mb-3 opacity-40" />
        <p className="font-medium">No version data available</p>
        <p className="text-sm mt-1">Run at least two backups today (morning & evening) to see changes</p>
      </div>
    );
  }

  const { summary, backups, diffs } = versionLog;
  const morningSnapshot = backups?.[0];
  const eveningSnapshot = backups?.[backups.length - 1];

  if (!morningSnapshot || !eveningSnapshot) {
    return (
      <div className="text-center py-16 text-stone-400">
        <GitCompareArrows size={40} className="mx-auto mb-3 opacity-40" />
        <p className="font-medium">Insufficient backup data</p>
        <p className="text-sm mt-1">Run at least two backups to see changes</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl border border-stone-200/80 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50"><Sun size={18} className="text-amber-500" /></div>
            <div>
              <p className="text-[10px] text-stone-500 font-medium uppercase tracking-wider">Morning Backup</p>
              <p className="text-xs font-bold text-stone-800">{formatTime(morningSnapshot.time)}</p>
              <p className="text-[10px] text-stone-400">{morningSnapshot.total_rows} rows</p>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-stone-200/80 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50"><Moon size={18} className="text-indigo-500" /></div>
            <div>
              <p className="text-[10px] text-stone-500 font-medium uppercase tracking-wider">Evening Backup</p>
              <p className="text-xs font-bold text-stone-800">{formatTime(eveningSnapshot.time)}</p>
              <p className="text-[10px] text-stone-400">{eveningSnapshot.total_rows} rows</p>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl border border-stone-200/80 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-royal-50"><GitCompareArrows size={18} className="text-royal-500" /></div>
            <div>
              <p className="text-[10px] text-stone-500 font-medium uppercase tracking-wider">Total Changes</p>
              <p className="text-lg font-bold text-stone-800">{summary.total_changes}</p>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl border border-stone-200/80 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50"><Plus size={18} className="text-emerald-500" /></div>
            <div>
              <p className="text-[10px] text-stone-500 font-medium uppercase tracking-wider">New / Modified / Deleted</p>
              <p className="text-sm font-bold text-stone-800">
                <span className="text-emerald-600">+{summary.new_count}</span>
                <span className="text-stone-400 mx-1">/</span>
                <span className="text-amber-600">~{summary.modified_count}</span>
                <span className="text-stone-400 mx-1">/</span>
                <span className="text-rose-600">-{summary.deleted_count}</span>
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Entity Diffs */}
      {diffs.length === 0 ? (
        <div className="text-center py-10 text-stone-400">
          <CheckCircle size={32} className="mx-auto mb-2 opacity-40" />
          <p className="font-medium">No changes between backups</p>
          <p className="text-sm mt-1">Data remained the same from morning to evening</p>
        </div>
      ) : (
        <div className="space-y-4">
          {diffs.map((diff, i) => {
            const EntityIcon = entityIcons[diff.entity] || FileText;
            const fields = fieldsByEntity[diff.entity] || [];
            const hasNew = diff.new_rows.length > 0;
            const hasModified = diff.modified_rows.length > 0;
            const hasDeleted = diff.deleted_rows.length > 0;
            const delta = diff.evening_count - diff.morning_count;

            return (
              <motion.div key={diff.entity} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">

                {/* Entity Header */}
                <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <EntityIcon size={18} className="text-royal-500" />
                    <h3 className="text-sm font-bold text-stone-800">{diff.label}</h3>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      delta > 0 ? "bg-emerald-50 text-emerald-700" :
                      delta < 0 ? "bg-rose-50 text-rose-700" :
                      "bg-stone-100 text-stone-500"
                    }`}>
                      {diff.morning_count} → {diff.evening_count} ({delta > 0 ? "+" : ""}{delta})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasNew && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                        +{diff.new_rows.length} new
                      </span>
                    )}
                    {hasModified && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                        ~{diff.modified_rows.length} modified
                      </span>
                    )}
                    {hasDeleted && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">
                        -{diff.deleted_rows.length} deleted
                      </span>
                    )}
                  </div>
                </div>

                {/* New Rows */}
                {hasNew && (
                  <div className="border-b border-stone-50">
                    <button onClick={() => toggleSection(`${diff.entity}-new`)}
                      className="w-full px-5 py-3 flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50/40 hover:bg-emerald-50 transition-colors">
                      {expandedSections[`${diff.entity}-new`] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <Plus size={13} />
                      {diff.new_rows.length} New {diff.label} Added
                    </button>
                    {expandedSections[`${diff.entity}-new`] && (
                      <div className="divide-y divide-stone-50 max-h-80 overflow-y-auto">
                        {diff.new_rows.map((row, ri) => (
                          <div key={row.id || ri} className="px-5 py-3 hover:bg-stone-50/50 transition-colors">
                            <div className="flex items-start gap-3">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 shrink-0 mt-0.5">
                                <Plus size={10} /> NEW
                              </span>
                              <RowDataInline row={row} fields={fields} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Modified Rows */}
                {hasModified && (
                  <div className="border-b border-stone-50">
                    <button onClick={() => toggleSection(`${diff.entity}-mod`)}
                      className="w-full px-5 py-3 flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50/40 hover:bg-amber-50 transition-colors">
                      {expandedSections[`${diff.entity}-mod`] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <Pencil size={13} />
                      {diff.modified_rows.length} {diff.label} Modified
                    </button>
                    {expandedSections[`${diff.entity}-mod`] && (
                      <div className="divide-y divide-stone-50 max-h-80 overflow-y-auto">
                        {diff.modified_rows.map((entry, ri) => (
                          <div key={entry.id || ri} className="px-5 py-3 hover:bg-stone-50/50 transition-colors">
                            <div className="flex items-start gap-3">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] bg-amber-50 text-amber-600 ring-1 ring-amber-200 shrink-0 mt-0.5">
                                <Pencil size={10} /> EDIT
                              </span>
                              <div className="space-y-1">
                                <FieldDiff fields={fields} before={entry.before} after={entry.after} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Deleted Rows */}
                {hasDeleted && (
                  <div>
                    <button onClick={() => toggleSection(`${diff.entity}-del`)}
                      className="w-full px-5 py-3 flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50/40 hover:bg-rose-50 transition-colors">
                      {expandedSections[`${diff.entity}-del`] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <Trash2 size={13} />
                      {diff.deleted_rows.length} {diff.label} Deleted
                    </button>
                    {expandedSections[`${diff.entity}-del`] && (
                      <div className="divide-y divide-stone-50 max-h-80 overflow-y-auto">
                        {diff.deleted_rows.map((row, ri) => (
                          <div key={row.id || ri} className="px-5 py-3 hover:bg-stone-50/50 transition-colors">
                            <div className="flex items-start gap-3">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] bg-rose-50 text-rose-600 ring-1 ring-rose-200 shrink-0 mt-0.5">
                                <Trash2 size={10} /> DEL
                              </span>
                              <RowDataInline row={row} fields={fields} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BackupLogs() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [activeTab, setActiveTab] = useState("history");
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
  const nowHour = new Date().getHours();
  const todayLogs = logs.filter((l) => l.backup_date === today);
  const todaySuccess = todayLogs.some((l) => l.status === "success");
  const morningDone = todayLogs.some((l) => l.status === "success" && new Date(l.created_at).getHours() < 12);
  const eveningDone = todayLogs.some((l) => l.status === "success" && new Date(l.created_at).getHours() >= 12);
  const latestSuccess = logs.find((l) => l.status === "success");

  let todayStatusText = "Pending";
  let todayStatusColor = "text-amber-700";
  if (morningDone && eveningDone) {
    todayStatusText = "Both Backups Done";
    todayStatusColor = "text-emerald-700";
  } else if (morningDone) {
    todayStatusText = nowHour >= 12 ? "Evening Pending" : "Morning Done";
    todayStatusColor = nowHour >= 12 ? "text-amber-700" : "text-emerald-700";
  } else if (eveningDone) {
    todayStatusText = "Evening Done";
    todayStatusColor = "text-emerald-700";
  } else if (todayLogs.some((l) => l.status === "failed")) {
    todayStatusText = "Failed";
    todayStatusColor = "text-rose-700";
  }

  const tabs = [
    { id: "history", label: "Backup History", icon: Clock },
    { id: "version-log", label: "Version Log", icon: GitCompareArrows },
  ];

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Backup & Restore</h1>
          <p className="text-sm text-stone-500 mt-1">Twice-daily backups, health monitoring, and transaction restore</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleRefresh}
            className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 transition-colors">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </motion.button>
        </div>
      </motion.div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
              <p className={`text-sm font-bold ${todayStatusColor}`}>
                {todayStatusText}
              </p>
              <p className="text-[10px] text-stone-400 mt-0.5">
                Morning 06:00 · Evening 18:00 IST
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

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-royal-50">
              <Clock size={20} className="text-royal-500" />
            </div>
            <div>
              <p className="text-xs text-stone-500 font-medium">Auto Backup Schedule</p>
              <p className="text-sm font-bold text-stone-800">Daily 06:00 & 18:00 IST</p>
              <p className="text-[10px] text-stone-400 mt-0.5">
                Morning & Evening · Recovery retries: 08:00, 12:00, 16:00, 20:00 IST
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

      {/* Tabs */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="flex gap-1 mb-6 bg-stone-100 rounded-xl p-1 w-fit">
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-white text-stone-800 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}>
              <TabIcon size={15} />
              {tab.label}
            </button>
          );
        })}
      </motion.div>

      {/* Tab Content */}
      {activeTab === "history" ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
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
      ) : (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <VersionLogTab />
        </motion.div>
      )}
    </AppLayout>
  );
}
