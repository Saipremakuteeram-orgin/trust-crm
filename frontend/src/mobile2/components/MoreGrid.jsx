import { useNavigate } from "react-router-dom";

export default function MoreGrid({ groups, onNavigate }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 px-1 mb-2">{g.title}</div>
          <div className="grid grid-cols-2 gap-2">
            {g.items.map((it) => {
              const Icon = it.icon;
              const handle = () => (onNavigate ? onNavigate(it.to) : navigate(it.to));
              return (
                <button
                  key={it.to}
                  onClick={handle}
                  className={`m-tap flex flex-col items-center gap-2 rounded-2xl border border-stone-200 bg-white p-4 active:scale-95 ${it.disabled ? "opacity-50" : ""}`}
                  disabled={it.disabled}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${it.disabled ? "bg-stone-100 text-stone-400" : "bg-saffron-50 text-saffron-600"}`}>
                    {Icon && <Icon size={18} />}
                  </div>
                  <span className="text-xs font-semibold text-stone-700 text-center leading-tight">{it.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
