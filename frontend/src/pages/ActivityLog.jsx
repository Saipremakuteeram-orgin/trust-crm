import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import {
  History, ChevronLeft, ChevronRight, Filter, RefreshCw,
  ArrowDownCircle, Users, UserPlus, Shield, Settings, Tag
} from "lucide-react";

const entityIcons = {
  transaction: ArrowDownCircle,
  contact: Users,
  user: UserPlus,
  category: Tag,
  settings: Settings,
};

const entityColors = {
  transaction: "text-emerald-600 bg-emerald-50",
  contact: "text-royal-600 bg-royal-50",
  user: "text-saffron-600 bg-saffron-50",
  category: "text-purple-600 bg-purple-50",
  settings: "text-stone-600 bg-stone-100",
};

const actionColors = {
  create: "text-emerald-700 bg-emerald-50",
  update: "text-blue-700 bg-blue-50",
  delete: "text-rose-700 bg-rose-50",
  invite: "text-amber-700 bg-amber-50",
  sync: "text-purple-700 bg-purple-50",
  change_role: "text-indigo-700 bg-indigo-50",
  reset_password: "text-orange-700 bg-orange-50",
};

const actionLabels = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  invite: "Invited",
  sync: "Synced",
  change_role: "Role Changed",
  reset_password: "Password Reset",
};

function formatDetails(entity, details) {
  if (!details || Object.keys(details).length === 0) return null;

  if (entity === "transaction") {
    const parts = [];
    if (details.type) parts.push(details.type === "credit" ? "Credit" : "Debit");
    if (details.amount) parts.push(`₹${Number(details.amount).toLocaleString("en-IN")}`);
    if (details.mode) parts.push(details.mode);
    if (details.party) parts.push(details.party);
    if (details.voucher_filed !== undefined) parts.push(details.voucher_filed ? "Voucher Filed" : "Voucher Not Filed");
    const main = parts.join(" · ");
    if (details.edit_reason) {
      return { text: main, reason: details.edit_reason };
    }
    return { text: main, reason: null };
  }
  if (entity === "user") {
    let text = null;
    if (details.email) text = details.email + (details.role ? ` (${details.role})` : "");
    else if (details.from && details.to) text = `${details.from} → ${details.to}`;
    else if (details.synced !== undefined) text = `${details.synced} user(s) synced`;
    else if (details.email && details.full_name) text = details.email;
    return { text, reason: null };
  }
  if (entity === "contact") {
    return { text: details.name || details.email || null, reason: null };
  }
  if (entity === "category") {
    return { text: details.name || null, reason: null };
  }
  if (entity === "settings") {
    return { text: details.key ? `${details.key}: ₹${Number(details.value).toLocaleString("en-IN")}` : null, reason: null };
  }
  return { text: null, reason: null };
}

function timeAgo(date) {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ActivityLog() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterEntity, setFilterEntity] = useState("");
  const limit = 30;
  const canAdd = profile?.role === "admin" || profile?.role === "accountant";
  const isAdmin = profile?.role === "admin";

  function load(p = page, entity = filterEntity) {
    setLoading(true);
    const params = { page: p, limit };
    if (entity) params.entity = entity;
    api.get("/logs", { params })
      .then((res) => {
        setLogs(res.data.result || []);
        setTotal(res.data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(1, filterEntity); setPage(1); }, [filterEntity]);

  function handleRefresh() { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 600); }

  const totalPages = Math.ceil(total / limit);

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Activity Log</h1>
          <p className="text-sm text-stone-500 mt-1">
            {isAdmin ? "All user activities across the system" : "Your recent activity"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canAdd && (
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleRefresh}
              className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 transition-colors">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </motion.button>
          )}
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <History size={16} />
            {total} event{total !== 1 ? "s" : ""}
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <Filter size={14} />
          Filter:
        </div>
        <div className="flex gap-2 flex-wrap">
          {[{ value: "", label: "All" }, { value: "transaction", label: "Transactions" }, { value: "contact", label: "Contacts" }, { value: "user", label: "Users" }, { value: "category", label: "Categories" }, { value: "settings", label: "Settings" }].map(({ value, label }) => (
            <button key={value} onClick={() => setFilterEntity(value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filterEntity === value ? "bg-saffron-500 text-white shadow-sm" : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Log entries */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-stone-400">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-stone-400">No activity found</div>
        ) : (
          <div className="divide-y divide-stone-100">
            {logs.map((log, i) => {
              const Icon = entityIcons[log.entity] || History;
              const ec = entityColors[log.entity] || "text-stone-600 bg-stone-100";
              const ac = actionColors[log.action] || "text-stone-700 bg-stone-100";
              const detail = formatDetails(log.entity, log.details);
              return (
                <motion.div key={log.id}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="flex items-start gap-4 px-5 py-4 hover:bg-stone-50/50 transition-colors">
                  <div className={`p-2 rounded-xl mt-0.5 ${ec}`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-stone-800">{log.user_email || "System"}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ac}`}>
                        {actionLabels[log.action] || log.action}
                      </span>
                      <span className="text-xs text-stone-400 capitalize">{log.entity}</span>
                    </div>
                    {detail.text && (
                      <p className="text-sm text-stone-500 mt-1 truncate">{detail.text}</p>
                    )}
                    {detail.reason && (
                      <p className="text-xs text-stone-400 mt-0.5 italic">Reason: "{detail.reason}"</p>
                    )}
                  </div>
                  <div className="text-xs text-stone-400 whitespace-nowrap mt-1">
                    {timeAgo(log.created_at)}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-stone-100 bg-stone-50/50">
            <span className="text-xs text-stone-400">
              Page {page} of {totalPages} ({total} total)
            </span>
            <div className="flex gap-2">
              <button onClick={() => { const p = page - 1; setPage(p); load(p); }}
                disabled={page <= 1}
                className="p-1.5 rounded-lg text-stone-400 hover:bg-white hover:text-stone-700 disabled:opacity-30 transition-all">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => { const p = page + 1; setPage(p); load(p); }}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg text-stone-400 hover:bg-white hover:text-stone-700 disabled:opacity-30 transition-all">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </AppLayout>
  );
}
