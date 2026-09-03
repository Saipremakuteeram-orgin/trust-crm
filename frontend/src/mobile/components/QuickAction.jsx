import { useNavigate } from "react-router-dom";

const TONE_BG = {
  saffron: "bg-saffron-50 text-saffron-700",
  royal: "bg-royal-50 text-royal-700",
  emerald: "bg-emerald-50 text-emerald-700",
  rose: "bg-rose-50 text-rose-700",
  stone: "bg-stone-100 text-stone-700",
};

export default function QuickAction({ to, label, icon: Icon, tone = "saffron", onClick }) {
  const navigate = useNavigate();
  const handle = onClick || (() => to && navigate(to));
  return (
    <button
      onClick={handle}
      className="m-tap shrink-0 w-[88px] flex flex-col items-center gap-2 active:scale-95 transition-transform"
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${TONE_BG[tone] || TONE_BG.saffron}`}>
        {Icon != null && <Icon size={22} />}
      </div>
      <span className="text-[11px] font-semibold text-stone-700 text-center leading-tight">{label}</span>
    </button>
  );
}
