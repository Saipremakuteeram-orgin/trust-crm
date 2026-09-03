const fmt = (n) => {
  const num = Number(n || 0);
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num}`;
};

export default function RecentActivityList({ items = [], onItemClick }) {
  if (!items.length) {
    return (
      <div className="text-center text-xs text-stone-400 py-6">No recent activity yet.</div>
    );
  }
  return (
    <ul className="m-list">
      {items.map((t) => (
        <li key={t.id}>
          <button
            onClick={() => onItemClick && onItemClick(t)}
            className="w-full flex items-center gap-3 px-4 py-3 m-tap text-left active:bg-stone-50"
          >
            <span
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                t.type === "credit" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              }`}
            >
              {t.type === "credit" ? "+" : "-"}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-stone-800 truncate">{t.party || t.description || "Untitled"}</div>
              <div className="text-[11px] text-stone-500 mt-0.5 truncate">
                {t.txn_date} · {t.mode === "cash" ? "Cash" : (t.digital_method || "Digital").toUpperCase()}
              </div>
            </div>
            <div className={`text-sm font-bold shrink-0 ${t.type === "credit" ? "text-emerald-700" : "text-rose-700"}`}>
              {fmt(t.amount)}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
