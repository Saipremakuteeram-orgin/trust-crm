import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Download, BookOpen, TrendingUp, AlertCircle } from "lucide-react";
import { useToast } from "../components/Toast";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function TrialBalance() {
  const { addToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/reports/trial-balance");
      setData(res.data.result);
    } catch {
      addToast("Failed to load trial balance", "error");
    }
    setLoading(false);
  }
  useEffect(load, []);

  function exportToExcel() {
    if (!data?.accounts?.length) return;
    const headers = ["Account Code", "Account Name", "Type", "Total Debit", "Total Credit", "Balance"];
    const rows = data.accounts.map(a => [
      a.account_code,
      a.name,
      a.type,
      a.total_debit,
      a.total_credit,
      a.balance
    ]);
    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trial-balance-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addToast("Trial balance exported", "success");
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BookOpen className="text-royal-600" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Trial Balance</h1>
              <p className="text-sm text-stone-500">Verify that total debits equal total credits</p>
            </div>
          </div>
          {data?.accounts?.length > 0 && (
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={exportToExcel}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
              <Download size={18} /> Export CSV
            </motion.button>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
            <p>Loading trial balance...</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            {data?.accounts?.length === 0 ? (
              <div className="p-12 text-center text-stone-400">
                <p>No accounts or transactions found. Create accounts and journal entries to see the trial balance.</p>
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-stone-100 bg-stone-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Total Debits</div>
                        <div className="text-lg font-bold text-stone-900">{fmt(data?.total_debit)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Total Credits</div>
                        <div className="text-lg font-bold text-stone-900">{fmt(data?.total_credit)}</div>
                      </div>
                    </div>
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${data?.is_balanced ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      {data?.is_balanced ? <TrendingUp size={20} /> : <AlertCircle size={20} />}
                      <span className="text-sm font-semibold">{data?.is_balanced ? "Balanced" : "Not Balanced"}</span>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-stone-400 uppercase tracking-wider bg-stone-50">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Code</th>
                        <th className="py-3 px-4 font-semibold">Account Name</th>
                        <th className="py-3 px-4 font-semibold">Type</th>
                        <th className="py-3 px-4 font-semibold text-right">Total Debit</th>
                        <th className="py-3 px-4 font-semibold text-right">Total Credit</th>
                        <th className="py-3 px-4 font-semibold text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {data?.accounts?.map((account) => (
                        <tr key={account.account_id} className="hover:bg-stone-50">
                          <td className="py-3 px-4 text-stone-600 font-mono text-xs">{account.account_code}</td>
                          <td className="py-3 px-4 text-stone-800 font-medium">{account.name}</td>
                          <td className="py-3 px-4">
                            <span className="text-xs font-medium text-stone-500 capitalize">{account.type}</span>
                          </td>
                          <td className="py-3 px-4 text-right text-stone-700">{fmt(account.total_debit)}</td>
                          <td className="py-3 px-4 text-right text-stone-700">{fmt(account.total_credit)}</td>
                          <td className={`py-3 px-4 text-right font-semibold ${Number(account.balance) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                            {fmt(account.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
