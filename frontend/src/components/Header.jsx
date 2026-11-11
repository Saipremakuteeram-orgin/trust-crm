import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { LogOut, ChevronDown, Bell, Moon, Sun } from "lucide-react";
import GlobalSearch from "./GlobalSearch";
import api from "../lib/api";
import { useTheme } from "../lib/ThemeContext";
import { useAuth } from "../lib/AuthContext";
import { useState, useRef, useEffect } from "react";

export default function Header() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const ref = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    api.get('/notifications').then((r) => setNotifs(r.data.result || [])).catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);
  const role = profile?.role || "viewer";

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  async function openNotification(n) {
    if (!n.read_at) {
      setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      try {
        await api.patch(`/notifications/${n.id}/read`);
      } catch {}
    }
    if (n.link) {
      setNotifOpen(false);
      navigate(n.link);
    }
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
      <GlobalSearch />
      <button onClick={toggleTheme} className="p-2 rounded-xl hover:bg-stone-100" title="Toggle theme">
        {theme === "dark" ? <Sun size={18} className="text-stone-600" /> : <Moon size={18} className="text-stone-600" />}
      </button>
      <div className="relative" ref={notifRef}>
        <button onClick={() => setNotifOpen(!notifOpen)} className="relative p-2 rounded-xl hover:bg-stone-100">
          <Bell size={18} className="text-stone-600" />
          {notifs.filter((n) => !n.read_at).length > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
          )}
        </button>
        {notifOpen && (
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-stone-100 py-2 z-50 max-h-96 overflow-y-auto">
            <div className="px-4 py-2 border-b border-stone-100 flex justify-between items-center">
              <span className="text-sm font-semibold">Notifications</span>
              <button onClick={() => { api.post('/notifications/read-all'); setNotifs(notifs.map((n) => ({ ...n, read_at: new Date().toISOString() }))); }} className="text-xs text-saffron-600">Mark all read</button>
            </div>
            {notifs.length === 0 && <div className="px-4 py-3 text-sm text-stone-400">No notifications</div>}
            {notifs.map((n) => (
              <div
                key={n.id}
                onClick={() => openNotification(n)}
                className={`px-4 py-2.5 border-b border-stone-50 ${n.link ? 'cursor-pointer hover:bg-stone-50' : ''} ${n.read_at ? 'opacity-60' : ''}`}
              >
                <div className="text-sm font-medium text-stone-800">{n.title}</div>
                {n.body && <div className="text-xs text-stone-500">{n.body}</div>}
                <div className="text-[10px] text-stone-400 mt-1">{new Date(n.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
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
