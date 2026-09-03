import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../lib/AuthContext";
import { getIsMobile } from "./hooks";

const MobileLogin = lazy(() => import("./pages/MobileLogin"));
const MobileHome = lazy(() => import("./pages/MobileHome"));
const MobileMoney = lazy(() => import("./pages/MobileMoney"));
const MobilePeople = lazy(() => import("./pages/MobilePeople"));
const MobileInbox = lazy(() => import("./pages/MobileInbox"));
const MobileMore = lazy(() => import("./pages/MobileMore"));
const MobileFunctions = lazy(() => import("./pages/MobileFunctions"));
const MobileFunctionDetail = lazy(() => import("./pages/MobileFunctionDetail"));
const MobileRecurring = lazy(() => import("./pages/MobileRecurring"));
const MobileWhatsApp = lazy(() => import("./pages/MobileWhatsApp"));
const MobileMail = lazy(() => import("./pages/MobileMail"));
const MobileFileSend = lazy(() => import("./pages/MobileFileSend"));
const MobileDrive = lazy(() => import("./pages/MobileDrive"));
const MobileUsers = lazy(() => import("./pages/MobileUsers"));
const MobileBackupLogs = lazy(() => import("./pages/MobileBackupLogs"));
const MobileNotAvailable = lazy(() => import("./pages/MobileNotAvailable"));

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
  if (!session) return <Navigate to="/mobile/login" replace />;
  return children;
}

function DesktopRedirect() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!getIsMobile()) {
      const path = window.location.pathname.replace(/^\/mobile/, "") || "/dashboard";
      navigate(path, { replace: true });
    } else {
      setReady(true);
    }
  }, [navigate]);
  if (!ready) return <PageLoader />;
  return null;
}

export default function MobileApp() {
  const location = useLocation();
  return (
    <DesktopRedirect>
      <Suspense fallback={<PageLoader />}>
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<MobileLogin />} />
          <Route path="/" element={<Navigate to="/mobile/home" replace />} />
          <Route path="/home" element={<Protected><MobileHome /></Protected>} />
          <Route path="/money" element={<Protected><MobileMoney /></Protected>} />
          <Route path="/people" element={<Protected><MobilePeople /></Protected>} />
          <Route path="/inbox" element={<Protected><MobileInbox /></Protected>} />
          <Route path="/more" element={<Protected><MobileMore /></Protected>} />
          <Route path="/functions" element={<Protected><MobileFunctions /></Protected>} />
          <Route path="/functions/:id" element={<Protected><MobileFunctionDetail /></Protected>} />
          <Route path="/recurring" element={<Protected><MobileRecurring /></Protected>} />
          <Route path="/whatsapp" element={<Protected><MobileWhatsApp /></Protected>} />
          <Route path="/mail" element={<Protected><MobileMail /></Protected>} />
          <Route path="/file-send" element={<Protected><MobileFileSend /></Protected>} />
          <Route path="/drive" element={<Protected><MobileDrive /></Protected>} />
          <Route path="/users" element={<Protected><MobileUsers /></Protected>} />
          <Route path="/backup" element={<Protected><MobileBackupLogs /></Protected>} />
          <Route path="/spreadsheet" element={<Protected><MobileNotAvailable /></Protected>} />
          <Route path="/trial-balance" element={<Protected><MobileNotAvailable /></Protected>} />
          <Route path="/reports" element={<Protected><MobileNotAvailable /></Protected>} />
          <Route path="/bank-reconciliation" element={<Protected><MobileNotAvailable /></Protected>} />
          <Route path="/ledger" element={<Protected><MobileNotAvailable /></Protected>} />
          <Route path="/ledger/:accountId" element={<Protected><MobileNotAvailable /></Protected>} />
          <Route path="*" element={<Navigate to="/mobile/home" replace />} />
        </Routes>
      </Suspense>
    </DesktopRedirect>
  );
}
