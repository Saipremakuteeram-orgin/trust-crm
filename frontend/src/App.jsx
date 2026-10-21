import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "./lib/AuthContext";
import { ALL_TRUSTS_ID, OperationsProvider, useOperations } from "./lib/OperationsContext";
import { isOperationsEnabled } from "./lib/operationsFlags";
import AppLayout from "./components/AppLayout";
import MobileApp from "./mobile2/MobileApp";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Groups = lazy(() => import("./pages/Groups"));
const Users = lazy(() => import("./pages/Users"));
const ActivityLog = lazy(() => import("./pages/ActivityLog"));
const Spreadsheet = lazy(() => import("./pages/Spreadsheet"));
const DriveManager = lazy(() => import("./pages/DriveManager"));
const BackupLogs = lazy(() => import("./pages/BackupLogs"));
const Reports = lazy(() => import("./pages/Reports"));
const FileSend = lazy(() => import("./pages/FileSend"));
const Mail = lazy(() => import("./pages/Mail"));
const RecurringTransactions = lazy(() => import("./pages/RecurringTransactions"));
const Accounts = lazy(() => import("./pages/Accounts"));
const JournalEntries = lazy(() => import("./pages/JournalEntries"));
const TrialBalance = lazy(() => import("./pages/TrialBalance"));
const GeneralLedger = lazy(() => import("./pages/GeneralLedger"));
const Trustees = lazy(() => import("./pages/Trustees"));
const Beneficiaries = lazy(() => import("./pages/Beneficiaries"));
const Compliance = lazy(() => import("./pages/Compliance"));
const Receipts = lazy(() => import("./pages/Receipts"));
const BankReconciliation = lazy(() => import("./pages/BankReconciliation"));
const Functions = lazy(() => import("./pages/Functions"));
const WhatsApp = lazy(() => import("./pages/WhatsAppPage"));
const OperationsFunds = lazy(() => import("./pages/operations/OperationsFunds"));
const OperationsFundDetail = lazy(() => import("./pages/operations/OperationsFundDetail"));
const OperationsInvoices = lazy(() => import("./pages/operations/OperationsInvoices"));
const OperationsInvoiceDetail = lazy(() => import("./pages/operations/OperationsInvoiceDetail"));
const OperationsPayroll = lazy(() => import("./pages/operations/OperationsPayroll"));
const OperationsEmployees = lazy(() => import("./pages/operations/OperationsEmployees"));
const OperationsDashboard = lazy(() => import("./pages/operations/OperationsDashboard"));
const OperationsApprovals = lazy(() => import("./pages/operations/OperationsApprovals"));
const OperationsAutomation = lazy(() => import("./pages/operations/OperationsAutomation"));
const OperationsTrusts = lazy(() => import("./pages/operations/OperationsTrusts"));
const OperationsReports = lazy(() => import("./pages/operations/OperationsReports"));
const OperationsAudit = lazy(() => import("./pages/operations/OperationsAudit"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
        <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg">
          <img src="/logo.jpg" alt="Trust CRM" className="w-full h-full object-cover" />
        </motion.div>
        <div className="flex gap-1.5">
          <motion.div className="w-2 h-2 rounded-full bg-saffron-500"
            animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} />
          <motion.div className="w-2 h-2 rounded-full bg-saffron-500"
            animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }} />
          <motion.div className="w-2 h-2 rounded-full bg-saffron-500"
            animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }} />
        </div>
      </motion.div>
    </div>
  );
}

function Protected({ children }) {
  const { session } = useAuth();
  if (session === undefined) return <PageLoader />;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function AdminProtected({ children }) {
  const { profile } = useAuth();
  if (!profile) return null;
  if (profile.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}

function OperationsPage({ feature }) {
  const { enabled, trusts, selectedTrustId, setSelectedTrustId, loading, error } = useOperations();
  const featureEnabled = enabled && (!feature || isOperationsEnabled(feature));
  const featureFlags = {
    trusts: "ENABLE_OPERATIONS_TRUSTS",
    approvals: "ENABLE_OPERATIONS_APPROVALS",
    automationMonitor: "ENABLE_OPERATIONS_AUTOMATION_MONITOR",
  };

  return (
    <AppLayout>
      <div className="max-w-4xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-saffron-600">Operations</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">Trust operations</h1>
        </div>

        {!featureEnabled ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-lg font-semibold text-amber-900">{feature ? "This Operations surface is not enabled" : "Operations is not enabled"}</h2>
            <p className="mt-2 text-sm text-amber-800">
              {feature ? `Enable ${featureFlags[feature] || "the Operations feature flag"} to use this additive surface.` : "This additive module is currently disabled."} Existing Trust CRM routes remain available.
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-stone-900">Operations foundation</h2>
                <p className="mt-1 text-sm text-stone-500">
                  Trust context is ready for the upcoming Operations modules. All trusts is read-only.
                </p>
              </div>
              <label className="flex min-w-56 flex-col gap-1.5 text-sm font-medium text-stone-700">
                Trust context
                <select
                  aria-label="Operations trust context"
                  value={selectedTrustId}
                  onChange={(event) => setSelectedTrustId(event.target.value)}
                  disabled={loading}
                  className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-saffron-400 focus:ring-2 focus:ring-saffron-100"
                >
                  <option value={ALL_TRUSTS_ID}>All trusts (read-only)</option>
                  {trusts.map((trust) => (
                    <option key={trust.id} value={trust.id}>{trust.name}</option>
                  ))}
                </select>
              </label>
            </div>
            {loading && <p className="mt-4 text-sm text-stone-500">Loading trusts…</p>}
            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
            {!loading && !error && trusts.length === 0 && (
              <p className="mt-4 text-sm text-stone-500">No active Operations trusts are configured yet.</p>
            )}
          </section>
        )}
      </div>
    </AppLayout>
  );
}

function OperationsFeatureProtected({ feature, children }) {
  const { enabled } = useOperations();
  if (!enabled || !isOperationsEnabled(feature)) return <OperationsPage feature={feature} />;
  return children;
}

export default function App() {
  const location = useLocation();
  if (location.pathname.startsWith("/mobile")) {
    return (
      <OperationsProvider>
        <MobileApp />
      </OperationsProvider>
    );
  }
  return (
    <OperationsProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/transactions" element={<Protected><Transactions /></Protected>} />
        <Route path="/recurring" element={<Protected><RecurringTransactions /></Protected>} />
        <Route path="/functions" element={<Protected><Functions /></Protected>} />
        <Route path="/accounts" element={<Protected><Accounts /></Protected>} />
      <Route path="/journal" element={<Protected><JournalEntries /></Protected>} />
      <Route path="/trial-balance" element={<Protected><TrialBalance /></Protected>} />
      <Route path="/ledger/:accountId" element={<Protected><GeneralLedger /></Protected>} />
      <Route path="/trustees" element={<Protected><Trustees /></Protected>} />
      <Route path="/beneficiaries" element={<Protected><Beneficiaries /></Protected>} />
      <Route path="/compliance" element={<Protected><Compliance /></Protected>} />
      <Route path="/receipts" element={<Protected><Receipts /></Protected>} />
      <Route path="/bank-reconciliation" element={<Protected><BankReconciliation /></Protected>} />
      <Route path="/functions/:id" element={<Protected><Functions /></Protected>} />
        <Route path="/whatsapp" element={<Protected><WhatsApp /></Protected>} />
        <Route path="/contacts" element={<Protected><Contacts /></Protected>} />
        <Route path="/groups" element={<Protected><Groups /></Protected>} />
        <Route path="/users" element={<Protected><AdminProtected><Users /></AdminProtected></Protected>} />
        <Route path="/activity" element={<Protected><ActivityLog /></Protected>} />
        <Route path="/spreadsheet" element={<Protected><Spreadsheet /></Protected>} />
        <Route path="/drive" element={<Protected><DriveManager /></Protected>} />
        <Route path="/backup" element={<Protected><BackupLogs /></Protected>} />
        <Route path="/file-send" element={<Protected><FileSend /></Protected>} />
          <Route path="/mail" element={<Protected><Mail /></Protected>} />
          <Route path="/reports" element={<Protected><Reports /></Protected>} />
          <Route path="/operations" element={<Protected><OperationsFeatureProtected feature="trusts"><OperationsDashboard /></OperationsFeatureProtected></Protected>} />
          <Route path="/operations/approvals" element={<Protected><OperationsFeatureProtected feature="approvals"><OperationsApprovals /></OperationsFeatureProtected></Protected>} />
           <Route path="/operations/automation" element={<Protected><OperationsFeatureProtected feature="automationMonitor"><OperationsAutomation /></OperationsFeatureProtected></Protected>} />
           <Route path="/operations/reports" element={<Protected><OperationsFeatureProtected feature="trusts"><OperationsReports /></OperationsFeatureProtected></Protected>} />
           <Route path="/operations/audit" element={<Protected><OperationsFeatureProtected feature="trusts"><OperationsAudit /></OperationsFeatureProtected></Protected>} />
           <Route path="/operations/trusts" element={<Protected><OperationsFeatureProtected feature="trusts"><OperationsTrusts /></OperationsFeatureProtected></Protected>} />
          <Route path="/operations/funds" element={<Protected><OperationsFunds /></Protected>} />
          <Route path="/operations/funds/:id" element={<Protected><OperationsFundDetail /></Protected>} />
           <Route path="/operations/invoices" element={<Protected><OperationsInvoices /></Protected>} />
           <Route path="/operations/invoices/:id" element={<Protected><OperationsInvoiceDetail /></Protected>} />
           <Route path="/operations/payroll" element={<Protected><OperationsPayroll /></Protected>} />
           <Route path="/operations/payroll/employees" element={<Protected><OperationsEmployees /></Protected>} />
           <Route path="/operations/*" element={<Protected><OperationsPage /></Protected>} />
        <Route path="/mobile/*" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </OperationsProvider>
  );
}
