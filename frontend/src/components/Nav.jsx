import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { LayoutDashboard, ArrowDownCircle, ArrowUpCircle, Users, LogOut } from "lucide-react";

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
    <nav className="w-56 shrink-0 bg-stone-900 text-stone-100 min-h-screen flex flex-col p-4">
      <div className="text-lg font-semibold mb-8 px-2">🕉️ Trust CRM</div>
      <div className="flex-1 space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                isActive ? "bg-amber-600 text-white" : "text-stone-300 hover:bg-stone-800"
              }`
            }>
            <Icon size={16} /> {label}
          </NavLink>
        ))}
      </div>
      <button onClick={handleLogout}
        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone-400 hover:bg-stone-800 hover:text-white transition">
        <LogOut size={16} /> Logout
      </button>
    </nav>
  );
}
