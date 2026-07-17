import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { LayoutDashboard, ArrowDownCircle, Users, LogOut } from "lucide-react";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowDownCircle },
  { to: "/contacts", label: "Contacts", icon: Users },
];

export default function Nav() {
  const navigate = useNavigate();
  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }
  return (
    <nav className="w-60 shrink-0 min-h-screen flex flex-col relative overflow-hidden animate-slide-in-left" style={{
      background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)"
    }}>
      <div className="absolute inset-0 bg-mesh-pattern opacity-30" />

      <div className="absolute top-0 left-0 w-32 h-32 rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #fbbf24 0%, transparent 70%)", filter: "blur(40px)" }} />
      <div className="absolute bottom-20 right-0 w-40 h-40 rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #818cf8 0%, transparent 70%)", filter: "blur(40px)" }} />

      <div className="relative z-10 p-5">
        <div className="flex items-center gap-3 mb-1">
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
      </div>

      <div className="relative z-10 w-full h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="relative z-10 p-3">
        <button onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-royal-300 hover:bg-white/10 hover:text-white transition-all duration-200 w-full group btn-press">
          <LogOut size={18} className="transition-transform group-hover:-translate-x-1" /> Logout
        </button>
      </div>
    </nav>
  );
}
