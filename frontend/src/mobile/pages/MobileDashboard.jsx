import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Send, Users, MessageCircle, FileText, Receipt, Wallet, TrendingUp, Activity, Sparkles, Repeat } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import KPITile from "../components/KPITile";
import KPISwiper from "../components/KPISwiper";
import QuickAction from "../components/QuickAction";
import QuickActionRow from "../components/QuickActionRow";
import Sparkline from "../components/Sparkline";
import CategoryDonut from "../components/CategoryDonut";
import RecentActivityList from "../components/RecentActivityList";
import SectionHeader from "../components/SectionHeader";
import MobileCard from "../components/MobileCard";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

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

export default function MobileDashboard() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const role = profile?.role || "viewer";
  const canAdd = role === "admin" || role === "accountant";

  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [recurring, setRecurring] = useState(null);
  const [recent, setRecent] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sumRes, anRes, recRes, txnRes] = await Promise.allSettled([
        api.get("/dashboard/summary"),
        api.get("/analytics"),
        api.get("/dashboard/recurring-commitment"),
        api.get("/transactions"),
      ]);
      if (sumRes.status === "fulfilled") setSummary(sumRes.value.data.result);
      if (anRes.status === "fulfilled") setAnalytics(anRes.value.data.result);
      if (recRes.status === "fulfilled") setRecurring(recRes.value.data.result);
      if (txnRes.status === "fulfilled") {
        const all = txnRes.value.data.result || [];
        setRecent(all.slice(0, 6));
      }
    } catch (e) {
      addToast("Failed to load dashboard", "error");
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setTimeout(() => setRefreshing(false), 400);
  };

  const cash = summary?.cash || {};
  const digital = summary?.digital || {};
  const ov = analytics?.overview || {};
  const totalBalance = Number(cash.cash_in_hand || 0) + Number(digital.digital_balance || 0);
  const monthly = (analytics?.monthly_trend || []).slice(-6).map((m) => Number(m.credit || 0) - Number(m.debit || 0));
  const categorySlices = (analytics?.category_breakdown || []).slice(0, 5).map((c, i) => ({ label: c.name, value: c.value, color: COLORS[i % COLORS.length] }));

  return (
    <MobileShell
      title={`Hi${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
      subtitle={summary ? `Balance ${fmt(totalBalance)}` : "Loading…"}
      rightAction={
        <button
          aria-label="Refresh"
          onClick={handleRefresh}
          className="m-tap w-10 h-10 rounded-xl flex items-center justify-center active:bg-stone-100 text-stone-600"
        >
          <motion.span animate={refreshing ? { rotate: 360 } : { rotate: 0 }} transition={{ duration: 0.6, repeat: refreshing ? Infinity : 0, ease: "linear" }}>
            <Activity size={18} />
          </motion.span>
        </button>
      }
    >
      <KPISwiper>
        <KPITile label="Total balance" value={fmtShort(totalBalance)} sub="Cash + Digital" tone="balance" icon={<Wallet size={14} />} />
        <KPITile label="Cash in hand" value={fmtShort(cash.cash_in_hand)} sub={cash.cash_in ? `In ${fmtShort(cash.cash_in)}` : ""} tone="credit" icon={<TrendingUp size={14} />} />
        <KPITile label="Digital" value={fmtShort(digital.digital_balance)} sub={digital.digital_in ? `In ${fmtShort(digital.digital_in)}` : ""} tone="net" icon={<Activity size={14} />} />
        <KPITile label="Income" value={fmtShort(ov.total_credit)} sub={`${ov.txn_count || 0} txns`} tone="credit" />
        <KPITile label="Expenses" value={fmtShort(ov.total_debit)} sub={`Net ${fmtShort(ov.net_balance)}`} tone="debit" />
        {recurring && (
          <KPITile label="Recurring" value={fmtShort(recurring.net)} sub={`${recurring.active_count || 0} active`} tone="default" icon={<Repeat size={14} />} />
        )}
      </KPISwiper>

      <SectionHeader title="Quick actions" />
      <QuickActionRow>
        {canAdd && (
          <QuickAction to="/m/transactions?new=1" label="New transaction" icon={Plus} tone="saffron" />
        )}
        {canAdd && (
          <QuickAction to="/m/contacts?new=1" label="Add contact" icon={Users} tone="royal" />
        )}
        <QuickAction to="/m/file-send" label="Send file" icon={Send} tone="emerald" />
        {(role === "admin" || role === "accountant") && (
          <QuickAction to="/m/whatsapp" label="WhatsApp" icon={MessageCircle} tone="emerald" />
        )}
        {(role === "admin" || role === "accountant") && (
          <QuickAction to="/m/receipts" label="New receipt" icon={Receipt} tone="saffron" />
        )}
        {(role === "admin" || role === "accountant") && (
          <QuickAction to="/m/reports" label="Reports" icon={FileText} tone="royal" />
        )}
      </QuickActionRow>

      <SectionHeader title="This month" />
      <div className="px-4">
        <MobileCard>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-stone-500">Net cash flow</div>
            <Sparkles size={14} className="text-saffron-500" />
          </div>
          <Sparkline values={monthly.length ? monthly : [0]} color="#f59e0b" height={64} />
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500">Income</div>
              <div className="text-sm font-bold text-emerald-600">{fmtShort(ov.total_credit)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500">Expenses</div>
              <div className="text-sm font-bold text-rose-600">{fmtShort(ov.total_debit)}</div>
            </div>
          </div>
        </MobileCard>
      </div>

      {categorySlices.length > 0 && (
        <>
          <SectionHeader title="Expense categories" />
          <div className="px-4">
            <MobileCard>
              <CategoryDonut slices={categorySlices} />
            </MobileCard>
          </div>
        </>
      )}

      <SectionHeader
        title="Recent activity"
        action={
          <button onClick={() => navigate("/m/transactions")} className="text-xs font-semibold text-saffron-600 active:opacity-60">
            See all
          </button>
        }
      />
      <div className="m-card !p-0 mx-4 overflow-hidden">
        <RecentActivityList items={recent} onItemClick={(t) => navigate(`/m/transactions/${t.id}`)} />
      </div>
    </MobileShell>
  );
}
