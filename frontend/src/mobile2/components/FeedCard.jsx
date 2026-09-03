import { useRef, useCallback } from "react";

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function FeedCard({ txn, expanded, onToggleExpand, onEdit, onDelete }) {
  const longPressTimer = useRef(null);
  const [longPress, setLongPress] = useState(false);

  const handleStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => setLongPress(true), 600);
  }, []);

  const handleEnd = useCallback(() => {
    clearTimeout(longPressTimer.current);
    if (longPress) {
      setLongPress(false);
      onEdit?.(txn);
    }
  }, [longPress, onEdit, txn]);

  return (
    <div
      onTouchStart={handleStart}
      onTouchEnd={handleEnd}
      onMouseDown={handleStart}
      onMouseUp={handleEnd}
      className="bg-white rounded-3xl shadow-soft border border-stone-200/60 p-4 active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${txn.type === "credit" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
          {txn.type === "credit" ? "+" : "-"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-stone-800 truncate">{txn.party || txn.description || "Untitled"}</div>
          <div className="text-[11px] text-stone-500 truncate">{txn.txn_date} · {txn.mode === "cash" ? "Cash" : (txn.digital_method || "Digital").toUpperCase()}</div>
        </div>
        <div className={`text-sm font-bold shrink-0 ${txn.type === "credit" ? "text-emerald-700" : "text-rose-700"}`}>{fmt(txn.amount)}</div>
        <button onClick={onToggleExpand} aria-label={expanded ? "Collapse" : "Expand"} className="m-tap w-9 h-9 rounded-xl flex items-center justify-center text-stone-400 active:bg-stone-50">
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-stone-100 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-stone-500">Category</span><div className="font-semibold text-stone-800">{txn.categories?.name || "—"}</div></div>
            <div><span className="text-stone-500">Mode</span><div className="font-semibold text-stone-800 capitalize">{txn.mode}</div></div>
            {txn.functions?.name && (<div><span className="text-stone-500">Function</span><div className="font-semibold text-stone-800">{txn.functions.name}</div></div>)}
            <div><span className="text-stone-500">Voucher</span><div className="font-semibold text-stone-800">{txn.voucher_filed ? "Filed" : "Pending"}</div></div>
          </div>
          {txn.description && <div className="text-xs text-stone-600">{txn.description}</div>}
          <div className="flex gap-2 pt-2">
            <button onClick={onEdit} className="m-tap flex-1 text-xs font-semibold py-2 rounded-xl bg-royal-50 text-royal-700">Edit</button>
            <button onClick={onDelete} className="m-tap flex-1 text-xs font-semibold py-2 rounded-xl bg-rose-50 text-rose-700">Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
