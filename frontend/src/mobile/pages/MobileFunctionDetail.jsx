import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PartyPopper } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileCard from "../components/MobileCard";
import MobileListItem from "../components/MobileListItem";
import { useToast } from "../../components/Toast";

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function MobileFunctionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.get(`/functions/${id}`).then((r) => { setDetail(r.data.result); setLoading(false); }).catch(() => { addToast("Failed", "error"); setLoading(false); });
  }, [id]);

  if (loading) return <MobileShell title="Function" showBack><div className="p-6 text-center text-sm text-stone-400">Loading…</div></MobileShell>;
  if (!detail) return <MobileShell title="Function" showBack><div className="p-6 text-center text-sm text-stone-500">Not found</div></MobileShell>;

  const spent = (detail.transactions || []).reduce((s, t) => s + Number(t.amount || 0), 0);
  const budget = Number(detail.budget || 0);
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;

  return (
    <MobileShell title={detail.name} subtitle="Function budget" showBack>
      <div className="p-4 space-y-3">
        <MobileCard>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-saffron-50 text-saffron-600 flex items-center justify-center">
              <PartyPopper size={22} />
            </div>
            <div>
              <div className="text-base font-bold text-stone-800">{detail.name}</div>
              <div className="text-xs text-stone-500 capitalize">{detail.status}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div>
              <div className="text-[10px] uppercase text-stone-500">Budget</div>
              <div className="text-base font-bold text-stone-800">{fmt(budget)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-stone-500">Spent</div>
              <div className="text-base font-bold text-saffron-600">{fmt(spent)}</div>
            </div>
          </div>
          <div className="mt-3 h-2 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-saffron-400 to-saffron-600" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[10px] text-stone-500 mt-1">{pct.toFixed(0)}% used</div>
        </MobileCard>

        <MobileCard className="!p-0 overflow-hidden">
          <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500 bg-stone-50">
            Transactions ({detail.transactions?.length || 0})
          </div>
          {(detail.transactions || []).length === 0 ? (
            <div className="p-4 text-center text-xs text-stone-400">No linked transactions yet</div>
          ) : (
            <ul className="m-list">
              {detail.transactions.slice(0, 20).map((t) => (
                <MobileListItem
                  key={t.id}
                  onClick={() => navigate(`/m/transactions/${t.id}`)}
                  title={t.party || t.description || "Transaction"}
                  subtitle={t.txn_date}
                  trailing={
                    <div className={`text-sm font-bold ${t.type === "credit" ? "text-emerald-700" : "text-rose-700"}`}>
                      {fmt(t.amount)}
                    </div>
                  }
                />
              ))}
            </ul>
          )}
        </MobileCard>

        {(detail.categories || []).length > 0 && (
          <MobileCard className="!p-0 overflow-hidden">
            <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500 bg-stone-50">
              Sub-categories
            </div>
            <ul className="m-list">
              {detail.categories.map((c) => (
                <MobileListItem key={c.id} title={c.category_name} subtitle={fmt(c.spent || 0)} />
              ))}
            </ul>
          </MobileCard>
        )}
      </div>
    </MobileShell>
  );
}
