import { NavLink } from "react-router-dom";
import { Activity, Bot, Building2, CheckSquare, FileText, Landmark, WalletCards } from "lucide-react";
import AppLayout from "../AppLayout";
import { useAuth } from "../../lib/AuthContext";
import { isOperationsEnabled } from "../../lib/operationsFlags";
import { useOperations } from "../../lib/OperationsContext";
import TrustSelector from "./TrustSelector";
import { getRoleCapabilities } from "../../lib/operationsApi";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron-300 focus-visible:ring-offset-2";

function DisabledState({ feature }) {
  const flag = feature ? `ENABLE_OPERATIONS_${feature}` : "the Operations feature flag";
  return (
    <AppLayout>
      <section className="max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Operations</p>
        <h1 className="mt-2 text-xl font-bold text-amber-900">This Operations surface is not enabled</h1>
        <p className="mt-2 text-sm leading-6 text-amber-800">
          Enable {flag} to use this additive Operations surface. Existing Trust CRM routes remain available.
        </p>
      </section>
    </AppLayout>
  );
}

function navigationClass({ isActive }) {
  return `inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${focusRing} ${isActive ? "bg-royal-700 text-white shadow-sm" : "text-stone-600 hover:bg-stone-100 hover:text-royal-700"}`;
}

function OperationsNavigation() {
  const links = [
    { to: "/operations", label: "Dashboard", icon: Landmark, enabled: isOperationsEnabled("trusts"), end: true },
    { to: "/operations/approvals", label: "Approvals", icon: CheckSquare, enabled: isOperationsEnabled("approvals") },
    { to: "/operations/automation", label: "Automation", icon: Bot, enabled: isOperationsEnabled("automationMonitor") },
    { to: "/operations/trusts", label: "Trusts", icon: Building2, enabled: isOperationsEnabled("trusts") },
    { to: "/operations/funds", label: "Funds", icon: Landmark, enabled: isOperationsEnabled("funds") },
    { to: "/operations/invoices", label: "Invoices", icon: FileText, enabled: isOperationsEnabled("invoices") },
    { to: "/operations/payroll", label: "Payroll", icon: WalletCards, enabled: isOperationsEnabled("payroll") },
  ];

  return (
    <nav aria-label="Operations sections" className="flex flex-wrap gap-2 border-b border-stone-200 pb-4">
      {links.filter((link) => link.enabled).map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={navigationClass}>
          <Icon size={15} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function OperationsLayout({
  children,
  title,
  description,
  feature = "trusts",
  eyebrow = "Operations",
  actions,
}) {
  const { profile } = useAuth();
  const { enabled, trusts, selectedTrustId, setSelectedTrustId, loading, error } = useOperations();
  const role = profile?.role || "viewer";
  const capabilities = getRoleCapabilities(role);

  if (!enabled || !isOperationsEnabled(feature)) return <DisabledState feature={feature.toUpperCase()} />;

  return (
    <AppLayout>
      <div className="max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-saffron-600">{eyebrow}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">{title}</h1>
            {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>

        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <TrustSelector
              trusts={trusts}
              value={selectedTrustId}
              onChange={setSelectedTrustId}
              disabled={loading}
            />
            <div className="flex items-center gap-2 text-xs text-stone-500">
              <Activity size={14} className="text-royal-500" aria-hidden="true" />
              <span className="capitalize">{role} access</span>
              {!capabilities.canCreate && <span>· Read-only</span>}
            </div>
          </div>
          {loading && <p className="mt-3 text-xs text-stone-500" role="status">Loading trusts…</p>}
          {error && <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
          {!loading && !error && trusts.length === 0 && (
            <p className="mt-3 text-sm text-stone-500">No active Operations trusts are configured yet.</p>
          )}
        </section>

        <OperationsNavigation />
        {children}
      </div>
    </AppLayout>
  );
}
