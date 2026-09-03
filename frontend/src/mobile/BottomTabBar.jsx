import { NavLink, useLocation } from "react-router-dom";
import { getVisiblePrimary } from "./lib/mobileNav";
import { useAuth } from "../lib/AuthContext";

export default function BottomTabBar() {
  const { profile } = useAuth();
  const role = profile?.role || "viewer";
  const tabs = getVisiblePrimary(role);
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-stone-200/70"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch justify-around">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || (to !== "/m/dashboard" && to !== "/m/more" && pathname.startsWith(to));
          return (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                aria-current={active ? "page" : undefined}
                className={`m-tap flex flex-col items-center justify-center gap-0.5 py-2 ${active ? "text-saffron-600" : "text-stone-500"}`}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 2} />
                <span className="text-[10px] font-semibold">{label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
