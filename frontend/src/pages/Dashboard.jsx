import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import TransactionListModal from "../components/TransactionListModal";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import Surface from "../components/ui/Surface";
import { Reveal, AnimatedNumber } from "../components/ui/motion";
import { pressable } from "../components/ui/tokens";
import {
  Wallet, Landmark, TrendingUp, TrendingDown, Users, Pencil, Check, X,
  RefreshCw, Download, Repeat, Activity,
} from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import { useNavigate } from "react-router-dom";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
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

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-stone-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
      <p className="mb-1 text-xs font-semibold text-stone-500 dark:text-stone-400">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-bold" style={{ color: p.color }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState(false);
  const { profile } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const isAdmin = profile?.role === "admin";
  const canAdd = isAdmin || profile?.role === "accountant";
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [modal, setModal] = useState({ open: false, title: "", subtitle: "", transactions: null, loading: false });
  const [recurring, setRecurring] = useState(null);

  function loadSummary() {
    api.get("/dashboard/summary").then((res) => setSummary(res.data.result));
  }

  useEffect(() => {
    loadSummary();
    Promise.all([
      api.get("/analytics").then((res) => setAnalytics(res.data.result)).catch(() => setAnalyticsError(true)),
      api.get("/dashboard/recurring-commitment").then((res) => setRecurring(res.data.result)).catch(() => {}),
    ]);
  }, []);

  function handleRefresh() {
    setRefreshing(true);
    loadSummary();
    Promise.all([
      api.get("/analytics").then((res) => setAnalytics(res.data.result)).catch(() => {}),
      api.get("/dashboard/recurring-commitment").then((res) => setRecurring(res.data.result)).catch(() => {}),
    ]);
    setTimeout(() => setRefreshing(false), 600);
  }

  function openTxnModal(filterMode, title, subtitle) {
    setModal({ open: true, title, subtitle, transactions: null, loading: true });
    api.get("/transactions")
      .then((res) => {
        const all = res.data.result || [];
        let filtered = all;
        if (filterMode === "cash" || filterMode === "digital") {
          filtered = all.filter((t) => t.mode === filterMode);
        } else if (filterMode === "credit" || filterMode === "debit") {
          filtered = all.filter((t) => t.type === filterMode);
        }
        setModal((m) => ({ ...m, transactions: filtered, loading: false }));
      })
      .catch(() => setModal((m) => ({ ...m, transactions: [], loading: false })));
  }

  async function handleBackupNow() {
    setBackingUp(true);
    try {
      const res = await api.post("/backup/run-now");
      const r = res.data.result;
      addToast(`Backup sent: ${r.fileName} (${r.totalRows} rows)`, "success");
    } catch (err) {
      addToast(err.response?.data?.message || "Backup failed", "error");
    }
    setBackingUp(false);
  }

  async function saveBalance(type) {
    const num = parseFloat(editVal);
    if (isNaN(num) || num < 0) {
      addToast("Enter a valid non-negative amount", "error");
      return;
    }
    try {
      await api.patch("/dashboard/opening-balance", { type, amount: num });
      addToast(`${type === "cash" ? "Cash" : "Digital"} opening balance updated`, "success");
      setEditing(null);
      loadSummary();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to update", "error");
    }
  }

  if (!summary) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-9 w-56" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}
          </div>
          <div className="skeleton h-40 rounded-2xl" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="skeleton h-72 rounded-2xl" />
            <div className="skeleton h-72 rounded-2xl" />
          </div>
        </div>
      </AppLayout>
    );
  }

  const { cash, digital } = summary;
  const ov = analytics?.overview || {};
  const totalPosition = (Number(cash?.cash_in_hand) || 0) + (Number(digital?.digital_balance) || 0);
  const totalIn = (Number(ov.total_credit) || 0) + 0;
  const incomeShare = totalIn > 0 ? Math.min(100, Math.round(((Number(ov.total_credit) || 0) / (totalIn + (Number(ov.total_debit) || 1))) * 100)) : 0;

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        subtitle={`${profile?.full_name ? `${profile.full_name.split(" ")[0]}, ` : ""}here is the trust's position across cash and digital accounts.`}
        actions={canAdd && (
          <>
            {isAdmin && (
              <motion.button
                {...pressable}
                onClick={handleBackupNow}
                disabled={backingUp}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-saffron-500/25 transition-shadow hover:shadow-xl disabled:opacity-50"
              >
                <Download size={15} className={backingUp ? "animate-bounce" : ""} />
                {backingUp ? "Backing up" : "Backup now"}
              </motion.button>
            )}
            <motion.button
              {...pressable}
              onClick={handleRefresh}
              aria-label="Refresh dashboard"
              className="grid h-[42px] w-[42px] place-items-center rounded-xl border border-stone-200 bg-white text-stone-600 transition-colors hover:text-saffron-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </motion.button>
          </>
        )}
      />

      {/* Position summary */}
      <Reveal className="mb-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-800 p-6 text-white shadow-[0_24px_60px_-32px_rgba(49,46,129,0.9)]">
          <div aria-hidden="true" className="absolute inset-0 bg-mesh-pattern opacity-30" />
          <div aria-hidden="true" className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-saffron-400/20 blur-3xl" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-200/80">Total position</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">
                <AnimatedNumber value={totalPosition} format={fmt} />
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-indigo-200/80">
                <span>Cash {fmt(cash?.cash_in_hand)}</span>
                <span className="h-3 w-px bg-white/20" />
                <span>Digital {fmt(digital?.digital_balance)}</span>
              </div>
            </div>
            <div className="w-full max-w-xs rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-indigo-200/80">
                <span>Income vs expenses</span>
                <span className="text-white">{incomeShare}%</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${incomeShare}%` }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                  className="h-full rounded-full bg-gradient-to-r from-saffron-400 to-saffron-300"
                />
              </div>
              <div className="mt-3 flex justify-between text-xs">
                <span className="text-emerald-300">In {fmtShort(ov.total_credit)}</span>
                <span className="text-rose-300">Out {fmtShort(ov.total_debit)}</span>
              </div>
              <p className="mt-3 text-[11px] text-indigo-200/70">
                Net balance <span className="font-semibold text-white">{fmt(ov.net_balance)}</span>
              </p>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={Wallet} label="Cash in hand" value={cash?.cash_in_hand} format={fmt} animateValue accent="#10b981" index={0}
          onClick={() => openTxnModal("cash", "Cash Transactions", "All cash-mode transactions")} />
        <StatCard icon={Landmark} label="Digital balance" value={digital?.digital_balance} format={fmt} animateValue accent="#6366f1" index={1}
          onClick={() => openTxnModal("digital", "Digital Transactions", "All digital-mode transactions")} />
        <StatCard icon={TrendingUp} label="Total income" value={ov.total_credit} format={fmtShort} animateValue sub={`${ov.txn_count || 0} transactions`} accent="#059669" index={2}
          onClick={() => openTxnModal("credit", "Income Transactions", "All credit (in) transactions")} />
        <StatCard icon={TrendingDown} label="Total expenses" value={ov.total_debit} format={fmtShort} animateValue sub={`Net ${fmtShort(ov.net_balance)}`} accent="#e11d48" index={3}
          onClick={() => openTxnModal("debit", "Expense Transactions", "All debit (out) transactions")} />
        <StatCard icon={Repeat} label="Monthly recurring" value={recurring ? fmtShort(recurring.net) : "—"} sub={`${recurring?.active_count || 0} active templates`} accent="#8b5cf6" index={4}
          onClick={() => navigate("/recurring")} />
      </div>

      {/* Cash + digital ledgers */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Surface title="Cash flow" icon={Wallet}>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-stone-500 dark:text-stone-400">Opening balance</dt>
              {editing === "cash" ? (
                <div className="flex items-center gap-1.5">
                  <input type="number" value={editVal} onChange={(e) => setEditVal(e.target.value)} autoFocus
                    className="w-28 rounded-lg border border-stone-300 bg-white px-2 py-1 text-right text-sm dark:border-stone-700 dark:bg-stone-800" />
                  <button onClick={() => saveBalance("cash")} className="rounded-lg bg-emerald-50 p-1 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10">
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditing(null)} className="rounded-lg bg-stone-100 p-1 text-stone-500 hover:bg-stone-200 dark:bg-stone-800">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <dd className="flex items-center gap-1.5 tabular-nums text-stone-800 dark:text-stone-100">
                  {fmt(cash?.opening_balance)}
                  {isAdmin && (
                    <button onClick={() => { setEditing("cash"); setEditVal(cash?.opening_balance || 0); }} aria-label="Edit cash opening balance"
                      className="rounded-md p-1 text-stone-400 transition-colors hover:bg-saffron-50 hover:text-saffron-600 dark:hover:bg-saffron-500/10">
                      <Pencil size={12} />
                    </button>
                  )}
                </dd>
              )}
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-stone-500 dark:text-stone-400">Cash in</dt>
              <dd className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">+{fmt(cash?.cash_in)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-stone-500 dark:text-stone-400">Cash out</dt>
              <dd className="font-medium tabular-nums text-rose-600 dark:text-rose-400">-{fmt(cash?.cash_out)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-stone-100 pt-3 text-base font-semibold dark:border-stone-800">
              <dt className="text-stone-600 dark:text-stone-300">Cash in hand</dt>
              <dd className="tabular-nums text-stone-900 dark:text-white">{fmt(cash?.cash_in_hand)}</dd>
            </div>
          </dl>
        </Surface>

        <Surface title="Digital flow" icon={Landmark}>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-stone-500 dark:text-stone-400">Digital in</dt>
              <dd className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">+{fmt(digital?.digital_in)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-stone-500 dark:text-stone-400">Digital out</dt>
              <dd className="font-medium tabular-nums text-rose-600 dark:text-rose-400">-{fmt(digital?.digital_out)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-stone-100 pt-3 text-base font-semibold dark:border-stone-800">
              <dt className="text-stone-600 dark:text-stone-300">Balance</dt>
              {editing === "digital" ? (
                <div className="flex items-center gap-1.5">
                  <input type="number" value={editVal} onChange={(e) => setEditVal(e.target.value)} autoFocus
                    className="w-28 rounded-lg border border-stone-300 bg-white px-2 py-1 text-right text-sm dark:border-stone-700 dark:bg-stone-800" />
                  <button onClick={() => saveBalance("digital")} className="rounded-lg bg-emerald-50 p-1 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10">
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditing(null)} className="rounded-lg bg-stone-100 p-1 text-stone-500 hover:bg-stone-200 dark:bg-stone-800">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <dd className="flex items-center gap-1.5 tabular-nums text-stone-900 dark:text-white">
                  {fmt(digital?.digital_balance)}
                  {isAdmin && (
                    <button onClick={() => { setEditing("digital"); setEditVal(digital?.digital_balance || 0); }} aria-label="Edit digital balance"
                      className="rounded-md p-1 text-stone-400 transition-colors hover:bg-saffron-50 hover:text-saffron-600 dark:hover:bg-saffron-500/10">
                      <Pencil size={12} />
                    </button>
                  )}
                </dd>
              )}
            </div>
            <div className="flex items-center justify-between pt-1 text-xs text-stone-400 dark:text-stone-500">
              <dt>Share of total position</dt>
              <dd className="tabular-nums">{totalPosition > 0 ? Math.round(((Number(digital?.digital_balance) || 0) / totalPosition) * 100) : 0}%</dd>
            </div>
          </dl>
        </Surface>
      </div>

      {analytics && (
        <>
          {analytics.monthly_trend?.length > 0 && (
            <Surface title="Monthly income vs expenses" icon={Activity} className="mb-6">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={analytics.monthly_trend}>
                  <defs>
                    <linearGradient id="colorCredit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorDebit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} tickFormatter={(v) => fmtShort(v)} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} />
                  <Area type="monotone" dataKey="credit" name="Income" stroke="#10b981" fill="url(#colorCredit)" strokeWidth={2.5}
                    animationDuration={900} animationEasing="ease-out" />
                  <Area type="monotone" dataKey="debit" name="Expenses" stroke="#f43f5e" fill="url(#colorDebit)" strokeWidth={2.5}
                    animationDuration={900} animationEasing="ease-out" />
                </AreaChart>
              </ResponsiveContainer>
            </Surface>
          )}

          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {analytics.weekly_trend?.length > 0 && (
              <Surface title="Last 7 days activity" icon={TrendingUp} className="lg:col-span-2">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={analytics.weekly_trend} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => fmtShort(v)} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8} />
                    <Bar dataKey="credit" name="Income" fill="#10b981" radius={[6, 6, 0, 0]} animationDuration={800} />
                    <Bar dataKey="debit" name="Expenses" fill="#f43f5e" radius={[6, 6, 0, 0]} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              </Surface>
            )}

            {analytics.category_breakdown?.length > 0 && (
              <Surface title="Expense categories" icon={Users}>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={analytics.category_breakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                      paddingAngle={3} dataKey="value" nameKey="name" animationDuration={900}>
                      {analytics.category_breakdown.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => fmt(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 flex flex-wrap gap-2">
                  {analytics.category_breakdown.slice(0, 5).map((cat, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400">
                      <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      {cat.name}
                    </span>
                  ))}
                </div>
              </Surface>
            )}
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {analytics.payment_mode_split && (
              <Surface title="Payment mode breakdown">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={[
                    { name: "Cash", credit: analytics.payment_mode_split.cash?.credit || 0, debit: analytics.payment_mode_split.cash?.debit || 0 },
                    { name: "Digital", credit: analytics.payment_mode_split.digital?.credit || 0, debit: analytics.payment_mode_split.digital?.debit || 0 },
                  ]} layout="vertical" barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => fmtShort(v)} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} width={60} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8} />
                    <Bar dataKey="credit" name="Income" fill="#10b981" radius={[0, 6, 6, 0]} animationDuration={800} />
                    <Bar dataKey="debit" name="Expenses" fill="#f43f5e" radius={[0, 6, 6, 0]} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              </Surface>
            )}

            {analytics.top_parties?.length > 0 && (
              <Surface title="Top parties by volume">
                <div className="space-y-3">
                  {analytics.top_parties.slice(0, 6).map((party, i) => {
                    const maxAmt = analytics.top_parties[0]?.amount || 1;
                    const pct = (party.amount / maxAmt) * 100;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between gap-3 text-sm">
                          <span className="truncate font-medium text-stone-700 dark:text-stone-200">{party.name}</span>
                          <span className="shrink-0 text-xs tabular-nums text-stone-500 dark:text-stone-400">{fmt(party.amount)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                          <motion.div initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }}
                            transition={{ delay: 0.15 + i * 0.08, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                            className="h-full rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Surface>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Surface title="Daily averages">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-emerald-50 p-4 text-center dark:bg-emerald-500/10">
                  <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Average daily income</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">
                    <AnimatedNumber value={analytics.daily_avg?.credit} format={fmt} />
                  </div>
                </div>
                <div className="rounded-xl bg-rose-50 p-4 text-center dark:bg-rose-500/10">
                  <div className="text-xs font-medium text-rose-700 dark:text-rose-300">Average daily expense</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-rose-800 dark:text-rose-200">
                    <AnimatedNumber value={analytics.daily_avg?.debit} format={fmt} />
                  </div>
                </div>
              </div>
            </Surface>

            <Surface title="Financial overview">
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={[
                  { metric: "Income", value: ov.total_credit || 0 },
                  { metric: "Expenses", value: ov.total_debit || 0 },
                  { metric: "Net", value: Math.max(ov.net_balance || 0, 0) },
                  { metric: "Cash", value: cash?.cash_in_hand || 0 },
                  { metric: "Digital", value: digital?.digital_balance || 0 },
                ]}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <PolarRadiusAxis tick={false} axisLine={false} />
                  <Radar name="Overview" dataKey="value" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.25} strokeWidth={2} animationDuration={900} />
                </RadarChart>
              </ResponsiveContainer>
            </Surface>
          </div>
        </>
      )}

      {analyticsError && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Analytics charts could not be loaded. Please try again later.</p>
        </div>
      )}

      <TransactionListModal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        title={modal.title}
        subtitle={modal.subtitle}
        transactions={modal.transactions}
        loading={modal.loading}
      />
    </AppLayout>
  );
}
