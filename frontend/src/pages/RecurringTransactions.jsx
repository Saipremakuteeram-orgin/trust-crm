import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import { Plus, X, Trash2, Pencil, Play, Pause, PlayCircle, RefreshCw, Repeat } from "lucide-react";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const emptyForm = {
  name: "", type: "debit", mode: "digital", digital_method: "upi", amount: "",
  category_id: "", party: "", description: "", reference_no: "",
  frequency: "monthly", schedule_day: 1, schedule_hour: 8, schedule_minute: 0,
  start_date: new Date().toISOString().slice(0, 10), end_date: "", max_occurrences: "",
  notify_contact_ids: [],
};

function frequencyLabel(freq, day) {
  switch (freq) {
    case "daily": return "Daily";
    case "weekly": return `Weekly (${DAY_NAMES[day] || ""})`;
    case "biweekly": return `Biweekly (${DAY_NAMES[day] || ""})`;
    case "monthly": return `Monthly (day ${day})`;
    case "quarterly": return `Quarterly (day ${day})`;
    case "yearly": return `Yearly (day ${day})`;
    default: return freq;
  }
}

function formatNextRun(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function RecurringTransactions() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const canDelete = profile?.role === "admin";

  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterFreq, setFilterFreq] = useState("all");
  const [form, setForm] = useState({ ...emptyForm });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get("/recurring-transactions"),
      api.get("/contacts"),
      api.get("/groups"),
      api.get("/categories"),
    ]).then(([rt, con, grp, cat]) => {
      setTemplates(rt.data.result || []);
      setContacts(con.data.result || []);
      setGroups(grp.data.result || []);
      setCategories(cat.data.result || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  function handleRefresh() { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 600); }

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (search && !(t.name || "").toLowerCase().includes(search.toLowerCase()) && !(t.party || "").toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType !== "all" && t.type !== filterType) return false;
      if (filterFreq !== "all" && t.frequency !== filterFreq) return false;
      return true;
    });
  }, [templates, search, filterType, filterFreq]);

  const stats = useMemo(() => {
    let credit = 0, debit = 0, active = 0;
    for (const t of templates) {
      if (!t.enabled) continue;
      active++;
      const a = Number(t.amount);
      switch (t.frequency) {
        case "daily": a * 30; break;
        case "weekly": a * 4.33; break;
        case "biweekly": a * 2.17; break;
        case "monthly": break;
        case "quarterly": a / 3; break;
        case "yearly": a / 12; break;
      }
      const monthly = t.frequency === "daily" ? a * 30
        : t.frequency === "weekly" ? a * 4.33
        : t.frequency === "biweekly" ? a * 2.17
        : t.frequency === "quarterly" ? a / 3
        : t.frequency === "yearly" ? a / 12
        : a;
      if (t.type === "credit") credit += monthly; else debit += monthly;
    }
    return { credit: Math.round(credit), debit: Math.round(debit), active };
  }, [templates]);

  function openCreate() { setEditing(null); setForm({ ...emptyForm }); setOpen(true); }
  function openEdit(t) {
    setEditing(t);
    setForm({
      name: t.name || "", type: t.type || "debit", mode: t.mode || "digital",
      digital_method: t.digital_method || "upi", amount: t.amount || "",
      category_id: t.category_id || "", party: t.party || "", description: t.description || "",
      reference_no: t.reference_no || "", frequency: t.frequency || "monthly",
      schedule_day: t.schedule_day ?? 1, schedule_hour: t.schedule_hour ?? 8,
      schedule_minute: t.schedule_minute ?? 0,
      start_date: t.start_date || new Date().toISOString().slice(0, 10),
      end_date: t.end_date || "", max_occurrences: t.max_occurrences || "",
      notify_contact_ids: t.notify_contact_ids || [],
    });
    setOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        amount: Number(form.amount),
        schedule_day: form.frequency === "daily" ? null : Number(form.schedule_day),
        schedule_hour: Number(form.schedule_hour),
        schedule_minute: Number(form.schedule_minute),
        end_date: form.end_date || null,
        max_occurrences: form.max_occurrences ? Number(form.max_occurrences) : null,
      };
      if (payload.mode !== "digital") delete payload.digital_method;
      if (editing) {
        await api.patch("/recurring-transactions/" + editing.id, payload);
        addToast("Recurring transaction updated", "success");
      } else {
        await api.post("/recurring-transactions", payload);
        addToast("Recurring transaction created", "success");
      }
      setOpen(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save", "error");
    }
    setSaving(false);
  }

  async function handleToggle(t) {
    try {
      await api.patch("/recurring-transactions/" + t.id + "/toggle");
      addToast(`Template ${t.enabled ? "paused" : "resumed"}`, "success");
      load();
    } catch (err) { addToast("Failed to toggle", "error"); }
  }

  async function handleRunNow(t) {
    try {
      await api.post("/recurring-transactions/" + t.id + "/run-now");
      addToast(`Transaction generated for "${t.name}"`, "success");
      load();
    } catch (err) { addToast("Failed to generate", "error"); }
  }

  async function handleDelete(id) {
    try {
      await api.delete("/recurring-transactions/" + id);
      addToast("Template deleted", "success");
      load();
    } catch (err) { addToast("Failed to delete", "error"); }
  }

  function toggleContact(id) {
    setForm((f) => ({
      ...f,
      notify_contact_ids: f.notify_contact_ids.includes(id)
        ? f.notify_contact_ids.filter((x) => x !== id)
        : [...f.notify_contact_ids, id],
    }));
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Recurring Transactions</h1>
          <p className="text-sm text-stone-500 mt-1">Manage periodic payments and income schedules</p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleRefresh}
            className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 transition-colors">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </motion.button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold shadow-lg shadow-saffron-500/20 hover:shadow-xl transition-all">
            <Plus size={15} /> Add Recurring
          </motion.button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Active Templates", value: stats.active, color: "#6366f1" },
          { label: "Monthly Credit (In)", value: fmt(stats.credit), color: "#10b981" },
          { label: "Monthly Debit (Out)", value: fmt(stats.debit), color: "#f43f5e" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-sm">
            <p className="text-xs text-stone-400 font-medium">{s.label}</p>
            <p className="text-xl font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <input placeholder="Search templates..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full border-2 border-stone-200 rounded-xl px-4 py-2 pl-10 text-sm focus:border-saffron-400 transition-colors" />
          <Repeat size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        </div>
        <div className="flex gap-1.5">
          {[{ v: "all", l: "All" }, { v: "credit", l: "Credit" }, { v: "debit", l: "Debit" }].map(({ v, l }) => (
            <button key={v} onClick={() => setFilterType(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filterType === v ? "bg-saffron-500 text-white shadow-sm" : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {[{ v: "all", l: "All Freq" }, { v: "daily", l: "Daily" }, { v: "weekly", l: "Weekly" }, { v: "monthly", l: "Monthly" }, { v: "quarterly", l: "Quarterly" }, { v: "yearly", l: "Yearly" }].map(({ v, l }) => (
            <button key={v} onClick={() => setFilterFreq(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filterFreq === v ? "bg-royal-500 text-white shadow-sm" : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-stone-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-stone-400">
            <Repeat size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No recurring transactions found</p>
            <p className="text-sm mt-1">Create your first recurring payment or income schedule</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-r from-stone-50 to-stone-100/80 text-stone-500 text-left">
                <tr>
                  <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Type</th>
                  <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Amount</th>
                  <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Frequency</th>
                  <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Next Run</th>
                  <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Generated</th>
                  <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Status</th>
                  {(canDelete) && <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => (
                  <motion.tr key={t.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }} className="border-t border-stone-100 table-row-animate">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-stone-800">{t.name}</div>
                      {t.party && <div className="text-xs text-stone-400">{t.party}</div>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        t.type === "credit" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                      }`}>{t.type === "credit" ? "Credit" : "Debit"}</span>
                    </td>
                    <td className={`px-5 py-3.5 font-bold ${t.type === "credit" ? "text-emerald-700" : "text-rose-700"}`}>
                      {fmt(t.amount)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-royal-50 text-royal-700 ring-1 ring-royal-200">
                        {frequencyLabel(t.frequency, t.schedule_day)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-stone-600 text-xs">
                      {t.enabled ? formatNextRun(t.next_run_at) : <span className="text-stone-400">Paused</span>}
                    </td>
                    <td className="px-5 py-3.5 text-stone-600 text-xs">
                      {t.occurrence_count}{t.max_occurrences ? ` / ${t.max_occurrences}` : ""}
                    </td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => handleToggle(t)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-all hover:scale-105 ${
                          t.enabled ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-stone-100 text-stone-500 ring-1 ring-stone-200"
                        }`}>
                        {t.enabled ? "Active" : "Paused"}
                      </button>
                    </td>
                    {canDelete && (
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                            onClick={() => openEdit(t)}
                            className="text-stone-300 hover:text-royal-600 transition-all p-1.5 rounded-lg hover:bg-royal-50" title="Edit">
                            <Pencil size={15} />
                          </motion.button>
                          <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                            onClick={() => handleRunNow(t)}
                            className="text-stone-300 hover:text-emerald-600 transition-all p-1.5 rounded-lg hover:bg-emerald-50" title="Run Now">
                            <Play size={15} />
                          </motion.button>
                          <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                            onClick={() => handleDelete(t.id)}
                            className="text-stone-300 hover:text-rose-600 transition-all p-1.5 rounded-lg hover:bg-rose-50" title="Delete">
                            <Trash2 size={15} />
                          </motion.button>
                        </div>
                      </td>
                    )}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl shadow-black/20 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold text-stone-900">{editing ? "Edit Recurring Transaction" : "Add Recurring Transaction"}</h2>
                <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                  onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input required placeholder="Name (e.g. Monthly rent to landlord)" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />

                <div className="flex gap-2">
                  <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => setForm({ ...form, type: "credit" })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${form.type === "credit" ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-500/25" : "border-stone-200 text-stone-600 hover:border-emerald-300"}`}>Credit (In)</motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => setForm({ ...form, type: "debit" })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${form.type === "debit" ? "bg-rose-600 text-white border-rose-600 shadow-lg shadow-rose-500/25" : "border-stone-200 text-stone-600 hover:border-rose-300"}`}>Debit (Out)</motion.button>
                </div>

                <input required type="number" placeholder="Amount" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />

                <div className="flex gap-2">
                  <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => setForm({ ...form, mode: "cash" })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${form.mode === "cash" ? "bg-saffron-600 text-white border-saffron-600 shadow-lg shadow-saffron-500/25" : "border-stone-200 text-stone-600 hover:border-saffron-300"}`}>Cash</motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => setForm({ ...form, mode: "digital" })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${form.mode === "digital" ? "bg-royal-600 text-white border-royal-600 shadow-lg shadow-royal-500/25" : "border-stone-200 text-stone-600 hover:border-royal-300"}`}>Digital</motion.button>
                </div>

                {form.mode === "digital" && (
                  <select value={form.digital_method} onChange={(e) => setForm({ ...form, digital_method: e.target.value })}
                    className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="card">Card</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                )}

                <input placeholder="Party (donor / vendor name)" value={form.party}
                  onChange={(e) => setForm({ ...form, party: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />

                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                  <option value="">Select Category (optional)</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                <input placeholder="Description (optional)" value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />

                <input placeholder="Reference No (optional)" value={form.reference_no}
                  onChange={(e) => setForm({ ...form, reference_no: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />

                {/* Schedule */}
                <div className="border-t border-stone-100 pt-4">
                  <p className="text-sm font-bold text-stone-700 mb-3">Schedule</p>
                  <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                    className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors mb-3">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>

                  {form.frequency !== "daily" && (
                    <div className="mb-3">
                      <label className="text-xs font-semibold text-stone-500 mb-1 block">
                        {["weekly", "biweekly"].includes(form.frequency) ? "Day of Week" : "Day of Month"}
                      </label>
                      {["weekly", "biweekly"].includes(form.frequency) ? (
                        <select value={form.schedule_day} onChange={(e) => setForm({ ...form, schedule_day: e.target.value })}
                          className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                            <option key={d} value={d}>{DAY_NAMES[d]}</option>
                          ))}
                        </select>
                      ) : (
                        <input type="number" min={1} max={31} value={form.schedule_day}
                          onChange={(e) => setForm({ ...form, schedule_day: e.target.value })}
                          className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 mb-3">
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-stone-500 mb-1 block">Hour (0-23)</label>
                      <input type="number" min={0} max={23} value={form.schedule_hour}
                        onChange={(e) => setForm({ ...form, schedule_hour: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-stone-500 mb-1 block">Minute</label>
                      <input type="number" min={0} max={59} value={form.schedule_minute}
                        onChange={(e) => setForm({ ...form, schedule_minute: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-stone-500 mb-1 block">Start Date</label>
                      <input required type="date" value={form.start_date}
                        onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-stone-500 mb-1 block">End Date (optional)</label>
                      <input type="date" value={form.end_date}
                        onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="text-xs font-semibold text-stone-500 mb-1 block">Max Occurrences (optional)</label>
                    <input type="number" min={1} placeholder="Unlimited" value={form.max_occurrences}
                      onChange={(e) => setForm({ ...form, max_occurrences: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                </div>

                {/* Notify */}
                <div>
                  <div className="text-sm font-semibold text-stone-700 mb-2">Notify (email + Telegram)</div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto border-2 border-stone-200 rounded-xl p-3">
                    {contacts.length === 0 && <p className="text-xs text-stone-400">No contacts yet</p>}
                    {contacts.map((c) => (
                      <label key={c.id} className="flex items-center gap-2.5 text-sm text-stone-700 cursor-pointer group">
                        <input type="checkbox" checked={form.notify_contact_ids.includes(c.id)}
                          onChange={() => toggleContact(c.id)} className="rounded border-stone-300 text-saffron-600 focus:ring-saffron-500" />
                        <span className="group-hover:text-stone-900 transition-colors">{c.name}</span>
                      </label>
                    ))}
                  </div>
                  {form.notify_contact_ids.length > 0 && (
                    <p className="text-xs text-stone-400 mt-1.5">{form.notify_contact_ids.length} contact(s) will be notified</p>
                  )}
                </div>

                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={saving}
                  className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                  {saving ? "Saving..." : editing ? "Update Recurring" : "Create Recurring"}
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
