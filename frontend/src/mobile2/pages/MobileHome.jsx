import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Repeat } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import BalanceHero from "../components/BalanceHero";
import KpiRow from "../components/KpiRow";
import SectionTitle from "../components/SectionTitle";
import SecondaryActions from "../components/SecondaryActions";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function MobileHome() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const role = profile?.role || "viewer";
  const canAdd = role === "admin" || role === "accountant";

  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, a, t] = await Promise.allSettled([
        api.get("/dashboard/summary"),
        api.get("/analytics"),
        api.get("/transactions"),
      ]);
      if (s.status === "fulfilled") setSummary(s.value.data.result);
      if (a.status === "fulfilled") setAnalytics(a.value.data.result);
      if (t.status === "fulfilled") setRecent((t.value.data.result || []).slice(0, 5));
    } catch {
      addToast("Failed to load home", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const cash = summary?.cash || {};
  const digital = summary?.digital || {};
  const total = Number(cash.cash_in_hand || 0) + Number(digital.digital_balance || 0);
  const ov = analytics?.overview || {};

  if (loading && !summary) {
    return (
      <MobileShell title="Home">
        <div className="p-4 space-y-3">
          <div className="h-40 rounded-3xl bg-stone-100 animate-pulse" />
          <div className="h-24 rounded-3xl bg-stone-100 animate-pulse" />
          <div className="h-64 rounded-3xl bg-stone-100 animate-pulse" />
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell
      title={`Hi${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
      subtitle={summary ? `Balance ${fmt(total)}` : "Loading…"}
    >
      <div className="px-4 pt-3 space-y-4">
        <BalanceHero balance={total} cash={cash.cash_in_hand} digital={digital.digital_balance} subtitle={`${ov.txn_count || 0} transactions`} />

        {canAdd && (
          <div className="flex items-center justify-center">
            <button onClick={() => document.querySelector('[aria-label="Log transaction"]')?.click()} className="m-tap flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-bold px-6 py-3 rounded-2xl shadow-lg shadow-saffron-500/25 active:scale-95">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Log transaction
            </button>
          </div>
        )}

        <SecondaryActions />

        <SectionTitle title="This month" action={<KpiRow income={ov.total_credit} expense={ov.total_debit} net={ov.net_balance} />} />

        <SectionTitle
          title="Recent activity"
          action={
            <button onClick={() => navigate("/mobile/money")} className="text-xs font-semibold text-saffron-600">See all</button>
          }
        />

        {recent.length === 0 ? (
          <Card>
            <EmptyState title="No activity yet" message="Your recent transactions will appear here." />
          </Card>
        ) : (
          <div className="space-y-2">
            {recent.map((t) => (
              <Card key={t.id} onClick={() => navigate(`/mobile/money/${t.id}`)}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${t.type === "credit" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                    {t.type === "credit" ? "+" : "-"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-stone-800 truncate">{t.party || t.description || "Untitled"}</div>
                    <div className="text-[11px] text-stone-500 truncate">{t.txn_date} · {t.mode === "cash" ? "Cash" : (t.digital_method || "Digital").toUpperCase()}</div>
                  </div>
                  <div className={`text-sm font-bold shrink-0 ${t.type === "credit" ? "text-emerald-700" : "text-rose-700"}`}>{fmt(t.amount)}</div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MobileShell>
  );
}
