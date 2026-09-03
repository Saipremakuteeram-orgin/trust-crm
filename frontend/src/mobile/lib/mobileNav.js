import {
  LayoutDashboard, ArrowDownCircle, Users, Shield, History, Table2, UsersRound,
  FolderCog, Database, FileBarChart, Send, Mail, Repeat, PartyPopper, MessageCircle,
  BookOpen, TrendingUp, ScrollText, Heart, CalendarDays, Receipt, Scale, MoreHorizontal
} from "lucide-react";

export const primaryTabs = [
  { to: "/m/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/m/transactions", label: "Money", icon: ArrowDownCircle },
  { to: "/m/contacts", label: "Contacts", icon: Users },
  { to: "/m/reports", label: "Reports", icon: FileBarChart, roles: ["admin", "accountant"] },
  { to: "/m/more", label: "More", icon: MoreHorizontal },
];

export const moreGroups = [
  {
    title: "Money & Accounting",
    items: [
      { to: "/m/recurring", label: "Recurring", icon: Repeat, roles: ["admin", "accountant"] },
      { to: "/m/accounts", label: "Chart of Accounts", icon: BookOpen, roles: ["admin", "accountant"] },
      { to: "/m/journal", label: "Journal Entries", icon: BookOpen, roles: ["admin", "accountant"] },
      { to: "/m/trial-balance", label: "Trial Balance", icon: TrendingUp, roles: ["admin", "accountant"] },
      { to: "/m/ledger", label: "General Ledger", icon: ScrollText, roles: ["admin", "accountant"] },
      { to: "/m/receipts", label: "Receipts", icon: Receipt, roles: ["admin", "accountant"] },
      { to: "/m/bank-reconciliation", label: "Bank Reconciliation", icon: Scale, roles: ["admin", "accountant"] },
    ],
  },
  {
    title: "Trust & Functions",
    items: [
      { to: "/m/functions", label: "Functions & Budget", icon: PartyPopper, roles: ["admin", "accountant"] },
      { to: "/m/trustees", label: "Trustees", icon: Shield, roles: ["admin", "accountant"] },
      { to: "/m/beneficiaries", label: "Beneficiaries", icon: Heart, roles: ["admin", "accountant"] },
      { to: "/m/compliance", label: "Compliance", icon: CalendarDays, roles: ["admin", "accountant"] },
    ],
  },
  {
    title: "Communication",
    items: [
      { to: "/m/whatsapp", label: "WhatsApp", icon: MessageCircle, roles: ["admin", "accountant"] },
      { to: "/m/file-send", label: "Send File", icon: Send },
      { to: "/m/mail", label: "Mail", icon: Mail },
    ],
  },
  {
    title: "Tools & Admin",
    items: [
      { to: "/m/spreadsheet", label: "Spreadsheet", icon: Table2, roles: ["admin", "accountant"] },
      { to: "/m/drive", label: "Common Drive", icon: FolderCog, roles: ["admin", "accountant"] },
      { to: "/m/groups", label: "Groups", icon: UsersRound },
      { to: "/m/users", label: "User Management", icon: Shield, roles: ["admin"] },
      { to: "/m/backup", label: "Backup & Restore", icon: Database, roles: ["admin"] },
      { to: "/m/activity", label: "Activity Log", icon: History },
    ],
  },
];

export function isVisible(item, role) {
  return !item.roles || item.roles.includes(role);
}

export function getVisiblePrimary(role) {
  return primaryTabs.filter((i) => isVisible(i, role));
}

export function getAllVisibleMore(role) {
  return moreGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => isVisible(i, role)) }))
    .filter((g) => g.items.length > 0);
}
