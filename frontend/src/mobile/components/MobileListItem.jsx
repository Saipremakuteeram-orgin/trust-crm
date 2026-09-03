import { ChevronRight } from "lucide-react";

export default function MobileListItem({ leading, title, subtitle, trailing, onClick, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 m-tap text-left active:bg-stone-50 transition-colors ${className}`}
    >
      {leading != null && <div className="shrink-0">{leading}</div>}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-stone-800 truncate">{title}</div>
        {subtitle != null && <div className="text-xs text-stone-500 truncate mt-0.5">{subtitle}</div>}
      </div>
      {trailing != null ? (
        <div className="shrink-0 text-stone-500">{trailing}</div>
      ) : onClick ? (
        <ChevronRight size={18} className="shrink-0 text-stone-300" />
      ) : null}
    </button>
  );
}
