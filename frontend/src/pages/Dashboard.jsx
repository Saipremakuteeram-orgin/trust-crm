import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import TransactionListModal from "../components/TransactionListModal";
import { Wallet, Landmark, TrendingUp, TrendingDown, Activity, Users, Pencil, Check, X, RefreshCw, Download, Repeat } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import { useNavigate } from "react-router-dom";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
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
  if (!active || !payload?.length) return null;
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
    api.get("/analytics").then((res) => setAnalytics(res.data.result)).catch(() => setAnalyticsError(true));
    api.get("/dashboard/recurring-commitment").then((res) => setRecurring(res.data.result)).catch(() => {});
  }, []);

  function handleRefresh() {
    setRefreshing(true);
    loadSummary();
    api.get("/analytics").then((res) => setAnalytics(res.data.result)).catch(() => {});
    api.get("/dashboard/recurring-commitment").then((res) => setRecurring(res.data.result)).catch(() => {});
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

  if (!summary) return (
    <AppLayout>
      <div className="space-y-6">
        <div className="skeleton h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="skeleton h-72 rounded-2xl" />
          <div className="skeleton h-72 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="skeleton h-72 rounded-2xl" />
          <div className="skeleton h-72 rounded-2xl" />
          <div className="skeleton h-72 rounded-2xl" />
        </div>
      </div>
    </AppLayout>
  );
  const { cash, digital } = summary;
  const ov = analytics?.overview || {};

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <motion.h1 initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="text-3xl font-bold text-stone-900 tracking-tight">
          Dashboard
        </motion.h1>
        {canAdd && (
          <div className="flex items-center gap-2">
            {isAdmin && (
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleBackupNow} disabled={backingUp}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold shadow-lg shadow-saffron-500/20 hover:shadow-xl transition-all disabled:opacity-50">
                <Download size={14} className={backingUp ? "animate-bounce" : ""} />
                {backingUp ? "Backing up..." : "Backup Now"}
              </motion.button>
            )}
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleRefresh}
              className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 transition-colors">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </motion.button>
          </div>
        )}
      </div>

      {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-8">
            <StatCard icon={Wallet} label="Cash in Hand" value={fmt(cash?.cash_in_hand)} color="#10b981" delay={0}
              onClick={() => openTxnModal("cash", "Cash Transactions", "All cash-mode transactions")} />
            <StatCard icon={Landmark} label="Digital Balance" value={fmt(digital?.digital_balance)} color="#6366f1" delay={1}
              onClick={() => openTxnModal("digital", "Digital Transactions", "All digital-mode transactions")} />
            <StatCard icon={TrendingUp} label="Total Income" value={fmtShort(ov.total_credit)} sub={`${ov.txn_count || 0} transactions`} color="#059669" delay={2}
              onClick={() => openTxnModal("credit", "Income Transactions", "All credit (in) transactions")} />
            <StatCard icon={TrendingDown} label="Total Expenses" value={fmtShort(ov.total_debit)} sub={`Net: ${fmtShort(ov.net_balance)}`} color="#e11d48" delay={3}
              onClick={() => openTxnModal("debit", "Expense Transactions", "All debit (out) transactions")} />
            <StatCard icon={Repeat} label="Monthly Recurring" value={recurring ? fmtShort(recurring.net) : "—"} sub={`${recurring?.active_count || 0} active templates`} color="#8b5cf6" delay={4}
              onClick={() => navigate("/recurring")} />
          </div>

      {/* Cash Flow + Digital Flow Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible"
          className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm hover-lift">
          <h2 className="text-sm font-semibold text-stone-700 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Cash Flow
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-stone-500">Opening balance</span>
              {editing === "cash" ? (
                <div className="flex items-center gap-1.5">
                  <input type="number" value={editVal} onChange={(e) => setEditVal(e.target.value)}
                    className="w-28 text-right text-sm font-medium border border-stone-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-saffron-400" autoFocus />
                  <button onClick={() => saveBalance("cash")} className="p-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditing(null)} className="p-1 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-stone-800">{fmt(cash?.opening_balance)}</span>
                  {isAdmin && (
                    <button onClick={() => { setEditing("cash"); setEditVal(cash?.opening_balance || 0); }}
                      className="p-1 rounded-lg text-stone-400 hover:text-saffron-600 hover:bg-saffron-50 transition-colors">
                      <Pencil size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
            {[
              { label: "Cash in", value: `+${fmt(cash?.cash_in)}`, colorClass: "text-emerald-600 font-medium" },
              { label: "Cash out", value: `-${fmt(cash?.cash_out)}`, colorClass: "text-rose-600 font-medium" },
              { label: "Cash in hand", value: fmt(cash?.cash_in_hand), bold: true },
            ].map((item, i) => (
              <div key={i} className={`flex justify-between items-center text-sm ${item.bold ? 'font-semibold border-t border-stone-100 pt-3' : ''}`}>
                <span className="text-stone-500">{item.label}</span>
                <span className={item.colorClass || "text-stone-800"}>{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
        <motion.div custom={5} variants={cardVariants} initial="hidden" animate="visible"
          className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm hover-lift">
          <h2 className="text-sm font-semibold text-stone-700 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-royal-500" />
            Digital Flow
          </h2>
          <div className="space-y-3">
            {[
              { label: "Digital in", value: `+${fmt(digital?.digital_in)}`, colorClass: "text-emerald-600 font-medium" },
              { label: "Digital out", value: `-${fmt(digital?.digital_out)}`, colorClass: "text-rose-600 font-medium" },
            ].map((item, i) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <span className="text-stone-500">{item.label}</span>
                <span className={item.colorClass || "text-stone-800"}>{item.value}</span>
              </div>
            ))}
            <div className="flex justify-between items-center text-sm font-semibold border-t border-stone-100 pt-3">
              <span className="text-stone-500">Balance</span>
              {editing === "digital" ? (
                <div className="flex items-center gap-1.5">
                  <input type="number" value={editVal} onChange={(e) => setEditVal(e.target.value)}
                    className="w-28 text-right text-sm font-medium border border-stone-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-saffron-400" autoFocus />
                  <button onClick={() => saveBalance("digital")} className="p-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditing(null)} className="p-1 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-stone-800">{fmt(digital?.digital_balance)}</span>
                  {isAdmin && (
                    <button onClick={() => { setEditing("digital"); setEditVal(digital?.digital_balance || 0); }}
                      className="p-1 rounded-lg text-stone-400 hover:text-saffron-600 hover:bg-saffron-50 transition-colors">
                      <Pencil size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Charts Section */}
      {analytics && (
        <>
          {/* Monthly Trend (Area Chart) */}
          {analytics.monthly_trend?.length > 0 && (
            <motion.div custom={6} variants={cardVariants} initial="hidden" animate="visible"
              className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm hover-lift mb-8">
              <h2 className="text-sm font-semibold text-stone-700 mb-5 flex items-center gap-2">
                <Activity size={14} className="text-saffron-500" />
                Monthly Income vs Expenses
              </h2>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} tickFormatter={(v) => fmtShort(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area type="monotone" dataKey="credit" name="Income" stroke="#10b981" fill="url(#colorCredit)" strokeWidth={2.5} />
                  <Area type="monotone" dataKey="debit" name="Expenses" stroke="#f43f5e" fill="url(#colorDebit)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {/* Weekly Trend + Pie + Mode */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
            {/* Weekly Bar Chart */}
            {analytics.weekly_trend?.length > 0 && (
              <motion.div custom={7} variants={cardVariants} initial="hidden" animate="visible"
                className="lg:col-span-2 bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm hover-lift">
                <h2 className="text-sm font-semibold text-stone-700 mb-5 flex items-center gap-2">
                  <TrendingUp size={14} className="text-royal-500" />
                  Last 7 Days Activity
                </h2>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={analytics.weekly_trend} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => fmtShort(v)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="credit" name="Income" fill="#10b981" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="debit" name="Expenses" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            )}

            {/* Category Pie Chart */}
            {analytics.category_breakdown?.length > 0 && (
              <motion.div custom={8} variants={cardVariants} initial="hidden" animate="visible"
                className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm hover-lift">
                <h2 className="text-sm font-semibold text-stone-700 mb-5 flex items-center gap-2">
                  <Users size={14} className="text-saffron-500" />
                  Expense Categories
                </h2>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={analytics.category_breakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                      paddingAngle={3} dataKey="value" nameKey="name">
                      {analytics.category_breakdown.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => fmt(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 mt-2">
                  {analytics.category_breakdown.slice(0, 5).map((cat, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 text-xs text-stone-600">
                      <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      {cat.name}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* Payment Mode + Top Parties */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
            {/* Payment Mode Bar */}
            {analytics.payment_mode_split && (
              <motion.div custom={9} variants={cardVariants} initial="hidden" animate="visible"
                className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm hover-lift">
                <h2 className="text-sm font-semibold text-stone-700 mb-5">Payment Mode Breakdown</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={[
                    { name: "Cash", credit: analytics.payment_mode_split.cash?.credit || 0, debit: analytics.payment_mode_split.cash?.debit || 0 },
                    { name: "Digital", credit: analytics.payment_mode_split.digital?.credit || 0, debit: analytics.payment_mode_split.digital?.debit || 0 },
                  ]} layout="vertical" barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => fmtShort(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} width={60} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="credit" name="Income" fill="#10b981" radius={[0, 6, 6, 0]} />
                    <Bar dataKey="debit" name="Expenses" fill="#f43f5e" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            )}

            {/* Top Parties */}
            {analytics.top_parties?.length > 0 && (
              <motion.div custom={10} variants={cardVariants} initial="hidden" animate="visible"
                className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm hover-lift">
                <h2 className="text-sm font-semibold text-stone-700 mb-5">Top Parties by Volume</h2>
                <div className="space-y-3">
                  {analytics.top_parties.slice(0, 6).map((party, i) => {
                    const maxAmt = analytics.top_parties[0]?.amount || 1;
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
          </div>

          {/* Daily Averages + Net Balance Radar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
            {/* Daily Average */}
            <motion.div custom={11} variants={cardVariants} initial="hidden" animate="visible"
              className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm hover-lift">
              <h2 className="text-sm font-semibold text-stone-700 mb-5">Daily Averages</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-emerald-50 rounded-xl">
                  <div className="text-xs text-emerald-600 font-medium mb-1">Avg Daily Income</div>
                  <div className="text-xl font-bold text-emerald-700">{fmt(analytics.daily_avg?.credit)}</div>
                </div>
                <div className="text-center p-4 bg-rose-50 rounded-xl">
                  <div className="text-xs text-rose-600 font-medium mb-1">Avg Daily Expense</div>
                  <div className="text-xl font-bold text-rose-700">{fmt(analytics.daily_avg?.debit)}</div>
                </div>
              </div>
            </motion.div>

            {/* Net Balance Radar */}
            <motion.div custom={12} variants={cardVariants} initial="hidden" animate="visible"
              className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm hover-lift">
              <h2 className="text-sm font-semibold text-stone-700 mb-5">Financial Overview</h2>
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
                  <Radar name="Overview" dataKey="value" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.25} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>
        </>
      )}

      {analyticsError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center mb-8">
          <p className="text-sm text-amber-700 font-medium">Analytics charts could not be loaded. Please try again later.</p>
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
