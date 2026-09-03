import MobileShell from "../MobileShell";
import MobileCard from "../components/MobileCard";
import { Scale } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function MobileBankReconciliation() {
  const navigate = useNavigate();
  return (
    <MobileShell title="Bank Reconciliation" showBack>
      <div className="p-4 space-y-3">
        <MobileCard>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-royal-50 text-royal-600 flex items-center justify-center"><Scale size={22} /></div>
            <div>
              <div className="text-base font-bold text-stone-800">Reconcile on desktop</div>
              <p className="text-xs text-stone-500 mt-0.5">Matching bank statements to ledger entries is easier on a larger screen.</p>
            </div>
          </div>
          <button onClick={() => navigate("/dashboard")} className="mt-3 w-full text-sm font-semibold py-2.5 rounded-xl bg-royal-600 text-white active:opacity-80">
            Go to dashboard
          </button>
        </MobileCard>
        <MobileCard>
          <p className="text-xs text-stone-600">For full reconciliation, open the desktop Bank Reconciliation page.</p>
        </MobileCard>
      </div>
    </MobileShell>
  );
}
