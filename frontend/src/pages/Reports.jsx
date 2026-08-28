import { useEffect, useState, useMemo, useCallback } from "react";
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import TransactionListModal from "../components/TransactionListModal";
import { useToast } from "../components/Toast";
import useEscToClose from "../hooks/useEscToClose";
import {
  FileBarChart, Download, RefreshCw, Calendar, Wallet, Landmark, TrendingUp, TrendingDown,
  Clock, Send, Loader2, Plus, Pencil, Trash2, Eye, ToggleLeft, ToggleRight,
  Mail, MessageSquare, Users, Filter, X, CheckCircle, XCircle, ChevronDown, ChevronRight,
  CalendarClock, Zap, FilePlus, Save, Shield, Radio, CalendarDays, Clock as ClockIcon,
} from "lucide-react";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

const fmtShort = (n) => {
  const num = Number(n || 0);
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num}`;
};

const COLORS = ["#f59e0b", "#6366f1", "#10b981", "#f43f5e", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6", "#f97316"];

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] } }),
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm border border-stone-200 rounded-xl px-4 py-3 shadow-xl">
      <p className="text-xs font-semibold text-stone-500 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-bold" style={{ color: p.color }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

function StatCard({ icon: Icon, label, value, sub, color, delay, onClick }) {
  return (
    <motion.div custom={delay} variants={cardVariants} initial="hidden" animate="visible"
      onClick={onClick}
      className={`relative group overflow-hidden bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm hover-lift ${onClick ? "cursor-pointer hover:border-saffron-300" : ""}`}>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `radial-gradient(circle at 80% 20%, ${color}10 0%, transparent 60%)` }} />
      <div className="relative z-10 flex items-start justify-between">
        <div>
          <div className="text-sm text-stone-500 font-medium">{label}</div>
          <div className="text-2xl font-bold text-stone-900 mt-1 tracking-tight">{value}</div>
          {sub && <div className="text-xs text-stone-400 mt-1">{sub}</div>}
        </div>
        <div className="p-2.5 rounded-xl" style={{ background: `${color}12` }}>
          <Icon size={22} style={{ color }} />
        </div>
      </div>
      {onClick && (
        <div className="relative z-10 mt-3 text-[11px] font-medium text-stone-400 group-hover:text-saffron-600 transition-colors">
          Click to view transactions →
        </div>
      )}
    </motion.div>
  );
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function thisMonth() { return new Date().toISOString().slice(0, 7); }
function thisYear() { return String(new Date().getUTCFullYear()); }

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const SCHEDULE_TYPES = [
  { value: "once", label: "Once" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
];

const FORMAT_OPTIONS = [
  { value: "excel", label: "Excel", icon: FileBarChart, color: "text-emerald-600" },
  { value: "pdf", label: "PDF", icon: FileBarChart, color: "text-rose-600" },
  { value: "summary", label: "Summary", icon: Mail, color: "text-blue-600" },
];

const EMPTY_FORM = {
  name: "", filter_type: [], filter_mode: [], filter_categories: [],
  filter_from: todayISO(), filter_to: todayISO(),
  schedule_type: "weekly", schedule_day: 1, schedule_hour: 8, schedule_minute: 0,
  format: "excel", delivery_email: true, delivery_telegram: false,
  recipient_mode: "subscribed", recipient_contact_ids: [], recipient_group_ids: [],
};

function ScheduleForm({ form, setForm, categories, contacts, groups, onSave, onClose, saving }) {
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const filteredContacts = contacts.filter((c) => c.enabled);

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-xs font-semibold text-stone-600 mb-1.5">Report Name</label>
        <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)}
          placeholder="e.g. Weekly Cash Transactions"
          className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
      </div>

      {/* Filters */}
      <div className="bg-stone-50 rounded-xl p-4 space-y-4">
        <h4 className="text-xs font-bold text-stone-600 uppercase tracking-wider flex items-center gap-1.5">
          <Filter size={13} /> Filters
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-stone-500 mb-1">Transaction Type</label>
            <div className="flex flex-wrap gap-1.5">
              {["credit", "debit"].map((t) => (
                <button key={t} type="button"
                  onClick={() => {
                    const types = form.filter_type || [];
                    update("filter_type", types.includes(t) ? types.filter((x) => x !== t) : [...types, t]);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    (form.filter_type || []).includes(t)
                      ? "bg-blue-100 text-blue-700 border-blue-300"
                      : "bg-white text-stone-500 border-stone-200 hover:border-blue-300"
                  }`}>
                  {t === "credit" ? "Credit" : "Debit"}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-stone-400 mt-1">None = all types</p>
          </div>
          <div>
            <label className="block text-xs text-stone-500 mb-1">Payment Mode</label>
            <div className="flex flex-wrap gap-1.5">
              {["cash", "digital"].map((m) => (
                <button key={m} type="button"
                  onClick={() => {
                    const modes = form.filter_mode || [];
                    update("filter_mode", modes.includes(m) ? modes.filter((x) => x !== m) : [...modes, m]);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    (form.filter_mode || []).includes(m)
                      ? "bg-purple-100 text-purple-700 border-purple-300"
                      : "bg-white text-stone-500 border-stone-200 hover:border-purple-300"
                  }`}>
                  {m === "cash" ? "Cash" : "Digital"}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-stone-400 mt-1">None = all modes</p>
          </div>
        </div>
        {categories.length > 0 && (
          <div>
            <label className="block text-xs text-stone-500 mb-1">Categories (leave empty = all)</label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button key={cat.id} type="button"
                  onClick={() => {
                    const ids = form.filter_categories || [];
                    update("filter_categories", ids.includes(cat.id) ? ids.filter((x) => x !== cat.id) : [...ids, cat.id]);
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    (form.filter_categories || []).includes(cat.id)
                      ? "bg-saffron-100 text-saffron-700 border-saffron-300"
                      : "bg-white text-stone-500 border-stone-200 hover:border-saffron-300"
                  }`}>
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {form.schedule_type === "once" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-stone-500 mb-1">From Date</label>
              <input type="date" value={form.filter_from} onChange={(e) => update("filter_from", e.target.value)}
                className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-saffron-400 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">To Date</label>
              <input type="date" value={form.filter_to} onChange={(e) => update("filter_to", e.target.value)}
                className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-saffron-400 transition-colors" />
            </div>
          </div>
        )}
      </div>

      {/* Schedule */}
      <div className="bg-stone-50 rounded-xl p-4 space-y-4">
        <h4 className="text-xs font-bold text-stone-600 uppercase tracking-wider flex items-center gap-1.5">
          <CalendarClock size={13} /> Schedule
        </h4>
        <div>
          <label className="block text-xs text-stone-500 mb-1">Repeat</label>
          <div className="flex flex-wrap gap-2">
            {SCHEDULE_TYPES.map((s) => (
              <button key={s.value} type="button" onClick={() => update("schedule_type", s.value)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                  form.schedule_type === s.value
                    ? "bg-saffron-600 text-white border-saffron-600"
                    : "border-stone-200 text-stone-600 hover:border-saffron-300"
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {(form.schedule_type === "weekly" || form.schedule_type === "biweekly") && (
          <div>
            <label className="block text-xs text-stone-500 mb-1">Day of Week</label>
            <select value={form.schedule_day} onChange={(e) => update("schedule_day", parseInt(e.target.value))}
              className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-saffron-400 transition-colors">
              {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
        )}
        {form.schedule_type === "monthly" && (
          <div>
            <label className="block text-xs text-stone-500 mb-1">Day of Month</label>
            <select value={form.schedule_day ?? 1} onChange={(e) => update("schedule_day", parseInt(e.target.value))}
              className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-saffron-400 transition-colors">
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-stone-500 mb-1">Hour (UTC)</label>
            <select value={form.schedule_hour} onChange={(e) => update("schedule_hour", parseInt(e.target.value))}
              className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-saffron-400 transition-colors">
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-stone-500 mb-1">Minute</label>
            <select value={form.schedule_minute} onChange={(e) => update("schedule_minute", parseInt(e.target.value))}
              className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-saffron-400 transition-colors">
              {[0, 15, 30, 45].map((m) => <option key={m} value={m}>:{String(m).padStart(2, "0")}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Format */}
      <div className="bg-stone-50 rounded-xl p-4 space-y-3">
        <h4 className="text-xs font-bold text-stone-600 uppercase tracking-wider flex items-center gap-1.5">
          <FileBarChart size={13} /> Report Format
        </h4>
        <div className="flex gap-2">
          {FORMAT_OPTIONS.map((fo) => {
            const FIcon = fo.icon;
            return (
              <button key={fo.value} type="button" onClick={() => update("format", fo.value)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                  form.format === fo.value
                    ? "bg-saffron-600 text-white border-saffron-600"
                    : "border-stone-200 text-stone-600 hover:border-saffron-300"
                }`}>
                <FIcon size={14} /> {fo.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Delivery */}
      <div className="bg-stone-50 rounded-xl p-4 space-y-4">
        <h4 className="text-xs font-bold text-stone-600 uppercase tracking-wider flex items-center gap-1.5">
          <Send size={13} /> Delivery
        </h4>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.delivery_email} onChange={(e) => update("delivery_email", e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-saffron-600 focus:ring-saffron-500" />
            <Mail size={14} className="text-stone-500" />
            <span className="text-sm text-stone-700">Email</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.delivery_telegram} onChange={(e) => update("delivery_telegram", e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-saffron-600 focus:ring-saffron-500" />
            <MessageSquare size={14} className="text-stone-500" />
            <span className="text-sm text-stone-700">Telegram</span>
          </label>
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">Recipients</label>
          <select value={form.recipient_mode} onChange={(e) => update("recipient_mode", e.target.value)}
            className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-saffron-400 transition-colors">
            <option value="subscribed">All Subscribed Contacts</option>
            <option value="selected">Select Specific Contacts</option>
            <option value="groups">By Contact Group</option>
          </select>
        </div>
        {form.recipient_mode === "selected" && (
          <div className="max-h-48 overflow-y-auto border-2 border-stone-200 rounded-xl">
            {filteredContacts.length === 0 ? (
              <p className="text-xs text-stone-400 p-3">No enabled contacts</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-stone-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold text-stone-500 w-8"></th>
                    <th className="px-2 py-1.5 text-left font-semibold text-stone-500">Name</th>
                    <th className="px-2 py-1.5 text-left font-semibold text-stone-500">Email</th>
                    <th className="px-2 py-1.5 text-left font-semibold text-stone-500">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map((c) => (
                    <tr key={c.id} className="hover:bg-white cursor-pointer border-t border-stone-100"
                      onClick={() => {
                        const ids = form.recipient_contact_ids || [];
                        update("recipient_contact_ids", ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id]);
                      }}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" readOnly
                          checked={(form.recipient_contact_ids || []).includes(c.id)}
                          className="w-3.5 h-3.5 rounded border-stone-300 text-saffron-600 focus:ring-saffron-500" />
                      </td>
                      <td className="px-2 py-1.5 font-medium text-stone-700">{c.name}</td>
                      <td className="px-2 py-1.5 text-stone-500">{c.email || "—"}</td>
                      <td className="px-2 py-1.5 text-stone-500">{c.phone || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {form.recipient_mode === "groups" && (
          <div>
            <label className="block text-xs text-stone-500 mb-1">Select Groups</label>
            {groups.length === 0 ? (
              <p className="text-xs text-stone-400">No groups created yet</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <button key={g.id} type="button"
                    onClick={() => {
                      const ids = form.recipient_group_ids || [];
                      update("recipient_group_ids", ids.includes(g.id) ? ids.filter((x) => x !== g.id) : [...ids, g.id]);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      (form.recipient_group_ids || []).includes(g.id)
                        ? "bg-indigo-100 text-indigo-700 border-indigo-300"
                        : "bg-white text-stone-500 border-stone-200 hover:border-indigo-300"
                    }`}>
                    <Users size={12} />
                    {g.name}
                    <span className="text-stone-400">({g.member_count || 0})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose}
          className="px-5 py-2.5 rounded-xl border-2 border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors">
          Cancel
        </button>
        <button onClick={onSave} disabled={saving || !form.name}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold shadow-lg shadow-saffron-500/20 hover:shadow-xl transition-all disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
          Save Report
        </button>
      </div>
    </div>
  );
}

function ScheduledReportsTab() {
  const { addToast } = useToast();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  useEscToClose(() => setShowForm(false), showForm);
  useEscToClose(() => setConfirmDelete(null), !!confirmDelete);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get("/scheduled-reports"),
      api.get("/categories"),
      api.get("/contacts"),
      api.get("/groups"),
    ]).then(([sr, cat, con, grp]) => {
      setReports(sr.data.result || []);
      setCategories(cat.data.result || []);
      setContacts(con.data.result || []);
      setGroups(grp.data.result || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  function openCreate() {
    setEditingReport(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }

  function openEdit(r) {
    setEditingReport(r);
    setForm({
      name: r.name || "",
      filter_type: r.filter_type || [],
      filter_mode: r.filter_mode || [],
      filter_categories: r.filter_categories || [],
      filter_from: r.filter_from || todayISO(),
      filter_to: r.filter_to || todayISO(),
      schedule_type: r.schedule_type || "weekly",
      schedule_day: r.schedule_day ?? 1,
      schedule_hour: r.schedule_hour ?? 8,
      schedule_minute: r.schedule_minute ?? 0,
      format: r.format || "excel",
      delivery_email: r.delivery_email !== false,
      delivery_telegram: r.delivery_telegram === true,
      recipient_mode: r.recipient_mode || "subscribed",
      recipient_contact_ids: r.recipient_contact_ids || [],
      recipient_group_ids: r.recipient_group_ids || [],
    });
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editingReport) {
        await api.put(`/scheduled-reports/${editingReport.id}`, form);
        addToast("Report schedule updated", "success");
      } else {
        await api.post("/scheduled-reports", form);
        addToast("Report schedule created", "success");
      }
      setShowForm(false);
      load();
    } catch (err) {
      addToast(err.response && data && message || "Failed to save", "error");
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/scheduled-reports/${id}`);
      addToast("Schedule deleted", "success");
      setConfirmDelete(null);
      load();
    } catch (err) {
      addToast("Delete failed", "error");
    }
  }

  async function handleToggle(id, enabled) {
    try {
      await api.put(`/scheduled-reports/${id}`, { enabled });
      addToast(enabled ? "Schedule enabled" : "Schedule disabled", "success");
      load();
    } catch (err) {
      addToast("Toggle failed", "error");
    }
  }

  async function handlePreview(id) {
    setPreviewId(id);
    setLoadingPreview(true);
    setPreview(null);
    try {
      const res = await api.post(`/scheduled-reports/${id}/preview`);
      setPreview(res.data.result);
    } catch (err) {
      addToast("Preview failed", "error");
    }
    setLoadingPreview(false);
  }

  async function handleSendNow(id) {
    setSending(id);
    try {
      const res = await api.post(`/scheduled-reports/${id}/send-now`);
      const r = res.data.result;
      addToast(`Report sent to ${r.sentCount} recipient(s) (${r.transactions} txns)`, r.failedCount === 0 ? "success" : "warning");
      load();
    } catch (err) {
      addToast(err.response && data && message || "Send failed", "error");
    }
    setSending(null);
  }

  const formatLabel = (f) => ({ excel: "Excel", pdf: "PDF", summary: "Summary" }[f] || f);
  const scheduleLabel = (r) => {
    const base = { once: "Once", daily: "Daily", weekly: "Weekly", biweekly: "Bi-weekly", monthly: "Monthly" }[r.schedule_type] || r.schedule_type;
    if (r.schedule_type === "weekly" || r.schedule_type === "biweekly") return `${base} · ${DAY_NAMES[r.schedule_day || 1]}`;
    if (r.schedule_type === "monthly") return `${base} · Day ${r.schedule_day || 1}`;
    return base;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-stone-800">Scheduled Reports</h2>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => <div key={i} className="skeleton h-48 rounded-2xl" />)}
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200/80 p-12 text-center text-stone-400">
          <CalendarClock size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">No scheduled reports yet</p>
          <p className="text-sm mt-1">Create your first scheduled report to automate delivery</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reports.map((r) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${r.enabled ? "border-stone-200/80" : "border-stone-200/50 opacity-70"}`}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-stone-800 truncate">{r.name}</h3>
                    <p className="text-xs text-stone-400 mt-0.5">{scheduleLabel(r)}</p>
                  </div>
                  <button onClick={() => handleToggle(r.id, !r.enabled)} className="shrink-0 ml-2">
                    {r.enabled
                      ? <ToggleRight size={24} className="text-saffron-500" />
                      : <ToggleLeft size={24} className="text-stone-300" />}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {r.filter_type && r.filter_type.length > 0 && r.filter_type.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600">
                      {t === "credit" ? "Credit" : "Debit"}
                    </span>
                  ))}
                  {r.filter_mode && r.filter_mode.length > 0 && r.filter_mode.map((m) => (
                    <span key={m} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-600">
                      {m === "cash" ? "Cash" : "Digital"}
                    </span>
                  ))}
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-600">
                    {formatLabel(r.format)}
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-600">
                    {r.delivery_email && <Mail size={10} />}
                    {r.delivery_telegram && <MessageSquare size={10} />}
                    {r.recipient_mode === "subscribed" ? "Subscribed" : r.recipient_mode === "groups" ? `${r.recipient_group_ids && length || 0} groups` : `${r.recipient_contact_ids && length || 0} contacts`}
                  </span>
                </div>

                {r.last_run_at && (
                  <p className="text-[10px] text-stone-400 mb-3">
                    Last run: {new Date(r.last_run_at).toLocaleString("en-IN")} ·
                    <span className={`ml-1 font-semibold ${r.last_status === "success" ? "text-emerald-600" : r.last_status === "failed" ? "text-rose-600" : "text-amber-600"}`}>
                      {r.last_status || "—"}
                    </span>
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button onClick={() => handlePreview(r.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-medium text-stone-600 hover:bg-stone-50 transition-colors">
                    <Eye size={12} /> Preview
                  </button>
                  <button onClick={() => handleSendNow(r.id)} disabled={sending === r.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-saffron-50 text-saffron-700 text-xs font-semibold hover:bg-saffron-100 transition-colors disabled:opacity-50">
                    {sending === r.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    Send Now
                  </button>
                  <button onClick={() => openEdit(r)}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-colors">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => setConfirmDelete(r.id)}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Preview panel */}
              <AnimatePresence>
                {previewId === r.id && preview && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-stone-100">
                    <div className="p-4 bg-stone-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-stone-600 uppercase">Preview — {preview.period.start} to {preview.period.end}</h4>
                        <button onClick={() => { setPreviewId(null); setPreview(null); }} className="text-stone-400 hover:text-stone-600">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white rounded-xl p-3 border border-stone-200/80">
                          <p className="text-[10px] text-stone-400 font-medium">Transactions</p>
                          <p className="text-lg font-bold text-stone-800">{preview.count}</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-stone-200/80">
                          <p className="text-[10px] text-stone-400 font-medium">Credit</p>
                          <p className="text-lg font-bold text-emerald-600">{fmt(preview.summary.totalCredit)}</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-stone-200/80">
                          <p className="text-[10px] text-stone-400 font-medium">Debit</p>
                          <p className="text-lg font-bold text-rose-600">{fmt(preview.summary.totalDebit)}</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-stone-200/80">
                          <p className="text-[10px] text-stone-400 font-medium">Recipients</p>
                          <p className="text-lg font-bold text-stone-800">{preview.recipientCount}</p>
                        </div>
                      </div>
                      {preview.sample && length > 0 && (
                        <div className="text-xs text-stone-500">
                          Sample: {preview.sample.slice(0, 3).map((t) => `${t.party || "—"} · ₹${Number(t.amount).toLocaleString("en-IN")}`).join(" | ")}
                          {preview.count > 3 && ` ... +${preview.count - 3} more`}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
                {previewId === r.id && loadingPreview && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-stone-100">
                    <div className="p-6 flex items-center justify-center">
                      <Loader2 size={20} className="animate-spin text-saffron-500" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
                <h3 className="text-lg font-bold text-stone-800">{editingReport ? "Edit Report Schedule" : "Create Report Schedule"}</h3>
                <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-50">
                  <X size={18} />
                </button>
              </div>
              <div className="p-6">
                <ScheduleForm form={form} setForm={setForm} categories={categories} contacts={contacts} groups={groups}
                  onSave={handleSave} onClose={() => setShowForm(false)} saving={saving} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
              <Trash2 size={32} className="mx-auto mb-3 text-rose-400" />
              <h3 className="text-lg font-bold text-stone-800">Delete Schedule?</h3>
              <p className="text-sm text-stone-500 mt-1 mb-5">This will permanently remove this scheduled report.</p>
              <div className="flex gap-2 justify-center">
                <button onClick={() => setConfirmDelete(null)}
                  className="px-5 py-2.5 rounded-xl border-2 border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50">
                  Cancel
                </button>
                <button onClick={() => handleDelete(confirmDelete)}
                  className="px-5 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-semibold hover:bg-rose-600 transition-colors">
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


function BalanceSheetTab({ data, loading }) {
  if (loading) return <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400"><p>Loading balance sheet...</p></div>;
  if (!data) return <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400"><p>No data available.</p></div>;

  const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

  return (
    <div className="space-y-6">
      <div className={`p-4 rounded-xl ${data.is_balanced ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
        <p className="text-sm font-medium">{data.is_balanced ? "Balance Sheet is balanced" : "Balance Sheet is NOT balanced"}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-stone-200 p-6">
          <h3 className="text-lg font-bold text-stone-900 mb-4">Assets</h3>
          <div className="space-y-2">
            {data.assets && data.assets.map(a => (
              <div key={a.account_id} className="flex justify-between text-sm">
                <span className="text-stone-700">{a.name}</span>
                <span className="font-medium text-stone-900">{fmt(a.balance)}</span>
              </div>
            ))}
            <div className="border-t border-stone-100 pt-2 mt-2">
              <div className="flex justify-between text-sm font-bold">
                <span>Total Assets</span>
                <span className="text-emerald-700">{fmt(data.total_assets)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-stone-200 p-6">
          <h3 className="text-lg font-bold text-stone-900 mb-4">Liabilities</h3>
          <div className="space-y-2">
            {data.liabilities && data.liabilities.map(a => (
              <div key={a.account_id} className="flex justify-between text-sm">
                <span className="text-stone-700">{a.name}</span>
                <span className="font-medium text-stone-900">{fmt(a.balance)}</span>
              </div>
            ))}
            <div className="border-t border-stone-100 pt-2 mt-2">
              <div className="flex justify-between text-sm font-bold">
                <span>Total Liabilities</span>
                <span className="text-rose-700">{fmt(data.total_liabilities)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-stone-200 p-6">
          <h3 className="text-lg font-bold text-stone-900 mb-4">Equity</h3>
          <div className="space-y-2">
            {data.equity && data.equity.map(a => (
              <div key={a.account_id} className="flex justify-between text-sm">
                <span className="text-stone-700">{a.name}</span>
                <span className="font-medium text-stone-900">{fmt(a.balance)}</span>
              </div>
            ))}
            <div className="border-t border-stone-100 pt-2 mt-2">
              <div className="flex justify-between text-sm font-bold">
                <span>Total Equity</span>
                <span className="text-blue-700">{fmt(data.total_equity)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfitLossTab({ data, loading }) {
  if (loading) return <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400"><p>Loading profit & loss...</p></div>;
  if (!data) return <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400"><p>No data available.</p></div>;

  const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

  return (
    <div className="space-y-6">
      <div className={`p-4 rounded-xl ${data.net_profit >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
        <p className="text-sm font-medium">Net {data.net_profit >= 0 ? "Profit" : "Loss"}: {fmt(data.net_profit)}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-stone-200 p-6">
          <h3 className="text-lg font-bold text-stone-900 mb-4">Income</h3>
          <div className="space-y-2">
            {data.income && data.income.map(a => (
              <div key={a.account_id} className="flex justify-between text-sm">
                <span className="text-stone-700">{a.name}</span>
                <span className="font-medium text-emerald-700">{fmt(a.balance)}</span>
              </div>
            ))}
            <div className="border-t border-stone-100 pt-2 mt-2">
              <div className="flex justify-between text-sm font-bold">
                <span>Total Income</span>
                <span className="text-emerald-700">{fmt(data.total_income)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-stone-200 p-6">
          <h3 className="text-lg font-bold text-stone-900 mb-4">Expenses</h3>
          <div className="space-y-2">
            {data.expenses && data.expenses.map(a => (
              <div key={a.account_id} className="flex justify-between text-sm">
                <span className="text-stone-700">{a.name}</span>
                <span className="font-medium text-rose-700">{fmt(a.balance)}</span>
              </div>
            ))}
            <div className="border-t border-stone-100 pt-2 mt-2">
              <div className="flex justify-between text-sm font-bold">
                <span>Total Expenses</span>
                <span className="text-rose-700">{fmt(data.total_expenses)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CashFlowTab({ data, loading }) {
  if (loading) return <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400"><p>Loading cash flow...</p></div>;
  if (!data) return <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400"><p>No data available.</p></div>;

  const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

  return (
    <div className="space-y-6">
      <div className={`p-4 rounded-xl ${data.net_cash_flow >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
        <p className="text-sm font-medium">Net Cash Flow: {fmt(data.net_cash_flow)}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-stone-200 p-6">
          <h3 className="text-lg font-bold text-stone-900 mb-4">Operating Activities</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-stone-700">Cash In (Income)</span>
              <span className="font-medium text-emerald-700">{fmt(data.operating_inflow)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-700">Cash Out (Expenses)</span>
              <span className="font-medium text-rose-700">{fmt(data.operating_outflow)}</span>
            </div>
            <div className="border-t border-stone-100 pt-2 mt-2">
              <div className="flex justify-between text-sm font-bold">
                <span>Net Operating</span>
                <span className={data.operating_inflow - data.operating_outflow >= 0 ? "text-emerald-700" : "text-rose-700"}>
                  {fmt(data.operating_inflow - data.operating_outflow)}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-stone-200 p-6">
          <h3 className="text-lg font-bold text-stone-900 mb-4">Financing Activities</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-stone-700">Funds In</span>
              <span className="font-medium text-emerald-700">{fmt(data.financing_inflow)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-700">Funds Out</span>
              <span className="font-medium text-rose-700">{fmt(data.financing_outflow)}</span>
            </div>
            <div className="border-t border-stone-100 pt-2 mt-2">
              <div className="flex justify-between text-sm font-bold">
                <span>Net Financing</span>
                <span className={data.financing_inflow - data.financing_outflow >= 0 ? "text-emerald-700" : "text-rose-700"}>
                  {fmt(data.financing_inflow - data.financing_outflow)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-stone-200 p-6">
        <h3 className="text-lg font-bold text-stone-900 mb-4">Cash & Bank Balances</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-stone-50 rounded-xl">
            <div className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Cash in Hand</div>
            <div className="text-2xl font-bold text-stone-900 mt-1">{fmt(data.cash_balance)}</div>
          </div>
          <div className="p-4 bg-stone-50 rounded-xl">
            <div className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Bank Balance</div>
            <div className="text-2xl font-bold text-stone-900 mt-1">{fmt(data.bank_balance)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default function Reports() {
  const [range, setRange] = useState("monthly");
  const [date, setDate] = useState(todayISO());
  const [month, setMonth] = useState(thisMonth());
  const [year, setYear] = useState(thisYear());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [modal, setModal] = useState({ open: false, title: "", subtitle: "", transactions: null, loading: false });
  const [activeTab, setActiveTab] = useState("analytics");
  const [createReportOpen, setCreateReportOpen] = useState(false);
  const [crStep, setCrStep] = useState(1);

  // Create Custom Report state
  const [crRange, setCrRange] = useState("monthly");
  const [crDate, setCrDate] = useState(todayISO());
  const [crWeekStart, setCrWeekStart] = useState("");
  const [crMonth, setCrMonth] = useState(thisMonth());
  const [crQuarter, setCrQuarter] = useState("");
  const [crYear, setCrYear] = useState(thisYear());
  const [crFrom, setCrFrom] = useState("");
  const [crTo, setCrTo] = useState("");
  const [crType, setCrType] = useState([]);
  const [crMode, setCrMode] = useState([]);
  const [crCategories, setCrCategories] = useState([]);
  const [crFormat, setCrFormat] = useState("excel");
  const [crDeliveryEmail, setCrDeliveryEmail] = useState(false);
  const [crDeliveryTelegram, setCrDeliveryTelegram] = useState(false);
  const [crRecipientMode, setCrRecipientMode] = useState("subscribed");
  const [crRecipientContactIds, setCrRecipientContactIds] = useState([]);
  const [crRecipientGroupIds, setCrRecipientGroupIds] = useState([]);
  const [crGenerating, setCrGenerating] = useState(false);
  const [crPreview, setCrPreview] = useState(null);
  const [crCategoriesList, setCrCategoriesList] = useState([]);
  const [crContacts, setCrContacts] = useState([]);
  const [crGroups, setCrGroups] = useState([]);

  const query = useMemo(() => {
    const q = { range };
    if (range === "daily") q.date = date;
    else if (range === "monthly") q.month = month;
    else if (range === "yearly") q.year = year;
    else { q.from = from; q.to = to; }
    return q;
  }, [range, date, month, year, from, to]);

  const qs = useMemo(() => new URLSearchParams(query).toString(), [query]);

  function load() {
    setLoading(true);
    api.get("/reports?" + qs)
      .then((res) => setData(res.data.result))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => { if (activeTab === "analytics") load(); }, [qs, activeTab]);

  useEffect(() => {
    if (activeTab === "create") {
      Promise.all([
        api.get("/categories"),
        api.get("/contacts"),
        api.get("/groups"),
      ]).then(([cat, con, grp]) => {
        setCrCategoriesList(cat.data.result || []);
        setCrContacts(con.data.result || []);
        setCrGroups(grp.data.result || []);
      }).catch(() => {});
    }
  }, [activeTab]);

  useEffect(() => {
    if (createReportOpen) {
      Promise.all([
        api.get("/categories"),
        api.get("/contacts"),
        api.get("/groups"),
      ]).then(([cat, con, grp]) => {
        setCrCategoriesList(cat.data.result || []);
        setCrContacts(con.data.result || []);
        setCrGroups(grp.data.result || []);
      }).catch(() => {});
    }
  }, [createReportOpen]);

  function openTxnModal(filterMode, title, subtitle) {
    setModal({ open: true, title, subtitle: `${subtitle} · ${data && label || ""}`, transactions: null, loading: true });
    api.get("/reports/transactions?" + qs)
      .then((res) => {
        const all = res.data.result || [];
        let filtered = all;
        if (filterMode === "cash" || filterMode === "digital") filtered = all.filter((t) => t.mode === filterMode);
        else if (filterMode === "credit" || filterMode === "debit") filtered = all.filter((t) => t.type === filterMode);
        setModal((m) => ({ ...m, transactions: filtered, loading: false }));
      })
      .catch(() => setModal((m) => ({ ...m, transactions: [], loading: false })));
  }

  async function exportExcel() {
    setExporting("excel");
    try {
      const res = await api.post("/reports/export/excel?" + qs, {}, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `report-${range}-${range === "monthly" ? month : range === "yearly" ? year : range === "daily" ? date : "custom"}.xlsx`);
      document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
    } catch (err) { console.error(err); } finally { setExporting(null); }
  }

  async function exportPDF() {
    setExporting("pdf");
    try {
      const res = await api.post("/reports/export/pdf?" + qs, {}, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `report-${range}-${range === "monthly" ? month : range === "yearly" ? year : range === "daily" ? date : "custom"}.pdf`);
      document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
    } catch (err) { console.error(err); } finally { setExporting(null); }
  }

  // Create Custom Report handlers
  async function loadCrPreview() {
    setCrGenerating(true);
    try {
      const payload = {
        range: crRange,
        date: crDate, month: crMonth, year: crYear, from: crFrom, to: crTo,
        filter_type: crType, filter_mode: crMode, filter_categories: crCategories,
        format: 'preview',
      };
      const res = await api.post("/reports/generate", payload);
      setCrPreview(res.data.result);
      setCrGenerating(false);
    } catch (err) {
      setCrGenerating(false);
      console.error(err);
    }
  }

  async function crGenerateAndDownload() {
    setCrGenerating(true);
    try {
      const payload = {
        range: crRange,
        date: crDate, month: crMonth, year: crYear, from: crFrom, to: crTo,
        filter_type: crType, filter_mode: crMode, filter_categories: crCategories,
        format: crFormat,
        delivery_email: crDeliveryEmail,
        delivery_telegram: crDeliveryTelegram,
        recipient_mode: crRecipientMode,
        recipient_contact_ids: crRecipientContactIds,
        recipient_group_ids: crRecipientGroupIds,
      };
      const res = await api.post("/reports/generate", payload, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const ext = crFormat === 'pdf' ? 'pdf' : 'xlsx';
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Trust-CRM-Report-${Date.now()}.${ext}`);
      document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
      setCrGenerating(false);
    } catch (err) {
      setCrGenerating(false);
      console.error(err);
    }
  }

  function toggleCrGroup(id) {
    setCrRecipientGroupIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  // Build payload for report generation
  function buildCrPayload(overrides = {}) {
    const f = { ...crFormData, ...overrides };
    const base = {
      filter_type: f.type,
      filter_mode: f.mode,
      filter_categories: f.categories,
      format: f.format,
      delivery_email: f.delivery_email,
      delivery_telegram: f.delivery_telegram,
      recipient_mode: f.recipient_mode,
      recipient_contact_ids: f.recipient_contact_ids,
      recipient_group_ids: f.recipient_group_ids,
    };

    // Resolve date range into from/to
    switch (f.range) {
      case 'today':
        return { ...base, range: 'daily', date: f.date };
      case 'week': {
        const start = f.weekStart || todayISO();
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return { ...base, range: 'custom', from: start, to: end.toISOString().slice(0, 10) };
      }
      case 'month':
        return { ...base, range: 'monthly', month: f.month };
      case 'quarter': {
        if (!f.quarter) return { ...base, range: 'custom', from: '', to: '' };
        const [year, q] = f.quarter.split('-Q');
        const qNum = parseInt(q);
        const startMonth = (qNum - 1) * 3 + 1;
        const start = `${year}-${String(startMonth).padStart(2, '0')}-01`;
        const endDate = new Date(parseInt(year), startMonth + 2, 0);
        const end = endDate.toISOString().slice(0, 10);
        return { ...base, range: 'custom', from: start, to: end };
      }
      case 'year':
        return { ...base, range: 'yearly', year: f.year };
      case 'all':
        return { ...base, range: 'custom', from: '2000-01-01', to: todayISO() };
      case 'custom':
        return { ...base, range: 'custom', from: f.from, to: f.to };
      default:
        return { ...base, range: 'monthly', month: thisMonth() };
    }
  }

  // Computed form data for payload building
  const crFormData = {
    range: crRange,
    date: crDate,
    weekStart: crWeekStart,
    month: crMonth,
    quarter: crQuarter,
    year: crYear,
    from: crFrom,
    to: crTo,
    type: crType,
    mode: crMode,
    categories: crCategories,
    format: crFormat,
    delivery_email: crDeliveryEmail,
    delivery_telegram: crDeliveryTelegram,
    recipient_mode: crRecipientMode,
    recipient_contact_ids: crRecipientContactIds,
    recipient_group_ids: crRecipientGroupIds,
  };

  function openCreateReport() {
    setCrStep(1);
    setCrPreview(null);
    setCreateReportOpen(true);
  }

  function closeCreateReport() {
    setCreateReportOpen(false);
    setCrPreview(null);
    setCrStep(1);
  }

  function nextStep() { setCrStep(s => Math.min(s + 1, 4)); }
  function prevStep() { setCrStep(s => Math.max(s - 1, 1)); }

  async function handlePreview() {
    setCrGenerating(true);
    try {
      const payload = buildCrPayload({ format: 'preview' });
      const res = await api.post("/reports/generate", payload);
      setCrPreview(res.data.result);
      setCrGenerating(false);
      setCrStep(4); // Show preview on step 4
    } catch (err) {
      setCrGenerating(false);
      console.error(err);
    }
  }

  async function handleGenerateDownload() {
    setCrGenerating(true);
    try {
      const payload = buildCrPayload();
      const res = await api.post("/reports/generate", payload, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const ext = crFormat === 'pdf' ? 'pdf' : crFormat === 'summary' ? 'json' : 'xlsx';
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Trust-CRM-Report-${Date.now()}.${ext}`);
      document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
      setCrGenerating(false);
      closeCreateReport();
    } catch (err) {
      setCrGenerating(false);
      console.error(err);
    }
  }

  async function loadFinancials() {
    setFinancialsLoading(true);
    try {
      const [bs, pl, cf] = await Promise.all([
        api.get("/reports/financials/balance-sheet"),
        api.get("/reports/financials/profit-loss"),
        api.get("/reports/financials/cash-flow"),
      ]);
      setBalanceSheet(bs.data.result);
      setProfitLoss(pl.data.result);
      setCashFlow(cf.data.result);
    } catch {
      // silent fail
    }
    setFinancialsLoading(false);
  }

  async function handleSaveAsScheduled() {
    // Pre-fill the scheduled report form with current settings
    const scheduledForm = {
      name: `Custom Report ${new Date().toLocaleDateString()}`,
      filter_type: crType,
      filter_mode: crMode,
      filter_categories: crCategories,
      filter_from: (() => {
        const p = buildCrPayload();
        return p.from || todayISO();
      })(),
      filter_to: (() => {
        const p = buildCrPayload();
        return p.to || todayISO();
      })(),
      schedule_type: 'once',
      schedule_day: 1,
      schedule_hour: 8,
      schedule_minute: 0,
      format: crFormat,
      delivery_email: crDeliveryEmail,
      delivery_telegram: crDeliveryTelegram,
      recipient_mode: crRecipientMode,
      recipient_contact_ids: crRecipientContactIds,
      recipient_group_ids: crRecipientGroupIds,
    };
    setForm(scheduledForm);
    setEditingReport(null);
    setShowForm(true);
    closeCreateReport();
  }

  function toggleCrType(t) {
    setCrType((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }
  function toggleCrMode(m) {
    setCrMode((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  }
  function toggleCrCategory(id) {
    setCrCategories((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleCrContact(id) {
    setCrRecipientContactIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleCrGroup(id) {
    setCrRecipientGroupIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  const tabs = [
    { id: "analytics", label: "Analytics", icon: FileBarChart },
    { id: "balance-sheet", label: "Balance Sheet", icon: Landmark },
    { id: "profit-loss", label: "Profit & Loss", icon: TrendingUp },
    { id: "cash-flow", label: "Cash Flow", icon: Wallet },
    { id: "scheduled", label: "Scheduled Reports", icon: CalendarClock },
  ];

  const ov = data && data.overview || {};

  return (
    <>
      <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Reports</h1>
        <div className="flex items-center gap-2">
          {activeTab === "analytics" && (
            <div className="flex items-center gap-2">
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={load}
                className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 transition-colors">
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              </motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={exportPDF} disabled={exporting === "pdf"}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50">
                <Download size={15} /> {exporting === "pdf" ? "..." : "PDF"}
              </motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={exportExcel} disabled={exporting === "excel"}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 text-white shadow-lg shadow-saffron-500/20 hover:shadow-xl transition-all disabled:opacity-50">
                <Download size={15} /> {exporting === "excel" ? "..." : "Excel"}
              </motion.button>
            </div>
          )}
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openCreateReport}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold shadow-lg shadow-saffron-500/20 hover:shadow-xl transition-all">
            <FilePlus size={15} /> Create Report
          </motion.button>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
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

      {activeTab === "analytics" ? (
        <>
          {/* Period selector */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={16} className="text-saffron-500" />
              <span className="text-sm font-semibold text-stone-700">Select Period</span>
              {data && data.label && <span className="text-xs text-stone-400">({data.label})</span>}
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {[{ k: "daily", l: "Daily" }, { k: "monthly", l: "Monthly" }, { k: "yearly", l: "Yearly" }, { k: "custom", l: "Custom Range" }].map((o) => (
                <button key={o.k} onClick={() => setRange(o.k)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                    range === o.k
                      ? "bg-saffron-600 text-white border-saffron-600 shadow-lg shadow-saffron-500/25"
                      : "border-stone-200 text-stone-600 hover:border-saffron-300"
                  }`}>
                  {o.l}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              {range === "daily" && (
                <label className="flex flex-col gap-1 text-xs text-stone-500">
                  Date
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                    className="border-2 border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:border-saffron-400 transition-colors" />
                </label>
              )}
              {range === "monthly" && (
                <label className="flex flex-col gap-1 text-xs text-stone-500">
                  Month
                  <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                    className="border-2 border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:border-saffron-400 transition-colors" />
                </label>
              )}
              {range === "yearly" && (
                <label className="flex flex-col gap-1 text-xs text-stone-500">
                  Year
                  <input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(e.target.value)}
                    className="border-2 border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:border-saffron-400 transition-colors w-28" />
                </label>
              )}
              {range === "custom" && (
                <>
                  <label className="flex flex-col gap-1 text-xs text-stone-500">
                    From
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                      className="border-2 border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:border-saffron-400 transition-colors" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-stone-500">
                    To
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                      className="border-2 border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:border-saffron-400 transition-colors" />
                  </label>
                </>
              )}
              <motion.button whileTap={{ scale: 0.97 }} onClick={load}
                className="px-4 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 transition-colors">
                Apply
              </motion.button>
            </div>
          </motion.div>

          {loading ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {[1,2,3,4].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="skeleton h-80 rounded-2xl" />
                <div className="skeleton h-80 rounded-2xl" />
              </div>
            </div>
          ) : !data || data.txn_count === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200/80 p-12 text-center text-stone-400">
              No transactions found for the selected period.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                <StatCard icon={TrendingUp} label="Total Income" value={fmtShort(ov.total_credit)} sub={`${data.txn_count} transactions`} color="#059669" delay={0}
                  onClick={() => openTxnModal("credit", "Income Transactions", "All credit (in) for period")} />
                <StatCard icon={TrendingDown} label="Total Expenses" value={fmtShort(ov.total_debit)} sub={`Net: ${fmtShort(ov.net_balance)}`} color="#e11d48" delay={1}
                  onClick={() => openTxnModal("debit", "Expense Transactions", "All debit (out) for period")} />
                <StatCard icon={Wallet} label="Cash in Hand" value={fmt(ov.cash_in_hand)} color="#10b981" delay={2}
                  onClick={() => openTxnModal("cash", "Cash Transactions", "All cash-mode for period")} />
                <StatCard icon={Landmark} label="Digital Balance" value={fmt(ov.digital_balance)} color="#6366f1" delay={3}
                  onClick={() => openTxnModal("digital", "Digital Transactions", "All digital-mode for period")} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
                {data.trend && data.trend.length > 0 && (
                  <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible"
                    className="lg:col-span-2 bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm hover-lift">
                    <h2 className="text-sm font-semibold text-stone-700 mb-5 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-saffron-500" />
                      {range === "yearly" ? "Monthly Trend" : "Income vs Expenses Trend"}
                    </h2>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={data.trend}>
                        <defs>
                          <linearGradient id="rCredit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="rDebit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="period" tick={{ fontSize: 12, fill: "#94a3b8" }} />
                        <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} tickFormatter={(v) => fmtShort(v)} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Area type="monotone" dataKey="credit" name="Income" stroke="#10b981" fill="url(#rCredit)" strokeWidth={2.5} />
                        <Area type="monotone" dataKey="debit" name="Expenses" stroke="#f43f5e" fill="url(#rDebit)" strokeWidth={2.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </motion.div>
                )}

                {data.category_breakdown && data.category_breakdown.length > 0 && (
                  <motion.div custom={5} variants={cardVariants} initial="hidden" animate="visible"
                    className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm hover-lift">
                    <h2 className="text-sm font-semibold text-stone-700 mb-5">Expense Categories</h2>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={data.category_breakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={95}
                          paddingAngle={3} dataKey="value" nameKey="name">
                          {data.category_breakdown.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => fmt(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {data.category_breakdown.slice(0, 5).map((cat, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 text-xs text-stone-600">
                          <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          {cat.name}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>

              {data.top_parties && data.top_parties.length > 0 && (
                <motion.div custom={6} variants={cardVariants} initial="hidden" animate="visible"
                  className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm hover-lift mb-8">
                  <h2 className="text-sm font-semibold text-stone-700 mb-5">Top Parties by Volume</h2>
                  <div className="space-y-3">
                    {data.top_parties.slice(0, 8).map((party, i) => {
                      const maxAmt = data.top_parties[0] && amount || 1;
                      const pct = (party.amount / maxAmt) * 100;
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium text-stone-700 truncate">{party.name}</span>
                            <span className="text-stone-500 text-xs">{fmt(party.amount)}</span>
                          </div>
                          <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                              transition={{ delay: 0.3 + i * 0.1, duration: 0.6, ease: "easeOut" }}
                              className="h-full rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </>
          )}

          <TransactionListModal
            open={modal.open}
            onClose={() => setModal((m) => ({ ...m, open: false }))}
            title={modal.title}
            subtitle={modal.subtitle}
            transactions={modal.transactions}
            loading={modal.loading}
          />
        </>
      ) : (activeTab === "balance-sheet" ? (
        <BalanceSheetTab data={balanceSheet} loading={financialsLoading} />
      ) : (activeTab === "profit-loss" ? (
        <ProfitLossTab data={profitLoss} loading={financialsLoading} />
      ) : (activeTab === "cash-flow" ? (
        <CashFlowTab data={cashFlow} loading={financialsLoading} />
      ) : (activeTab === "scheduled" ? (
        <ScheduledReportsTab />
      ) : null))))}
    </AppLayout>

    <AnimatePresence>
      {createReportOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeCreateReport(); }}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-saffron-100 text-saffron-600">
                  <FilePlus size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-stone-800">Create Custom Report</h3>
                  <p className="text-xs text-stone-500">Step {crStep} of 4</p>
                </div>
              </div>
              <button onClick={closeCreateReport} className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-50">
                <X size={18} />
              </button>
            </div>

            {/* Step Indicator */}
            <div className="px-6 py-4 border-b border-stone-100 bg-stone-50/50">
              <div className="flex items-center justify-between">
                {[
                  { num: 1, label: 'Date Range', icon: CalendarDays },
                  { num: 2, label: 'Filters', icon: Filter },
                  { num: 3, label: 'Format & Delivery', icon: FileBarChart },
                  { num: 4, label: 'Actions', icon: Shield },
                ].map((step, i) => (
                  <React.Fragment key={step.num}>
                    <div className="flex items-center gap-1">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all ${
                        crStep >= step.num ? 'bg-saffron-600 text-white' : 'bg-stone-200 text-stone-400'
                      }`}>
                        {crStep > step.num ? <CheckCircle size={12} /> : <step.icon size={12} />}
                      </div>
                      <span className={`text-xs font-medium hidden sm:block ${
                        crStep >= step.num ? 'text-saffron-600' : 'text-stone-400'
                      }`}>{step.label}</span>
                    </div>
                    {i < 3 && (
                      <div className={`hidden lg:block flex-1 h-1 mx-2 rounded transition-colors ${
                        crStep > step.num ? 'bg-saffron-600' : 'bg-stone-200'
                      }`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {crStep === 1 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Calendar size={16} className="text-saffron-500" />
                      <span className="text-sm font-semibold text-stone-700">Select Period</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {[{ k: "daily", l: "Today" }, { k: "weekly", l: "This Week" }, { k: "monthly", l: "This Month" }, { k: "yearly", l: "This Year" }, { k: "all", l: "All Data" }, { k: "custom", l: "Custom Range" }].map((o) => (
                        <button key={o.k} onClick={() => setCrRange(o.k)}
                          className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                            crRange === o.k ? "bg-saffron-600 text-white border-saffron-600 shadow-lg shadow-saffron-500/25" : "border-stone-200 text-stone-600 hover:border-saffron-300"
                          }`}>
                          {o.l}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-3 items-end">
                      {crRange === "daily" && (
                        <label className="flex flex-col gap-1 text-xs text-stone-500">
                          Date
                          <input type="date" value={crDate} onChange={(e) => setCrDate(e.target.value)} className="border-2 border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:border-saffron-400 transition-colors" />
                        </label>
                      )}
                      {crRange === "weekly" && (
                        <label className="flex flex-col gap-1 text-xs text-stone-500">
                          Week Start Date
                          <input type="date" value={crFrom} onChange={(e) => setCrFrom(e.target.value)} className="border-2 border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:border-saffron-400 transition-colors" />
                        </label>
                      )}
                      {crRange === "monthly" && (
                        <label className="flex flex-col gap-1 text-xs text-stone-500">
                          Month
                          <input type="month" value={crMonth} onChange={(e) => setCrMonth(e.target.value)} className="border-2 border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:border-saffron-400 transition-colors" />
                        </label>
                      )}
                      {crRange === "yearly" && (
                        <label className="flex flex-col gap-1 text-xs text-stone-500">
                          Year
                          <input type="number" min="2000" max="2100" value={crYear} onChange={(e) => setCrYear(e.target.value)} className="border-2 border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:border-saffron-400 transition-colors w-28" />
                        </label>
                      )}
                      {crRange === "custom" && (
                        <>
                          <label className="flex flex-col gap-1 text-xs text-stone-500">
                            From
                            <input type="date" value={crFrom} onChange={(e) => setCrFrom(e.target.value)} className="border-2 border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:border-saffron-400 transition-colors" />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-stone-500">
                            To
                            <input type="date" value={crTo} onChange={(e) => setCrTo(e.target.value)} className="border-2 border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:border-saffron-400 transition-colors" />
                          </label>
                        </>
                      )}
                      {crRange === "all" && (
                        <span className="text-sm text-stone-500">All transactions from the beginning</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
              {crStep === 2 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="space-y-6">
                  <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-5">
                    <h4 className="text-xs font-bold text-stone-600 uppercase tracking-wider flex items-center gap-1.5 mb-4">
                      <Filter size={13} /> Filters (Optional)
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-stone-500 mb-1">Transaction Type</label>
                        <div className="flex flex-wrap gap-1.5">
                          {["credit", "debit"].map((t) => (
                            <button key={t} type="button" onClick={() => toggleCrType(t)}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${crType.includes(t) ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-white text-stone-500 border-stone-200 hover:border-blue-300"}`}>
                              {t === "credit" ? "Credit" : "Debit"}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-stone-400 mt-1">None = all types</p>
                      </div>
                      <div>
                        <label className="block text-xs text-stone-500 mb-1">Payment Mode</label>
                        <div className="flex flex-wrap gap-1.5">
                          {["cash", "digital"].map((m) => (
                            <button key={m} type="button" onClick={() => toggleCrMode(m)}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${crMode.includes(m) ? "bg-purple-100 text-purple-700 border-purple-300" : "bg-white text-stone-500 border-stone-200 hover:border-purple-300"}`}>
                              {m === "cash" ? "Cash" : "Digital"}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-stone-400 mt-1">None = all modes</p>
                      </div>
                    </div>
                    {crCategoriesList.length > 0 && (
                      <div className="mt-4">
                        <label className="block text-xs text-stone-500 mb-1">Categories (leave empty = all)</label>
                        <div className="flex flex-wrap gap-2">
                          {crCategoriesList.map((cat) => (
                            <button key={cat.id} type="button" onClick={() => toggleCrCategory(cat.id)}
                              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${crCategories.includes(cat.id) ? "bg-saffron-100 text-saffron-700 border-saffron-300" : "bg-white text-stone-500 border-stone-200 hover:border-saffron-300"}`}>
                              {cat.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
              {crStep === 3 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-6">
                  <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-5">
                    <h4 className="text-xs font-bold text-stone-600 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                      <FileBarChart size={13} /> Report Format
                    </h4>
                    <div className="flex gap-2">
                      {[{ v: "excel", l: "Excel", color: "text-emerald-600" }, { v: "pdf", l: "PDF", color: "text-rose-600" }, { v: "summary", l: "Summary (JSON)", color: "text-blue-600" }].map((fo) => (
                        <button key={fo.v} type="button" onClick={() => setCrFormat(fo.v)}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${crFormat === fo.v ? "bg-saffron-600 text-white border-saffron-600" : "border-stone-200 text-stone-600 hover:border-saffron-300"}`}>
                          {fo.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-5">
                    <h4 className="text-xs font-bold text-stone-600 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                      <Send size={13} /> Delivery & Recipients
                    </h4>
                    <div className="flex gap-4 mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={crDeliveryEmail} onChange={(e) => setCrDeliveryEmail(e.target.checked)} className="w-4 h-4 rounded border-stone-300 text-saffron-600 focus:ring-saffron-500" />
                        <Mail size={14} className="text-stone-500" />
                        <span className="text-sm text-stone-700">Email</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={crDeliveryTelegram} onChange={(e) => setCrDeliveryTelegram(e.target.checked)} className="w-4 h-4 rounded border-stone-300 text-saffron-600 focus:ring-saffron-500" />
                        <MessageSquare size={14} className="text-stone-500" />
                        <span className="text-sm text-stone-700">Telegram</span>
                      </label>
                    </div>
                    <div className="mb-4">
                      <label className="block text-xs text-stone-500 mb-1">Recipients</label>
                      <select value={crRecipientMode} onChange={(e) => setCrRecipientMode(e.target.value)} className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-saffron-400 transition-colors">
                        <option value="subscribed">All Subscribed Contacts</option>
                        <option value="selected">Select Specific Contacts</option>
                        <option value="groups">By Contact Group</option>
                      </select>
                    </div>
                    {crRecipientMode === "selected" && crContacts.length > 0 && (
                      <div className="max-h-48 overflow-y-auto border-2 border-stone-200 rounded-xl">
                        <table className="w-full text-xs">
                          <thead className="bg-stone-50 sticky top-0">
                            <tr>
                              <th className="px-2 py-1.5 text-left font-semibold text-stone-500 w-8"></th>
                              <th className="px-2 py-1.5 text-left font-semibold text-stone-500">Name</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-stone-500">Email</th>
                            </tr>
                          </thead>
                          <tbody>
                            {crContacts.filter((c) => c.enabled).map((c) => (
                              <tr key={c.id} className="hover:bg-white cursor-pointer border-t border-stone-100" onClick={() => toggleCrContact(c.id)}>
                                <td className="px-2 py-1.5">
                                  <input type="checkbox" readOnly checked={crRecipientContactIds.includes(c.id)} className="w-3.5 h-3.5 rounded border-stone-300 text-saffron-600 focus:ring-saffron-500" />
                                </td>
                                <td className="px-2 py-1.5 font-medium text-stone-700">{c.name}</td>
                                <td className="px-2 py-1.5 text-stone-500">{c.email || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {crRecipientMode === "groups" && crGroups.length > 0 && (
                      <div>
                        <label className="block text-xs text-stone-500 mb-1">Select Groups</label>
                        <div className="flex flex-wrap gap-2">
                          {crGroups.map((g) => (
                            <button key={g.id} type="button" onClick={() => toggleCrGroup(g.id)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${crRecipientGroupIds.includes(g.id) ? "bg-indigo-100 text-indigo-700 border-indigo-300" : "bg-white text-stone-500 border-stone-200 hover:border-indigo-300"}`}>
                              <Users size={12} />
                              {g.name}
                              <span className="text-stone-400">({g.member_count || 0})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
              {crStep === 4 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  {crPreview ? (
                    <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-xs font-bold text-stone-600 uppercase">Preview — {crPreview.start} to {crPreview.end}</h4>
                        <button onClick={() => setCrPreview(null)} className="text-stone-400 hover:text-stone-600">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white rounded-xl p-3 border border-stone-200/80">
                          <p className="text-[10px] text-stone-400 font-medium">Transactions</p>
                          <p className="text-lg font-bold text-stone-800">{crPreview.txn_count}</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-stone-200/80">
                          <p className="text-[10px] text-stone-400 font-medium">Income</p>
                          <p className="text-lg font-bold text-emerald-600">{fmt(crPreview.overview.total_credit)}</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-stone-200/80">
                          <p className="text-[10px] text-stone-400 font-medium">Expenses</p>
                          <p className="text-lg font-bold text-rose-600">{fmt(crPreview.overview.total_debit)}</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-stone-200/80">
                          <p className="text-[10px] text-stone-400 font-medium">Net</p>
                          <p className="text-lg font-bold text-stone-800">{fmt(crPreview.overview.net_balance)}</p>
                        </div>
                      </div>
                      {crPreview.category_breakdown && crPreview.category_breakdown.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs font-semibold text-stone-600 mb-2">Top Categories</p>
                          <div className="flex flex-wrap gap-2">
                            {crPreview.category_breakdown.slice(0, 5).map((cat, i) => (
                              <span key={i} className="inline-flex items-center gap-1.5 text-xs text-stone-600">
                                <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                                {cat.name}: {fmt(cat.value)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-12 text-center text-stone-400">
                      <Eye size={40} className="mx-auto mb-3 opacity-40" />
                      <p className="font-medium">No preview yet</p>
                      <p className="text-sm mt-1">Click Preview in the footer to see a summary before generating.</p>
                    </div>
                  )}
                </motion.div>
              )}
            </div>

            {/* Footer Navigation */}
            <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/50 flex items-center justify-end gap-2">
              {crStep > 1 && (
                <motion.button whileTap={{ scale: 0.97 }} onClick={prevStep}
                  className="px-4 py-2 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors">
                  Back
                </motion.button>
              )}
              {crStep < 4 && (
                <motion.button whileTap={{ scale: 0.97 }} onClick={nextStep}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold shadow-lg shadow-saffron-500/20 hover:shadow-xl transition-all">
                  Next
                  <ChevronRight size={14} />
                </motion.button>
              )}
              {crStep === 4 && (
                <motion.button whileTap={{ scale: 0.97 }} onClick={handlePreview} disabled={crGenerating}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50">
                  <Eye size={14} /> {crGenerating ? <Loader2 size={14} className="animate-spin" /> : "Preview"}
                </motion.button>
              )}
              {crStep === 4 && (
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleGenerateDownload} disabled={crGenerating}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold shadow-lg shadow-saffron-500/20 hover:shadow-xl transition-all disabled:opacity-50">
                  {crGenerating ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Generate & Download
                </motion.button>
              )}
              {crStep === 4 && (
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleSaveAsScheduled} disabled={crGenerating}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-100 text-stone-700 text-sm font-semibold hover:bg-stone-200 transition-all disabled:opacity-50">
                  <CalendarClock size={14} /> Save as Scheduled
                </motion.button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}


