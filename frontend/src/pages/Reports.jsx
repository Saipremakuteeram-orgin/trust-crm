import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import TransactionListModal from "../components/TransactionListModal";
import { FileBarChart, Download, RefreshCw, Calendar, Wallet, Landmark, TrendingUp, TrendingDown } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}
function thisYear() {
  return String(new Date().getUTCFullYear());
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

  useEffect(load, [qs]);

  function openTxnModal(filterMode, title, subtitle) {
    setModal({ open: true, title, subtitle: `${subtitle} · ${data?.label || ""}`, transactions: null, loading: true });
    api.get("/reports/transactions?" + qs)
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

  async function exportExcel() {
    setExporting("excel");
    try {
      const res = await api.post("/reports/export/excel?" + qs, {}, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `report-${range}-${range === "monthly" ? month : range === "yearly" ? year : range === "daily" ? date : "custom"}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(null);
    }
  }

  async function exportPDF() {
    setExporting("pdf");
    try {
      const res = await api.post("/reports/export/pdf?" + qs, {}, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `report-${range}-${range === "monthly" ? month : range === "yearly" ? year : range === "daily" ? date : "custom"}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(null);
    }
  }

  const ov = data?.overview || {};

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Reports</h1>
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
      </motion.div>

      {/* Period selector */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={16} className="text-saffron-500" />
          <span className="text-sm font-semibold text-stone-700">Select Period</span>
          {data?.label && <span className="text-xs text-stone-400">({data.label})</span>}
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { k: "daily", l: "Daily" },
            { k: "monthly", l: "Monthly" },
            { k: "yearly", l: "Yearly" },
            { k: "custom", l: "Custom Range" },
          ].map((o) => (
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
          {/* Stat cards */}
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

          {/* Trend + Category */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
            {data.trend?.length > 0 && (
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

            {data.category_breakdown?.length > 0 && (
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

          {/* Top parties */}
          {data.top_parties?.length > 0 && (
            <motion.div custom={6} variants={cardVariants} initial="hidden" animate="visible"
              className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm hover-lift mb-8">
              <h2 className="text-sm font-semibold text-stone-700 mb-5">Top Parties by Volume</h2>
              <div className="space-y-3">
                {data.top_parties.slice(0, 8).map((party, i) => {
                  const maxAmt = data.top_parties[0]?.amount || 1;
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
    </AppLayout>
  );
}
