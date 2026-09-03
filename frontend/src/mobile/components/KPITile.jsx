export default function KPITile({ label, value, sub, tone = "default", icon }) {
  const tones = {
    default: { bg: "from-stone-50 to-white", text: "text-stone-900", accent: "text-stone-400" },
    credit: { bg: "from-emerald-50 to-white", text: "text-emerald-700", accent: "text-emerald-500" },
    debit: { bg: "from-rose-50 to-white", text: "text-rose-700", accent: "text-rose-500" },
    net: { bg: "from-royal-50 to-white", text: "text-royal-700", accent: "text-royal-500" },
    balance: { bg: "from-saffron-50 to-white", text: "text-saffron-700", accent: "text-saffron-500" },
  };
  const t = tones[tone] || tones.default;
  return (
    <div className={`snap-start shrink-0 w-[150px] m-card bg-gradient-to-br ${t.bg} flex flex-col gap-1`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">{label}</span>
        {icon != null && <span className={t.accent}>{icon}</span>}
      </div>
      <div className={`text-lg font-bold tracking-tight ${t.text}`}>{value}</div>
      {sub != null && <div className="text-[11px] text-stone-500">{sub}</div>}
    </div>
  );
}
