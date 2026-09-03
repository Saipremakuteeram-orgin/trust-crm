import { useNavigate } from "react-router-dom";
import { ChevronLeft, X } from "lucide-react";

export default function MobileHeader({
  title,
  showBack,
  rightAction,
  subtitle,
  variant = "default",
  onClose,
}) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (typeof onClose === "function") {
      onClose();
    } else {
      navigate(-1);
    }
  };

  const showLogo = variant !== "modal" && !showBack;

  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-2 px-3 bg-white/90 backdrop-blur-md border-b border-stone-200/70 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
        paddingBottom: "0.5rem",
        minHeight: "calc(env(safe-area-inset-top, 0px) + 3.5rem)",
      }}
    >
      {showBack || onClose ? (
        <button
          onClick={handleBack}
          aria-label={onClose ? "Close" : "Go back"}
          className="m-tap w-11 h-11 -ml-1 rounded-xl flex items-center justify-center text-stone-700 active:bg-stone-100 shrink-0"
        >
          {onClose ? <X size={22} /> : <ChevronLeft size={24} />}
        </button>
      ) : showLogo ? (
        <div className="w-11 h-11 -ml-1 rounded-xl overflow-hidden shrink-0 ring-1 ring-stone-200">
          <img src="/logo.jpg" alt="" className="w-full h-full object-cover" />
        </div>
      ) : null}

      <div className="flex-1 min-w-0 px-1">
        <div className="text-base font-bold text-stone-900 truncate leading-tight tracking-tight">
          {title}
        </div>
        {subtitle != null && subtitle !== "" && (
          <div className="text-[11px] text-stone-500 truncate mt-0.5 font-medium">
            {subtitle}
          </div>
        )}
      </div>

      {rightAction ? (
        <div className="shrink-0 flex items-center gap-1 -mr-1">{rightAction}</div>
      ) : null}
    </header>
  );
}
