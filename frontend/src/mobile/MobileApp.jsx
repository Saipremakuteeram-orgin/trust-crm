import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../lib/AuthContext";
import { getIsMobile } from "./hooks/useIsMobile";

const MobileLogin = lazy(() => import("./pages/MobileLogin"));
const MobileDashboard = lazy(() => import("./pages/MobileDashboard"));
const MobileTransactions = lazy(() => import("./pages/MobileTransactions"));
const MobileTransactionDetail = lazy(() => import("./pages/MobileTransactionDetail"));
const MobileContacts = lazy(() => import("./pages/MobileContacts"));
const MobileContactDetail = lazy(() => import("./pages/MobileContactDetail"));
const MobileRecurring = lazy(() => import("./pages/MobileRecurring"));
const MobileAccounts = lazy(() => import("./pages/MobileAccounts"));
const MobileJournal = lazy(() => import("./pages/MobileJournal"));
const MobileTrialBalanceSummary = lazy(() => import("./pages/MobileTrialBalanceSummary"));
const MobileLedgerSummary = lazy(() => import("./pages/MobileLedgerSummary"));
const MobileReceipts = lazy(() => import("./pages/MobileReceipts"));
const MobileFunctions = lazy(() => import("./pages/MobileFunctions"));
const MobileFunctionDetail = lazy(() => import("./pages/MobileFunctionDetail"));
const MobileGroups = lazy(() => import("./pages/MobileGroups"));
const MobileReportSummary = lazy(() => import("./pages/MobileReportSummary"));
const MobileSpreadsheetSummary = lazy(() => import("./pages/MobileSpreadsheetSummary"));
const MobileComplianceSummary = lazy(() => import("./pages/MobileComplianceSummary"));
const MobileTrustees = lazy(() => import("./pages/MobileTrustees"));
const MobileBeneficiaries = lazy(() => import("./pages/MobileBeneficiaries"));
const MobileWhatsApp = lazy(() => import("./pages/MobileWhatsApp"));
const MobileFileSend = lazy(() => import("./pages/MobileFileSend"));
const MobileMail = lazy(() => import("./pages/MobileMail"));
const MobileDrive = lazy(() => import("./pages/MobileDrive"));
const MobileUsers = lazy(() => import("./pages/MobileUsers"));
const MobileActivityLog = lazy(() => import("./pages/MobileActivityLog"));
const MobileBackupLogs = lazy(() => import("./pages/MobileBackupLogs"));
const MobileBankReconciliation = lazy(() => import("./pages/MobileBankReconciliation"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="w-10 h-10 rounded-full border-2 border-saffron-200 border-t-saffron-500" />
    </div>
  );
}

function Protected({ children }) {
  const { session } = useAuth();
  if (session === undefined) return <PageLoader />;
  if (!session) return <Navigate to="/m/login" replace />;
  return children;
}

function DesktopOnlyRedirect() {
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!getIsMobile()) {
      const path = window.location.pathname.replace(/^\/m/, "") || "/dashboard";
      navigate(path, { replace: true });
    } else {
      setDone(true);
    }
  }, [navigate]);
  if (!done) return <PageLoader />;
  return null;
}

export default function MobileApp() {
  const location = useLocation();
  return (
    <DesktopOnlyRedirect>
      <Suspense fallback={<PageLoader />}>
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<MobileLogin />} />
          <Route path="/" element={<Navigate to="/m/dashboard" replace />} />
          <Route path="/dashboard" element={<Protected><MobileDashboard /></Protected>} />
          <Route path="/transactions" element={<Protected><MobileTransactions /></Protected>} />
          <Route path="/transactions/:id" element={<Protected><MobileTransactionDetail /></Protected>} />
          <Route path="/contacts" element={<Protected><MobileContacts /></Protected>} />
          <Route path="/contacts/:id" element={<Protected><MobileContactDetail /></Protected>} />
          <Route path="/recurring" element={<Protected><MobileRecurring /></Protected>} />
          <Route path="/accounts" element={<Protected><MobileAccounts /></Protected>} />
          <Route path="/journal" element={<Protected><MobileJournal /></Protected>} />
          <Route path="/trial-balance" element={<Protected><MobileTrialBalanceSummary /></Protected>} />
          <Route path="/ledger/:accountId" element={<Protected><MobileLedgerSummary /></Protected>} />
          <Route path="/ledger" element={<Protected><MobileLedgerSummary /></Protected>} />
          <Route path="/receipts" element={<Protected><MobileReceipts /></Protected>} />
          <Route path="/bank-reconciliation" element={<Protected><MobileBankReconciliation /></Protected>} />
          <Route path="/functions" element={<Protected><MobileFunctions /></Protected>} />
          <Route path="/functions/:id" element={<Protected><MobileFunctionDetail /></Protected>} />
          <Route path="/groups" element={<Protected><MobileGroups /></Protected>} />
          <Route path="/reports" element={<Protected><MobileReportSummary /></Protected>} />
          <Route path="/spreadsheet" element={<Protected><MobileSpreadsheetSummary /></Protected>} />
          <Route path="/compliance" element={<Protected><MobileComplianceSummary /></Protected>} />
          <Route path="/trustees" element={<Protected><MobileTrustees /></Protected>} />
          <Route path="/beneficiaries" element={<Protected><MobileBeneficiaries /></Protected>} />
          <Route path="/whatsapp" element={<Protected><MobileWhatsApp /></Protected>} />
          <Route path="/file-send" element={<Protected><MobileFileSend /></Protected>} />
          <Route path="/mail" element={<Protected><MobileMail /></Protected>} />
          <Route path="/drive" element={<Protected><MobileDrive /></Protected>} />
          <Route path="/users" element={<Protected><MobileUsers /></Protected>} />
          <Route path="/activity" element={<Protected><MobileActivityLog /></Protected>} />
          <Route path="/backup" element={<Protected><MobileBackupLogs /></Protected>} />
          <Route path="*" element={<Navigate to="/m/dashboard" replace />} />
        </Routes>
      </Suspense>
    </DesktopOnlyRedirect>
  );
}
