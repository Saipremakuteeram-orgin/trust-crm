import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "./lib/AuthContext";

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

export default function App() {
  return (
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
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
