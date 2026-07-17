import { useEffect, useState } from "react";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Wallet, Landmark } from "lucide-react";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function Dashboard() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api.get("/dashboard/summary").then((res) => setSummary(res.data.result));
  }, []);

  if (!summary) return <AppLayout><p className="text-stone-500">Loading...</p></AppLayout>;
  const { cash, digital } = summary;

  return (
    <AppLayout>
      <h1 className="text-2xl font-semibold text-stone-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm">
          <div className="inline-flex p-2 rounded-lg bg-emerald-50 text-emerald-700 mb-3"><Wallet size={18} /></div>
          <div className="text-sm text-stone-500">Cash in Hand</div>
          <div className="text-xl font-semibold text-stone-900 mt-1">{fmt(cash?.cash_in_hand)}</div>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm">
          <div className="inline-flex p-2 rounded-lg bg-blue-50 text-blue-700 mb-3"><Landmark size={18} /></div>
          <div className="text-sm text-stone-500">Digital Balance</div>
          <div className="text-xl font-semibold text-stone-900 mt-1">{fmt(digital?.digital_balance)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm">
          <h2 className="text-sm font-medium text-stone-700 mb-3">Cash Flow</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-stone-500">Opening balance</span><span>{fmt(cash?.opening_balance)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Cash in</span><span className="text-emerald-600">+{fmt(cash?.cash_in)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Cash out</span><span className="text-red-600">-{fmt(cash?.cash_out)}</span></div>
            <div className="flex justify-between font-medium border-t pt-2"><span>Cash in hand</span><span>{fmt(cash?.cash_in_hand)}</span></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm">
          <h2 className="text-sm font-medium text-stone-700 mb-3">Digital Flow</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-stone-500">Digital in</span><span className="text-emerald-600">+{fmt(digital?.digital_in)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Digital out</span><span className="text-red-600">-{fmt(digital?.digital_out)}</span></div>
            <div className="flex justify-between font-medium border-t pt-2"><span>Balance</span><span>{fmt(digital?.digital_balance)}</span></div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
