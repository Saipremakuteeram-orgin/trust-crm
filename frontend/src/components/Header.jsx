import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useState, useRef, useEffect } from "react";

export default function Header() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const role = profile?.role || "viewer";

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  const roleColors = {
    admin: "bg-saffron-500/20 text-saffron-600",
    accountant: "bg-emerald-500/20 text-emerald-600",
    viewer: "bg-royal-400/20 text-royal-500",
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-8 py-3 bg-white/80 backdrop-blur-md border-b border-stone-200/60">
      <div />
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-3 px-3 py-1.5 rounded-xl hover:bg-stone-100 transition-colors duration-200 group"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-saffron-400 to-saffron-600 flex items-center justify-center text-white text-xs font-bold shadow-md shadow-saffron-500/20">
            {initials}
          </div>
          <div className="text-left hidden sm:block">
            <div className="text-sm font-semibold text-stone-800 leading-tight">{profile?.full_name || "Loading..."}</div>
            <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full ${roleColors[role] || roleColors.viewer}`}>
              {role?.charAt(0).toUpperCase() + role?.slice(1)}
            </span>
          </div>
          <ChevronDown size={16} className={`text-stone-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl shadow-stone-200/50 border border-stone-100 py-2 animate-fade-in-up z-50">
            <div className="px-4 py-2 border-b border-stone-100">
              <div className="text-sm font-semibold text-stone-800">{profile?.full_name}</div>
              <div className="text-xs text-stone-500">{profile?.email || ""}</div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors duration-200 group"
            >
              <LogOut size={16} className="group-hover:-translate-x-0.5 transition-transform" />
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
