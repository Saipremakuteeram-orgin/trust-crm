import { NavLink, useLocation } from "react-router-dom";
import { Home, Wallet, Users, Bell, MoreHorizontal } from "lucide-react";
import LogButton from "./components/LogButton";
import { useQuickLog } from "./hooks";

const TABS = [
  { to: "/mobile/home", label: "Home", icon: Home },
  { to: "/mobile/money", label: "Money", icon: Wallet },
  { to: "/mobile/people", label: "People", icon: Users },
  { to: "/mobile/inbox", label: "Inbox", icon: Bell },
  { to: "/mobile/more", label: "More", icon: MoreHorizontal },
];

export default function BottomTabBar() {
  const { pathname } = useLocation();
  const { openSheet } = useQuickLog();

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-stone-200/70"
      style={{ paddingBottom: "env(safe-area-inset-bottom)", height: "calc(64px + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="flex items-center justify-around h-full px-2">
        {TABS.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || (to !== "/mobile/home" && pathname.startsWith(to + "/"));
          return (
            <NavLink
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              className={`m-tap flex flex-col items-center justify-center gap-0.5 py-2 ${active ? "text-saffron-600" : "text-stone-400"}`}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 2} />
              <span className="text-[10px] font-semibold">{label}</span>
            </NavLink>
          );
        })}
        <div className="w-16" />
        <div className="absolute left-1/2 -translate-x-1/2 -top-5">
          <LogButton onPress={openSheet} />
        </div>
      </div>
    </nav>
  );
}
