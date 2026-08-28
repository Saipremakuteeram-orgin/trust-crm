import { useState, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, ArrowDownCircle, Users, Shield, History, Table2, UsersRound, FolderCog, Database, FileBarChart, Send, Mail, Repeat, PartyPopper, MessageCircle, GripVertical, BookOpen, TrendingUp, ScrollText, Heart, CalendarDays, Receipt, Scale, FolderTree, FileText, BarChart3 } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import api from "../lib/api";

const allItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowDownCircle },
  { to: "/recurring", label: "Recurring", icon: Repeat },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/groups", label: "Groups", icon: UsersRound },
  { to: "/activity", label: "Activity Log", icon: History },
  { to: "/file-send", label: "Send File", icon: Send },
  { to: "/mail", label: "Mail", icon: Mail },
  { to: "/reports", label: "Reports", icon: FileBarChart, roles: ["admin", "accountant"] },
  { to: "/functions", label: "Functions & Budget", icon: PartyPopper, roles: ["admin", "accountant"] },
  { to: "/spreadsheet", label: "Spreadsheet", icon: Table2, roles: ["admin", "accountant"] },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle, roles: ["admin", "accountant"] },
  { to: "/drive", label: "Common Drive", icon: FolderCog, roles: ["admin", "accountant"] },
  { to: "/users", label: "User Management", icon: Shield, roles: ["admin"] },
  { to: "/backup", label: "Backup & Restore", icon: Database, roles: ["admin"] },
  { to: "/accounts", label: "Chart of Accounts", icon: BookOpen, roles: ["admin", "accountant"] },
  { to: "/journal", label: "Journal Entries", icon: BookOpen, roles: ["admin", "accountant"] },
  { to: "/trial-balance", label: "Trial Balance", icon: TrendingUp, roles: ["admin", "accountant"] },
  { to: "/ledger", label: "General Ledger", icon: ScrollText, roles: ["admin", "accountant"] },
  { to: "/trustees", label: "Trustees", icon: Shield, roles: ["admin", "accountant"] },
  { to: "/beneficiaries", label: "Beneficiaries", icon: Heart, roles: ["admin", "accountant"] },
  { to: "/compliance", label: "Compliance", icon: CalendarDays, roles: ["admin", "accountant"] },
  { to: "/receipts", label: "Receipts", icon: Receipt, roles: ["admin", "accountant"] },
  { to: "/bank-reconciliation", label: "Bank Reconciliation", icon: Scale, roles: ["admin", "accountant"] },
];

function isVisible(item, role) {
  return !item.roles || item.roles.includes(role);
}

export default function Nav() {
  const { profile } = useAuth();
  const role = profile?.role || "viewer";
  const canReorder = role === "admin" || role === "accountant";

  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragIndex, setDragIndex] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/profile/nav-order')
      .then(({ data }) => {
        if (!cancelled) {
          setOrder(data?.order || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const visibleDefault = allItems.filter((item) => isVisible(item, role));
  const visiblePaths = new Set(visibleDefault.map((i) => i.to));
  const savedVisible = (order || []).filter((to) => visiblePaths.has(to));
  const renderedOrder = savedVisible.length > 0
    ? savedVisible
    : visibleDefault.map((i) => i.to);

  const itemByPath = Object.fromEntries(allItems.map((i) => [i.to, i]));

  const saveOrder = useCallback(async (newOrder) => {
    setOrder(newOrder);
    try {
      await api.put('/profile/nav-order', { order: newOrder });
    } catch (err) {
      console.error('Failed to save nav order:', err);
    }
  }, []);

  const handleDragStart = (index) => (e) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragIndex(index);
  };

  const handleDragOver = (e, _index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (index) => (e) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      return;
    }
    const newOrder = [...renderedOrder];
    const [moved] = newOrder.splice(dragIndex, 1);
    newOrder.splice(index, 0, moved);
    setDragIndex(null);
    saveOrder(newOrder);
  };

  const handleReset = async () => {
    await saveOrder([]);
  };

  const handleToggleEdit = () => {
    setEditing((prev) => !prev);
  };

  const navItems = renderedOrder.map((to) => itemByPath[to]).filter(Boolean);

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
        {canReorder && (
          <div className="flex gap-2">
            <button
              onClick={handleToggleEdit}
              className="flex-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              {editing ? 'Done' : 'Reorder'}
            </button>
            {editing && (
              <button
                onClick={handleReset}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                Reset to default
              </button>
            )}
          </div>
        )}
      </div>

      <div className="relative z-10 w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="relative z-10 flex-1 px-3 py-4 space-y-1 stagger-children">
        {loading ? (
          <div className="text-sm text-royal-300 px-4">Loading...</div>
        ) : navItems.length === 0 ? (
          <div className="text-sm text-royal-300 px-4">No items</div>
        ) : (
          navItems.map(({ to, label, icon: Icon }, index) => (
            <div
              key={to}
              onDragOver={editing ? (e) => handleDragOver(e, index) : undefined}
              onDrop={editing ? handleDrop(index) : undefined}
              className={`flex items-center ${editing ? '' : ''}`}
            >
              {editing && (
                <span
                  className="text-royal-300 hover:text-white transition-colors mr-1"
                  onDragStart={handleDragStart(index)}
                  draggable
                >
                  <GripVertical size={16} />
                </span>
              )}
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-gradient-to-r from-saffron-500 to-saffron-600 text-white shadow-lg shadow-saffron-500/25"
                      : "text-royal-200 hover:bg-white/10 hover:text-white hover:translate-x-1"
                  } animate-fade-in-up`
                }
              >
                <Icon size={18} className="transition-transform group-hover:scale-110" /> {label}
              </NavLink>
            </div>
          ))
        )}
      </div>

      <div className="relative z-10 p-3 mt-auto" />
    </nav>
  );
}
