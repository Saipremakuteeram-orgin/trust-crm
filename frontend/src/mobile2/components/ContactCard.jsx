import { useRef, useCallback } from "react";

export default function ContactCard({ contact, onTap, onLongPress }) {
  const timer = useRef(null);
  const start = useCallback(() => {
    timer.current = setTimeout(() => onLongPress?.(contact), 600);
  }, [contact, onLongPress]);
  const end = useCallback(() => clearTimeout(timer.current), []);
  return (
    <div
      onTouchStart={start}
      onTouchEnd={end}
      onMouseDown={start}
      onMouseUp={end}
      onClick={onTap ? () => onTap(contact) : undefined}
      className="bg-white rounded-3xl shadow-soft border border-stone-200/60 p-4 active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-royal-50 text-royal-700 flex items-center justify-center text-sm font-bold">
          {(contact.name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-stone-800 truncate">{contact.name}</div>
          <div className="text-[11px] text-stone-500 truncate">{[contact.phone, contact.email].filter(Boolean).join(" · ") || "—"}</div>
        </div>
      </div>
    </div>
  );
}
