import { useNavigate } from "react-router-dom";
import MobileShell from "../MobileShell";
import MobileCard from "../components/MobileCard";
import MobileListItem from "../components/MobileListItem";
import { getAllVisibleMore } from "../lib/mobileNav";
import { useAuth } from "../../lib/AuthContext";

export default function MobileMore() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const role = profile?.role || "viewer";
  const groups = getAllVisibleMore(role);

  return (
    <MobileShell title="Menu" subtitle="All sections">
      <div className="p-4 space-y-3">
        {groups.map((g) => (
          <MobileCard key={g.title} className="!p-0 overflow-hidden">
            <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500 bg-stone-50">
              {g.title}
            </div>
            <ul className="m-list">
              {g.items.map((it) => {
                const Icon = it.icon;
                return (
                  <MobileListItem
                    key={it.to}
                    onClick={() => navigate(it.to)}
                    leading={
                      <div className="w-10 h-10 rounded-xl bg-saffron-50 text-saffron-600 flex items-center justify-center shrink-0">
                        <Icon size={18} />
                      </div>
                    }
                    title={it.label}
                  />
                );
              })}
            </ul>
          </MobileCard>
        ))}
      </div>
    </MobileShell>
  );
}
