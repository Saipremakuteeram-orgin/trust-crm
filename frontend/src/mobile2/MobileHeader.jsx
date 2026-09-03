import { ChevronLeft, X } from "lucide-react";

export default function MobileHeader({ title, showBack, onClose, rightAction }) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-2 px-3 bg-white/90 backdrop-blur-md border-b border-stone-200/70"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
        paddingBottom: "0.5rem",
        minHeight: "calc(env(safe-area-inset-top, 0px) + 3.5rem)",
      }}
    >
      {(showBack || onClose) && (
        <button
          onClick={onClose || (() => window.history.back())}
          aria-label={onClose ? "Close" : "Go back"}
          className="m-tap w-11 h-11 -ml-1 rounded-xl flex items-center justify-center text-stone-700 active:bg-stone-100 shrink-0"
        >
          {onClose ? <X size={22} /> : <ChevronLeft size={24} />}
        </button>
      )}
      <div className="flex-1 min-w-0 px-1">
        <div className="text-base font-bold text-stone-900 truncate leading-tight tracking-tight">{title}</div>
      </div>
      {rightAction && <div className="shrink-0">{rightAction}</div>}
    </header>
  );
}
