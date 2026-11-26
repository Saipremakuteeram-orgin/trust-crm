import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard, ArrowDownCircle, Users, Shield, History, Table2, UsersRound,
  FolderCog, Database, FileBarChart, Send, Mail, Repeat, PartyPopper,
  MessageCircle, BookOpen, TrendingUp, ScrollText, Heart, CalendarDays,
  Receipt, Scale, Landmark, FileText, WalletCards, CheckSquare,
  Bot, Building2, BarChart3, ChevronRight, Target, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useOperations } from "../lib/OperationsContext";
import { isOperationsEnabled } from "../lib/operationsFlags";
import { EASE } from "./ui/tokens";

const item = (to, label, icon, roles) => ({ to, label, icon, roles });

const groups = [
  { label: "Overview", items: [item("/dashboard", "Dashboard", LayoutDashboard)] },
  {
    label: "Transactions",
    items: [
      item("/transactions", "Transactions", ArrowDownCircle),
      item("/recurring", "Recurring", Repeat),
    ],
  },
  {
    label: "People",
    items: [
      item("/contacts", "Contacts", Users),
      item("/groups", "Groups", UsersRound),
      item("/trustees", "Trustees", Shield, ["admin", "accountant"]),
      item("/beneficiaries", "Beneficiaries", Heart, ["admin", "accountant"]),
      item("/volunteers", "Volunteers", Users, ["admin", "accountant"]),
    ],
  },
  {
    label: "Accounting",
    items: [
      item("/accounts", "Chart of Accounts", BookOpen, ["admin", "accountant"]),
      item("/journal", "Journal Entries", BookOpen, ["admin", "accountant"]),
      item("/trial-balance", "Trial Balance", TrendingUp, ["admin", "accountant"]),
      item("/ledger", "General Ledger", ScrollText, ["admin", "accountant"]),
      item("/functions", "Functions & Budget", PartyPopper, ["admin", "accountant"]),
      item("/spreadsheet", "Spreadsheet", Table2, ["admin", "accountant"]),
    ],
  },
  {
    label: "Compliance & Records",
    items: [
      item("/compliance", "Compliance", CalendarDays, ["admin", "accountant"]),
      item("/receipts", "Receipts", Receipt, ["admin", "accountant"]),
      item("/bank-reconciliation", "Bank Reconciliation", Scale, ["admin", "accountant"]),
      item("/activity", "Activity Log", History),
    ],
  },
  {
    label: "Communication",
    items: [
      item("/file-send", "Send File", Send),
      item("/mail", "Mail", Mail),
      item("/whatsapp", "WhatsApp", MessageCircle, ["admin", "accountant"]),
      item("/drive", "Common Drive", FolderCog, ["admin", "accountant"]),
    ],
  },
  { label: "Events", items: [item("/events", "Events", CalendarDays, ["admin", "accountant"])] },
  { label: "Fundraising", items: [item("/campaigns", "Campaigns", Target, ["admin", "accountant"])] },
  { label: "Reports", items: [item("/reports", "Reports", FileBarChart, ["admin", "accountant"])] },
  {
    label: "Administration",
    items: [
      item("/users", "User Management", Shield, ["admin"]),
      item("/backup", "Backup & Restore", Database, ["admin"]),
      item("/assets", "Assets", Database, ["admin", "accountant"]),
      item("/security", "Security", Shield, ["admin"]),
    ],
  },
];

const operationsLinks = [
  { to: "/operations", label: "Trust operations", icon: Landmark, flag: null, exact: true },
  { to: "/operations/approvals", label: "Approvals", icon: CheckSquare, flag: "approvals" },
  { to: "/operations/automation", label: "Automation", icon: Bot, flag: "automationMonitor" },
  { to: "/operations/reports", label: "Reports", icon: BarChart3, flag: null },
  { to: "/operations/audit", label: "Audit & health", icon: History, flag: null },
  { to: "/operations/trusts", label: "Trusts", icon: Building2, flag: null },
  { to: "/operations/funds", label: "Funds", icon: Landmark, flag: "funds" },
  { to: "/operations/invoices", label: "Invoices", icon: FileText, flag: "invoices" },
  { to: "/operations/payroll", label: "Payroll", icon: WalletCards, flag: "payroll" },
];

const STORAGE_KEY = "trustcrm.nav.collapsedGroups";
const RAIL_KEY = "trustcrm.nav.rail";

function isVisible(entry, role) {
  return !entry.roles || entry.roles.includes(role);
}

function NavItem({ to, label, icon: Icon, rail, scope = "desktop", onNavigate }) {
  return (
    <NavLink
      to={to}
      title={rail ? label : undefined}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors duration-200
        ${rail ? "justify-center px-0" : ""}
        ${
          isActive
            ? "text-white"
            : "text-indigo-200/75 hover:bg-white/5 hover:text-white"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId={`nav-active-pill-${scope}`}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="absolute inset-0 rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 shadow-[0_8px_24px_-12px_rgba(245,158,11,0.9)]"
            />
          )}
          <Icon
            size={17}
            strokeWidth={1.75}
            className={`relative z-10 shrink-0 transition-transform duration-200 group-hover:scale-105 ${
              isActive ? "text-white" : "text-indigo-300/80"
            }`}
          />
          {!rail && <span className="relative z-10 truncate">{label}</span>}
        </>
      )}
    </NavLink>
  );
}

function NavContent({ rail, scope = "desktop", collapsed, toggleGroup, operationsEnabled, role, onNavigate }) {
  const visibleOperations = operationsEnabled
    ? operationsLinks.filter((link) => !link.flag || isOperationsEnabled(link.flag))
    : [];

  return (
    <>
      <div className={`relative z-10 flex items-center gap-3 px-4 pt-5 pb-4 ${rail ? "justify-center px-0" : ""}`}>
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/15 shadow-lg">
          <img src="/logo.jpg?v=2" alt="Trust" className="h-full w-full object-cover" />
        </div>
        {!rail && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight text-white">Trust CRM</div>
            <div className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-indigo-300/80">
              Management portal
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <nav className={`relative z-10 flex-1 overflow-y-auto py-4 ${rail ? "px-2" : "px-3"}`}>
        {rail ? (
          <div className="flex flex-col gap-1">
            {groups.flatMap((group) => group.items.filter((entry) => isVisible(entry, role))).map((entry) => (
              <NavItem key={entry.to} {...entry} scope={scope} rail onNavigate={onNavigate} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const visibleItems = group.items.filter((entry) => isVisible(entry, role));
              if (visibleItems.length === 0) return null;
              const isCollapsed = !!collapsed[group.label];
              return (
                <div key={group.label}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-300/70 transition-colors hover:text-white"
                  >
                    <span>{group.label}</span>
                    <ChevronRight size={12} className={`transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`} />
                  </button>
                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <div className="mt-1 space-y-0.5">
                          {visibleItems.map((entry) => (
                            <NavItem key={entry.to} {...entry} scope={scope} onNavigate={onNavigate} />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {visibleOperations.length > 0 && (
              <div className="border-t border-white/10 pt-3">
                <button
                  type="button"
                  aria-expanded={!collapsed.Operations}
                  onClick={() => toggleGroup("Operations")}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-300/70 transition-colors hover:text-white"
                >
                  <span className="flex items-center gap-2"><Landmark size={12} /> Operations</span>
                  <ChevronRight size={12} className={`transition-transform duration-200 ${collapsed.Operations ? "" : "rotate-90"}`} />
                </button>
                <AnimatePresence initial={false}>
                  {!collapsed.Operations && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <div className="mt-1 space-y-0.5">
                        {visibleOperations.map((link) => (
                          <NavItem key={link.to} {...link} scope={scope} onNavigate={onNavigate} />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </nav>
    </>
  );
}

export default function Nav({ variant = "desktop", onNavigate }) {
  const { profile } = useAuth();
  const { enabled: operationsEnabled } = useOperations();
  const role = profile?.role || "viewer";
  const reduce = useReducedMotion();

  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
  });
  const [rail, setRail] = useState(() => {
    try { return localStorage.getItem(RAIL_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (variant === "drawer") return;
    try { localStorage.setItem(RAIL_KEY, rail ? "1" : "0"); } catch {}
  }, [rail, variant]);

  const toggleGroup = (label) =>
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });

  const shell = (
    <>
      <div aria-hidden="true" className="absolute inset-0 opacity-60" style={{ background: "linear-gradient(180deg, #1e1b4b 0%, #272162 55%, #322a80 100%)" }} />
      <div aria-hidden="true" className="absolute inset-0 bg-mesh-pattern opacity-40" />
      <div aria-hidden="true" className="absolute -top-16 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full opacity-25 blur-3xl" style={{ background: "radial-gradient(circle, #fbbf24, transparent 70%)" }} />
    </>
  );

  if (variant === "drawer") {
    return (
      <div className="relative flex h-full w-[264px] flex-col overflow-hidden">
        {shell}
        <NavContent rail={false} scope="drawer" collapsed={collapsed} toggleGroup={toggleGroup} operationsEnabled={operationsEnabled} role={role} onNavigate={onNavigate} />
      </div>
    );
  }

  return (
    <motion.aside
      initial={false}
      animate={{ width: rail ? 78 : 264 }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 30 }}
      className="sticky top-0 z-20 hidden h-[100dvh] shrink-0 flex-col overflow-hidden md:flex"
    >
      {shell}
      <NavContent rail={rail} collapsed={collapsed} toggleGroup={toggleGroup} operationsEnabled={operationsEnabled} role={role} />

      <div className="relative z-10 border-t border-white/10 p-3">
        <button
          type="button"
          onClick={() => setRail((value) => !value)}
          aria-label={rail ? "Expand navigation" : "Collapse navigation"}
          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-medium text-indigo-200/70 transition-colors hover:bg-white/5 hover:text-white ${rail ? "justify-center px-0" : ""}`}
        >
          {rail ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!rail && <span>Collapse menu</span>}
        </button>
      </div>
    </motion.aside>
  );
}
