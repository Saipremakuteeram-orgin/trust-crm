import { useLocation } from "react-router-dom";
import MobileHeader from "./MobileHeader";
import BottomTabBar from "./BottomTabBar";
import ProfileMenu from "./components/ProfileMenu";
import { ToastProvider } from "../components/Toast";

export default function MobileShell({ title, showBack, rightAction, children, subtitle, hideTabs }) {
  const { pathname } = useLocation();
  const onMore = pathname === "/m/more";

  return (
    <ToastProvider>
      <div className="flex flex-col h-[100dvh] bg-stone-50">
        <MobileHeader
          title={onMore ? "Menu" : title}
          showBack={!onMore && !!showBack}
          subtitle={onMore ? "All sections" : subtitle}
          onClose={onMore ? undefined : undefined}
          rightAction={onMore ? null : (rightAction ?? <ProfileMenu />)}
        />
        <main
          className="flex-1 overflow-y-auto pb-24"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {children}
        </main>
        {!hideTabs && <BottomTabBar />}
      </div>
    </ToastProvider>
  );
}
