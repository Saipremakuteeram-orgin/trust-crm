import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "../lib/supabase";
import { LogOut, ChevronDown, Bell, Moon, Sun, Menu, X, Check } from "lucide-react";
import GlobalSearch from "./GlobalSearch";
import Nav from "./Nav";
import Button from "./ui/Button";
import api from "../lib/api";
import { useTheme } from "../lib/ThemeContext";
import { useAuth } from "../lib/AuthContext";
import { EASE } from "./ui/tokens";

const TITLES = {
  "/dashboard": "Dashboard",
  "/transactions": "Transactions",
  "/recurring": "Recurring transactions",
  "/functions": "Functions & budget",
  "/accounts": "Chart of accounts",
  "/journal": "Journal entries",
  "/trial-balance": "Trial balance",
  "/ledger": "General ledger",
  "/trustees": "Trustees",
  "/beneficiaries": "Beneficiaries",
  "/compliance": "Compliance",
  "/receipts": "Receipts",
  "/bank-reconciliation": "Bank reconciliation",
  "/events": "Events",
  "/campaigns": "Campaigns",
  "/volunteers": "Volunteers",
  "/assets": "Assets",
  "/security": "Security",
  "/whatsapp": "WhatsApp",
  "/contacts": "Contacts",
  "/groups": "Groups",
  "/users": "User management",
  "/activity": "Activity log",
  "/spreadsheet": "Spreadsheet",
  "/drive": "Common drive",
  "/backup": "Backup & restore",
  "/file-send": "Send file",
  "/mail": "Mail",
  "/reports": "Reports",
  "/operations": "Trust operations",
};

function titleFor(pathname) {
  if (TITLES[pathname]) return TITLES[pathname];
  const match = Object.keys(TITLES)
    .filter((key) => key !== "/" && pathname.startsWith(key + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return match ? TITLES[match] : "Trust CRM";
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const ref = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    api.get("/notifications").then((r) => setNotifs(r.data.result || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const close = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) setNotifOpen(false);
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  const role = profile?.role || "viewer";

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  async function openNotification(n) {
    if (!n.read_at) {
      setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      try { await api.patch(`/notifications/${n.id}/read`); } catch {}
    }
    if (n.link) {
      setNotifOpen(false);
      navigate(n.link);
    }
  }

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";
  const unread = notifs.filter((n) => !n.read_at).length;

  const roleColors = {
    admin: "bg-saffron-500/15 text-saffron-700 dark:text-saffron-300",
    accountant: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    viewer: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
  };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-stone-50/85 backdrop-blur-xl dark:border-stone-800 dark:bg-stone-950/80">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Button
            variant="secondary"
            size="iconSm"
            icon={Menu}
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
            className="md:hidden"
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-medium text-stone-400 dark:text-stone-500">
              <span className="hidden sm:inline">Trust CRM</span>
              <ChevronDown size={11} className="hidden -rotate-90 sm:inline" />
              <span className="truncate text-stone-500 dark:text-stone-400">{titleFor(location.pathname)}</span>
            </div>
          </div>

          <GlobalSearch />

          <Button
            variant="secondary"
            size="iconSm"
            onClick={toggleTheme}
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                initial={{ rotate: -40, opacity: 0, scale: 0.7 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 40, opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.2 }}
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </motion.span>
            </AnimatePresence>
          </Button>

          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((value) => !value)}
              aria-label="Notifications"
              className="relative grid h-9 w-9 place-items-center rounded-xl border border-stone-200 bg-white text-stone-600 transition-all hover:-translate-y-px hover:text-saffron-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300"
            >
              <Bell size={16} />
              {unread > 0 && (
                <span className="absolute right-2 top-2 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                </span>
              )}
            </button>

            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl shadow-stone-900/10 dark:border-stone-800 dark:bg-stone-900"
                >
                  <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3 dark:border-stone-800">
                    <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">Notifications</span>
                    <button
                      type="button"
                      onClick={() => { api.post("/notifications/read-all"); setNotifs(notifs.map((n) => ({ ...n, read_at: new Date().toISOString() }))); }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-saffron-700 hover:text-saffron-600 dark:text-saffron-400"
                    >
                      <Check size={12} /> Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifs.length === 0 && (
                      <p className="px-4 py-6 text-center text-sm text-stone-400 dark:text-stone-500">No notifications yet</p>
                    )}
                    {notifs.map((n) => (
                      <button
                        type="button"
                        key={n.id}
                        onClick={() => openNotification(n)}
                        className={`block w-full border-b border-stone-50 px-4 py-3 text-left transition-colors last:border-0 dark:border-stone-800/60 ${n.link ? "cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50" : ""} ${n.read_at ? "opacity-60" : ""}`}
                      >
                        <div className="text-sm font-medium text-stone-800 dark:text-stone-100">{n.title}</div>
                        {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-stone-500 dark:text-stone-400">{n.body}</div>}
                        <div className="mt-1 text-[10px] text-stone-400">{new Date(n.created_at).toLocaleString()}</div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative" ref={ref}>
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="flex items-center gap-2.5 rounded-xl border border-transparent px-1.5 py-1 transition-colors hover:border-stone-200 hover:bg-white dark:hover:border-stone-800 dark:hover:bg-stone-900"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-saffron-400 to-saffron-600 text-xs font-bold text-white shadow-md shadow-saffron-500/25">
                {initials}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block max-w-[140px] truncate text-[13px] font-semibold leading-tight text-stone-800 dark:text-stone-100">
                  {profile?.full_name || "Loading"}
                </span>
                <span className={`inline-flex rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${roleColors[role] || roleColors.viewer}`}>
                  {role}
                </span>
              </span>
              <ChevronDown size={14} className={`hidden text-stone-400 transition-transform duration-200 sm:block ${open ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl shadow-stone-900/10 dark:border-stone-800 dark:bg-stone-900"
                >
                  <div className="border-b border-stone-100 px-4 py-3 dark:border-stone-800">
                    <div className="truncate text-sm font-semibold text-stone-800 dark:text-stone-100">{profile?.full_name}</div>
                    <div className="truncate text-xs text-stone-500 dark:text-stone-400">{profile?.email || ""}</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  >
                    <LogOut size={15} /> Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="fixed inset-0 z-50 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-stone-950/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="relative h-full w-[264px] overflow-hidden"
            >
              <Nav variant="drawer" onNavigate={() => setMenuOpen(false)} />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close navigation"
                className="absolute right-3 top-4 grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <X size={16} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
