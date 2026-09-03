const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function FunctionCard({ fn, onTap }) {
  const spent = (fn.transactions || []).reduce((s, t) => s + Number(t.amount || 0), 0);
  const budget = Number(fn.budget || 0);
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  return (
    <div onClick={() => onTap?.(fn)} className="bg-white rounded-3xl shadow-soft border border-stone-200/60 p-4 active:scale-[0.98] transition-transform">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-saffron-50 text-saffron-600 flex items-center justify-center text-sm font-bold">🎉</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-stone-800 truncate">{fn.name}</div>
          <div className="text-[11px] text-stone-500">{fn.status} · Budget {fmt(budget)}</div>
        </div>
      </div>
      <div className="mt-3 h-2 bg-stone-100 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-saffron-400 to-saffron-600" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[10px] text-stone-500 mt-1">{pct.toFixed(0)}% used · Spent {fmt(spent)}</div>
    </div>
  );
}
