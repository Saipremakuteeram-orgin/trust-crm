import MobileHeader from "./MobileHeader";
import BottomTabBar from "./BottomTabBar";
import MoreSheet from "./MoreSheet";
import { ToastProvider } from "../components/Toast";
import { useAuth } from "../lib/AuthContext";
import { LogOut } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function MobileShell({ title, showBack, rightAction, children, subtitle, hideTabs }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const onMore = pathname === "/m/more";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/m/login", { replace: true });
  };

  const profileAction = (
    <button
      onClick={handleLogout}
      aria-label="Logout"
      title={`Logout ${profile?.full_name || ""}`}
      className="m-tap w-10 h-10 rounded-xl flex items-center justify-center active:bg-stone-100 text-stone-600"
    >
      <LogOut size={18} />
    </button>
  );

  return (
    <ToastProvider>
      <div className="flex flex-col h-[100dvh] bg-stone-50">
        <MobileHeader
          title={onMore ? "Menu" : title}
          showBack={!onMore && showBack}
          subtitle={onMore ? "All sections" : subtitle}
          rightAction={rightAction || (onMore ? null : profileAction)}
        />
        <main
          className="flex-1 overflow-y-auto pb-24"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {children}
        </main>
        {!hideTabs && <BottomTabBar />}
        <MoreSheet open={onMore} onClose={() => navigate("/m/dashboard")} />
      </div>
    </ToastProvider>
  );
}
