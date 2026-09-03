import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, User } from "lucide-react";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";

const roleColors = {
  admin: "bg-saffron-50 text-saffron-700",
  accountant: "bg-emerald-50 text-emerald-700",
  viewer: "bg-royal-50 text-royal-700",
};

export default function ProfileMenu() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, []);

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  const role = profile?.role || "viewer";

  const handleLogout = async () => {
    setOpen(false);
    await supabase.auth.signOut();
    navigate("/m/login", { replace: true });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="m-tap h-11 pl-1.5 pr-2 rounded-xl flex items-center gap-1.5 active:bg-stone-100"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-saffron-400 to-saffron-600 flex items-center justify-center text-white text-[11px] font-bold shadow-sm shadow-saffron-500/30">
          {initials}
        </div>
        <ChevronDown size={14} className={`text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl shadow-stone-300/40 border border-stone-100 py-2 z-50 origin-top-right"
          style={{ top: "calc(100% + 0.5rem)" }}
        >
          <div className="px-4 py-3 border-b border-stone-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-saffron-400 to-saffron-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-stone-800 truncate">
                  {profile?.full_name || "Loading…"}
                </div>
                <div className="text-[11px] text-stone-500 truncate">
                  {profile?.email || ""}
                </div>
                <span className={`mt-1 inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full ${roleColors[role]}`}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </span>
              </div>
            </div>
          </div>
          <button
            role="menuitem"
            onClick={() => { setOpen(false); navigate("/m/activity"); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 active:bg-stone-50"
          >
            <User size={15} className="text-stone-400" />
            My activity
          </button>
          <button
            role="menuitem"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-600 active:bg-rose-50"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
