import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, ArrowDownCircle, Users, Shield, History, Table2, UsersRound,
  FolderCog, Database, FileBarChart, Send, Mail, Repeat, PartyPopper,
  MessageCircle, BookOpen, TrendingUp, ScrollText, Heart, CalendarDays,
  Receipt, Scale, ChevronDown, Landmark, FileText, WalletCards, CheckSquare,
  Bot, Building2, BarChart3, ChevronRight, Target,
} from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useOperations } from "../lib/OperationsContext";
import { isOperationsEnabled } from "../lib/operationsFlags";

const item = (to, label, icon, roles) => ({ to, label, icon, roles });

const groups = [
  {
    label: "Overview",
    items: [item("/dashboard", "Dashboard", LayoutDashboard)],
  },
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
  {
    label: "Events",
    items: [item("/events", "Events", CalendarDays, ["admin", "accountant"])],
  },
  {
    label: "Fundraising",
    items: [item("/campaigns", "Campaigns", Target, ["admin", "accountant"])],
  },
  {
    label: "Reports",
    items: [item("/reports", "Reports", FileBarChart, ["admin", "accountant"])],
  },
  {
    label: "Administration",
    items: [
      item("/users", "User Management", Shield, ["admin"]),
      item("/backup", "Backup & Restore", Database, ["admin"]),
      item("/assets", "Assets", Database, ["admin", "accountant"]),
    ],
  },
];

function isVisible(item, role) {
  return !item.roles || item.roles.includes(role);
}

const STORAGE_KEY = "trustcrm.nav.collapsedGroups";

export default function Nav() {
  const { profile } = useAuth();
  const { enabled: operationsEnabled } = useOperations();
  const fundsEnabled = isOperationsEnabled("funds");
  const invoicesEnabled = isOperationsEnabled("invoices");
  const payrollEnabled = isOperationsEnabled("payroll");
  const approvalsEnabled = isOperationsEnabled("approvals");
  const automationEnabled = isOperationsEnabled("automationMonitor");
  const role = profile?.role || "viewer";

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  });

  const toggleGroup = (label) => {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  return (
    <nav
      className="w-60 shrink-0 min-h-screen flex flex-col relative overflow-hidden animate-slide-in-left"
      style={{ background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)" }}
    >
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

      <div className="relative z-10 flex-1 px-3 py-4 space-y-3 overflow-y-auto">
        {groups.map((group) => {
          const visibleItems = group.items.filter((i) => isVisible(i, role));
          if (visibleItems.length === 0) return null;
          const isCollapsed = !!collapsed[group.label];
          return (
            <div key={group.label} className="space-y-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-royal-300 hover:text-white transition-colors"
              >
                <span>{group.label}</span>
                <ChevronRight size={12} className={`transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
              </button>
              {!isCollapsed && visibleItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-gradient-to-r from-saffron-500 to-saffron-600 text-white shadow-lg shadow-saffron-500/25"
                        : "text-royal-200 hover:bg-white/10 hover:text-white hover:translate-x-1"
                    }`
                  }
                >
                  <Icon size={16} className="transition-transform group-hover:scale-110" /> {label}
                </NavLink>
              ))}
            </div>
          );
        })}

        {(operationsEnabled || fundsEnabled || invoicesEnabled || payrollEnabled) && (
          <div className="mt-2 border-t border-white/10 pt-3 space-y-1">
            <button
              type="button"
              aria-expanded={!collapsed["Operations"]}
              onClick={() => toggleGroup("Operations")}
              className="flex w-full items-center justify-between rounded-xl px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-royal-300 hover:text-white transition-colors"
            >
              <span className="flex items-center gap-2"><Landmark size={12} /> Operations</span>
              <ChevronRight size={12} className={`transition-transform ${collapsed["Operations"] ? "" : "rotate-90"}`} />
            </button>
            {!collapsed["Operations"] && (
              <div className="space-y-1">
                {operationsEnabled && (
                  <NavLink to="/operations" className={({ isActive }) => `group ml-2 flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${isActive ? "bg-gradient-to-r from-saffron-500 to-saffron-600 text-white shadow-lg shadow-saffron-500/25" : "text-royal-200 hover:bg-white/10 hover:text-white hover:translate-x-1"}`}>
                    <Landmark size={16} /> Trust operations
                  </NavLink>
                )}
                {approvalsEnabled && (
                  <NavLink to="/operations/approvals" className={({ isActive }) => `group ml-2 flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${isActive ? "bg-gradient-to-r from-saffron-500 to-saffron-600 text-white shadow-lg shadow-saffron-500/25" : "text-royal-200 hover:bg-white/10 hover:text-white hover:translate-x-1"}`}>
                    <CheckSquare size={16} /> Approvals
                  </NavLink>
                )}
                {automationEnabled && (
                  <NavLink to="/operations/automation" className={({ isActive }) => `group ml-2 flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${isActive ? "bg-gradient-to-r from-saffron-500 to-saffron-600 text-white shadow-lg shadow-saffron-500/25" : "text-royal-200 hover:bg-white/10 hover:text-white hover:translate-x-1"}`}>
                    <Bot size={16} /> Automation
                  </NavLink>
                )}
                {operationsEnabled && (
                  <>
                    <NavLink to="/operations/reports" className={({ isActive }) => `group ml-2 flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${isActive ? "bg-gradient-to-r from-saffron-500 to-saffron-600 text-white shadow-lg shadow-saffron-500/25" : "text-royal-200 hover:bg-white/10 hover:text-white hover:translate-x-1"}`}>
                      <BarChart3 size={16} /> Reports
                    </NavLink>
                    <NavLink to="/operations/audit" className={({ isActive }) => `group ml-2 flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${isActive ? "bg-gradient-to-r from-saffron-500 to-saffron-600 text-white shadow-lg shadow-saffron-500/25" : "text-royal-200 hover:bg-white/10 hover:text-white hover:translate-x-1"}`}>
                      <History size={16} /> Audit & health
                    </NavLink>
                  </>
                )}
                {operationsEnabled && (
                  <NavLink to="/operations/trusts" className={({ isActive }) => `group ml-2 flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${isActive ? "bg-gradient-to-r from-saffron-500 to-saffron-600 text-white shadow-lg shadow-saffron-500/25" : "text-royal-200 hover:bg-white/10 hover:text-white hover:translate-x-1"}`}>
                    <Building2 size={16} /> Trusts
                  </NavLink>
                )}
                {fundsEnabled && (
                  <NavLink to="/operations/funds" className={({ isActive }) => `group ml-2 flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${isActive ? "bg-gradient-to-r from-saffron-500 to-saffron-600 text-white shadow-lg shadow-saffron-500/25" : "text-royal-200 hover:bg-white/10 hover:text-white hover:translate-x-1"}`}>
                    <Landmark size={16} /> Funds
                  </NavLink>
                )}
                {invoicesEnabled && (
                  <NavLink to="/operations/invoices" className={({ isActive }) => `group ml-2 flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${isActive ? "bg-gradient-to-r from-saffron-500 to-saffron-600 text-white shadow-lg shadow-saffron-500/25" : "text-royal-200 hover:bg-white/10 hover:text-white hover:translate-x-1"}`}>
                    <FileText size={16} /> Invoices
                  </NavLink>
                )}
                {payrollEnabled && (
                  <NavLink to="/operations/payroll" className={({ isActive }) => `group ml-2 flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${isActive ? "bg-gradient-to-r from-saffron-500 to-saffron-600 text-white shadow-lg shadow-saffron-500/25" : "text-royal-200 hover:bg-white/10 hover:text-white hover:translate-x-1"}`}>
                    <WalletCards size={16} /> Payroll
                  </NavLink>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="relative z-10 p-3 mt-auto" />
    </nav>
  );
}
