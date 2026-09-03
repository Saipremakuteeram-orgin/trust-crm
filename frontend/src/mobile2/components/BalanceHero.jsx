const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function BalanceHero({ balance, cash, digital, subtitle }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-royal-50 to-saffron-50 border border-royal-100 p-5">
      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-bold">Total balance</div>
      <div className="text-4xl font-bold text-stone-900 mt-1 tracking-tight">{fmt(balance)}</div>
      {subtitle && <div className="text-xs text-stone-500 mt-1">{subtitle}</div>}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Cash</div>
          <div className="text-base font-bold text-stone-800">{fmt(cash)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Digital</div>
          <div className="text-base font-bold text-stone-800">{fmt(digital)}</div>
        </div>
      </div>
    </div>
  );
}
