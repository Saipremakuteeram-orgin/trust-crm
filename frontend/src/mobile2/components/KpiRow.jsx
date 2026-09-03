const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function KpiRow({ income, expense, net }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-emerald-50 rounded-2xl p-3">
        <div className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold">Income</div>
        <div className="text-sm font-bold text-emerald-700 mt-0.5 truncate">{fmt(income)}</div>
      </div>
      <div className="bg-rose-50 rounded-2xl p-3">
        <div className="text-[10px] uppercase tracking-wider text-rose-600 font-bold">Expense</div>
        <div className="text-sm font-bold text-rose-700 mt-0.5 truncate">{fmt(expense)}</div>
      </div>
      <div className="bg-royal-50 rounded-2xl p-3">
        <div className="text-[10px] uppercase tracking-wider text-royal-600 font-bold">Net</div>
        <div className="text-sm font-bold text-royal-700 mt-0.5 truncate">{fmt(net)}</div>
      </div>
    </div>
  );
}
