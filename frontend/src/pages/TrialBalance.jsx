import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Download, RefreshCw, FileText, TrendingUp } from "lucide-react";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function TrialBalance() {
  const [data, setData] = useState([]);
  const [totals, setTotals] = useState({ total_debit: 0, total_credit: 0 });
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/trial-balance");
      setData(res.data.result || []);
      setTotals(res.data.totals || { total_debit: 0, total_credit: 0 });
    } catch {
      // silent
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function exportCSV() {
    if (!data.length) return;
    const headers = ["Account Code", "Account Name", "Type", "Debit", "Credit"];
    const rows = data.map(row => [row.account_code || "", row.name, row.type, row.debit || 0, row.credit || 0]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trial-balance.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const grouped = data.reduce((acc, row) => {
    if (!acc[row.type]) acc[row.type] = [];
    acc[row.type].push(row);
    return acc;
  }, {});

  const typeOrder = ["asset", "liability", "equity", "income", "expense"];
  const typeLabels = { asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses" };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="text-royal-600" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Trial Balance</h1>
              <p className="text-sm text-stone-500">Summary of all account balances</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={load}
              className="flex items-center gap-2 border-2 border-stone-200 hover:border-saffron-400 text-stone-600 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
              <RefreshCw size={18} /> Refresh
            </motion.button>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={exportCSV}
              className="flex items-center gap-2 bg-saffron-500 hover:bg-saffron-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
              <Download size={18} /> Export CSV
            </motion.button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
            <p>Loading trial balance...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
            <FileText size={48} className="mx-auto mb-4 opacity-30" />
            <p>No accounts found. Add accounts and journal entries to see the trial balance.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {typeOrder.filter(t => grouped[t]).map(type => (
              <div key={type} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                <div className="p-4 border-b border-stone-100 bg-stone-50">
                  <h2 className="text-sm font-semibold text-stone-700">{typeLabels[type] || type}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-stone-400 uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Code</th>
                        <th className="py-3 px-4 font-semibold">Account Name</th>
                        <th className="py-3 px-4 font-semibold text-right">Debit</th>
                        <th className="py-3 px-4 font-semibold text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {grouped[type].map((row) => (
                        <tr key={row.account_id} className="hover:bg-stone-50">
                          <td className="py-3 px-4 font-mono text-stone-500">{row.account_code || "-"}</td>
                          <td className="py-3 px-4 text-stone-800">{row.name}</td>
                          <td className="py-3 px-4 text-right text-rose-700">{row.debit > 0 ? fmt(row.debit) : "-"}</td>
                          <td className="py-3 px-4 text-right text-emerald-700">{row.credit > 0 ? fmt(row.credit) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <div className="bg-white rounded-2xl border-2 border-saffron-200 overflow-hidden">
              <div className="p-4 bg-saffron-50 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div>
                    <div className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Total Debit</div>
                    <div className="text-lg font-bold text-rose-700">{fmt(totals.total_debit)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Total Credit</div>
                    <div className="text-lg font-bold text-emerald-700">{fmt(totals.total_credit)}</div>
                  </div>
                </div>
                <div className={`px-4 py-2 rounded-xl text-sm font-semibold ${Math.abs(totals.total_debit - totals.total_credit) < 0.01 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {Math.abs(totals.total_debit - totals.total_credit) < 0.01 ? 'Balanced' : 'Out of Balance'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
