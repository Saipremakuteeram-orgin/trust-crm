import { Routes, Route, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "./lib/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Contacts from "./pages/Contacts";
import Groups from "./pages/Groups";
import Users from "./pages/Users";
import ActivityLog from "./pages/ActivityLog";
import Spreadsheet from "./pages/Spreadsheet";
import DriveManager from "./pages/DriveManager";
import BackupLogs from "./pages/BackupLogs";
import Reports from "./pages/Reports";

function Protected({ children }) {
  const { session } = useAuth();
  if (session === undefined) return (
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
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/transactions" element={<Protected><Transactions /></Protected>} />
      <Route path="/contacts" element={<Protected><Contacts /></Protected>} />
      <Route path="/groups" element={<Protected><Groups /></Protected>} />
      <Route path="/users" element={<Protected><AdminProtected><Users /></AdminProtected></Protected>} />
      <Route path="/activity" element={<Protected><ActivityLog /></Protected>} />
      <Route path="/spreadsheet" element={<Protected><Spreadsheet /></Protected>} />
      <Route path="/drive" element={<Protected><DriveManager /></Protected>} />
      <Route path="/backup" element={<Protected><BackupLogs /></Protected>} />
      <Route path="/reports" element={<Protected><Reports /></Protected>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
