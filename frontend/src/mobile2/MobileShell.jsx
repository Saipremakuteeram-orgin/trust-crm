import { useLocation } from "react-router-dom";
import MobileHeader from "./MobileHeader";
import BottomTabBar from "./BottomTabBar";
import ProfileMenu from "./components/ProfileMenu";
import OfflineBanner from "./components/OfflineBanner";
import QuickLogSheet from "./components/QuickLogSheet";
import { ToastProvider } from "../components/Toast";

const ROUTE_TITLES = {
  "/mobile/home": "Home",
  "/mobile/money": "Money",
  "/mobile/people": "People",
  "/mobile/inbox": "Inbox",
  "/mobile/more": "More",
};

export default function MobileShell({ title, showBack, rightAction, children, subtitle }) {
  const { pathname } = useLocation();
  const isRoot = pathname === "/mobile" || pathname === "/mobile/";
  const resolvedTitle = title || ROUTE_TITLES[pathname] || "Trust CRM";

  return (
    <ToastProvider>
      <div className="flex flex-col h-[100dvh] bg-stone-50">
        <OfflineBanner />
        <MobileHeader
          title={resolvedTitle}
          showBack={!!showBack && pathname !== "/mobile/home"}
          rightAction={rightAction ?? <ProfileMenu />}
        />
        <main className="flex-1 overflow-y-auto pb-24" style={{ WebkitOverflowScrolling: "touch" }}>
          {children}
        </main>
        <BottomTabBar />
        <QuickLogSheet />
      </div>
    </ToastProvider>
  );
}
