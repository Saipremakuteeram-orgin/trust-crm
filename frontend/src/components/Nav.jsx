import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { LayoutDashboard, ArrowDownCircle, Users, LogOut, Shield } from "lucide-react";
import { useAuth } from "../lib/AuthContext";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowDownCircle },
  { to: "/contacts", label: "Contacts", icon: Users },
];

const adminLinks = [
  { to: "/users", label: "User Management", icon: Shield },
];

export default function Nav() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const role = profile?.role || "viewer";
  const isAdmin = role === "admin";

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  const roleColors = {
    admin: "bg-saffron-500/20 text-saffron-300",
    accountant: "bg-emerald-500/20 text-emerald-300",
    viewer: "bg-royal-400/20 text-royal-200",
  };

  return (
    <nav className="w-60 shrink-0 min-h-screen flex flex-col relative overflow-hidden animate-slide-in-left"
      style={{ background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)" }}>
      <div className="absolute inset-0 bg-mesh-pattern opacity-30" />
      <div className="absolute top-0 left-0 w-32 h-32 rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #fbbf24 0%, transparent 70%)", filter: "blur(40px)" }} />

      <div className="relative z-10 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg animate-float">
            <img src="/logo.jpg" alt="Trust" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="text-base font-bold text-white tracking-tight">Trust CRM</div>
            <div className="text-[10px] font-medium text-royal-300 tracking-wider uppercase">Management Portal</div>
          </div>
        </div>
      </div>

      <div className="relative z-10 w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="relative z-10 flex-1 px-3 py-4 space-y-1 stagger-children">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-gradient-to-r from-saffron-500 to-saffron-600 text-white shadow-lg shadow-saffron-500/25"
                  : "text-royal-200 hover:bg-white/10 hover:text-white hover:translate-x-1"
              } animate-fade-in-up`
            }>
            <Icon size={18} className="transition-transform group-hover:scale-110" /> {label}
          </NavLink>
        ))}
        {isAdmin && adminLinks.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-gradient-to-r from-saffron-500 to-saffron-600 text-white shadow-lg shadow-saffron-500/25"
                  : "text-royal-200 hover:bg-white/10 hover:text-white hover:translate-x-1"
              } animate-fade-in-up`
            }>
            <Icon size={18} className="transition-transform group-hover:scale-110" /> {label}
          </NavLink>
        ))}
      </div>

      <div className="relative z-10 w-full h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="relative z-10 p-3">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-saffron-400 to-saffron-600 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-saffron-500/25">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">{profile?.full_name || "Loading..."}</div>
            <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full ${roleColors[role] || roleColors.viewer}`}>
              {role?.charAt(0).toUpperCase() + role?.slice(1)}
            </span>
          </div>
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-royal-300 hover:bg-white/10 hover:text-white transition-all duration-200 w-full group btn-press">
          <LogOut size={18} className="transition-transform group-hover:-translate-x-1" /> Logout
        </button>
      </div>
    </nav>
  );
}
