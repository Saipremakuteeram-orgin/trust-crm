import { useMemo } from "react";
import { useAuth } from "../../lib/AuthContext";
import MoreGrid from "../components/MoreGrid";

const GROUPS = [
  {
    title: "Tools",
    items: [
      { to: "/mobile/functions", label: "Functions & Budget", icon: () => "🎉" },
      { to: "/mobile/recurring", label: "Recurring", icon: () => "🔄" },
      { to: "/mobile/whatsapp", label: "WhatsApp", icon: () => "💬" },
    ],
  },
  {
    title: "Communication",
    items: [
      { to: "/mobile/mail", label: "Mail", icon: () => "📧" },
      { to: "/mobile/file-send", label: "Send File", icon: () => "📤" },
      { to: "/mobile/drive", label: "Drive", icon: () => "📁" },
    ],
  },
  {
    title: "Admin",
    items: [
      { to: "/mobile/users", label: "Users", icon: () => "🔐", roles: ["admin"] },
      { to: "/mobile/backup", label: "Backup", icon: () => "💾", roles: ["admin"] },
    ],
  },
];

export default function MobileMore() {
  const { profile } = useAuth();
  const role = profile?.role || "viewer";
  const groups = useMemo(() => GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => !it.roles || it.roles.includes(role)),
  })).filter((g) => g.items.length > 0), [role]);

  return (
    <div className="p-4">
      <MoreGrid groups={groups} />
    </div>
  );
}
