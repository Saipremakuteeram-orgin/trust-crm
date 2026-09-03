import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import Card from "../components/Card";
import { useToast } from "../../components/Toast";

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function MobileFunctionDetail() {
  const { id } = useParams();
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
        <Card>
          <div className="flex items-center gap-3">
            <div className="text-3xl">🎉</div>
            <div>
              <div className="text-base font-bold text-stone-900">{detail.name}</div>
              <div className="text-xs text-stone-500 capitalize">{detail.status}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div><div className="text-[10px] uppercase text-stone-500">Budget</div><div className="text-base font-bold text-stone-900">{fmt(budget)}</div></div>
            <div><div className="text-[10px] uppercase text-stone-500">Spent</div><div className="text-base font-bold text-saffron-600">{fmt(spent)}</div></div>
          </div>
          <div className="mt-3 h-2 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-saffron-400 to-saffron-600" style={{ width: `${pct}%` }} /></div>
          <div className="text-[10px] text-stone-500 mt-1">{pct.toFixed(0)}% used</div>
        </Card>

        {(detail.transactions || []).length > 0 && (
          <Card padding={false}>
            <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500 bg-stone-50">Transactions</div>
            <div className="divide-y divide-stone-100">
              {detail.transactions.slice(0, 20).map((t) => (
                <div key={t.id} className="px-4 py-3">
                  <div className="text-sm font-semibold text-stone-800">{t.party || t.description || "Transaction"}</div>
                  <div className="text-[11px] text-stone-500">{t.txn_date} · {fmt(t.amount)}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </MobileShell>
  );
}
