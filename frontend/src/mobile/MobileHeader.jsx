import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

export default function MobileHeader({ title, showBack, rightAction, subtitle }) {
  const navigate = useNavigate();
  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-2 px-3 py-2 bg-white/85 backdrop-blur-md border-b border-stone-200/60 m-safe-top"
      style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
    >
      {showBack ? (
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="m-tap w-10 h-10 rounded-xl flex items-center justify-center active:bg-stone-100"
        >
          <ChevronLeft size={22} className="text-stone-700" />
        </button>
      ) : (
        <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0">
          <img src="/logo.jpg" alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-base font-bold text-stone-900 truncate leading-tight">{title}</div>
        {subtitle && <div className="text-[11px] text-stone-500 truncate">{subtitle}</div>}
      </div>
      {rightAction}
    </header>
  );
}
