import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useParams } from "react-router-dom";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Download, BookOpen, ChevronRight } from "lucide-react";
import { useToast } from "../components/Toast";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function GeneralLedger() {
  const { accountId } = useParams();
  const { addToast } = useToast();
  const [data, setData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(!!accountId);

  async function loadAccounts() {
    try {
      const res = await api.get("/accounts");
      setAccounts(res.data.result?.flat || res.data.result || []);
    } catch {
      addToast("Failed to load accounts", "error");
    }
  }

  async function load() {
    setLoading(true);
    try {
      const ledgerRes = await api.get(`/ledger/${accountId}`);
      setData(ledgerRes.data.result);
      setAccount(accounts.find(a => a.id === accountId) || null);
    } catch {
      addToast("Failed to load ledger", "error");
    }
    setLoading(false);
  }
  useEffect(() => { loadAccounts(); }, []);
  useEffect(() => { if (accountId) load(); else setLoading(false); }, [accountId]);

  function exportToCSV() {
    if (!data?.lines?.length) return;
    const headers = ["Date", "Entry #", "Description", "Reference", "Debit", "Credit", "Balance"];
    const rows = data.lines.map(l => [
      l.journal_entries?.entry_date,
      l.journal_entries?.entry_number,
      l.journal_entries?.description,
      l.journal_entries?.reference || "",
      l.debit,
      l.credit,
      l.running_balance
    ]);
    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ledger-${account?.account_code || accountId}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addToast("Ledger exported", "success");
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BookOpen className="text-royal-600" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-stone-900">General Ledger</h1>
              <p className="text-sm text-stone-500">
                {account ? `${account.name} (${account.account_code})` : accountId ? "Loading account..." : "Select an account to view its ledger"}
              </p>
            </div>
          </div>
          {data?.lines?.length > 0 && (
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={exportToCSV}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
              <Download size={18} /> Export CSV
            </motion.button>
          )}
        </div>

        {!accountId ? (
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            {accounts.length === 0 ? (
              <div className="p-12 text-center text-stone-400"><p>No accounts available.</p></div>
            ) : (
              <ul className="divide-y divide-stone-50">
                {accounts.map((a) => (
                  <li key={a.id}>
                    <Link to={`/ledger/${a.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-stone-50">
                      <span className="text-sm text-stone-800">{a.name}</span>
                      <span className="flex items-center gap-2 text-xs text-stone-500">
                        <span className="font-mono">{a.account_code}</span>
                        <ChevronRight size={14} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : loading ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
            <p>Loading ledger...</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            {!data?.lines?.length ? (
              <div className="p-12 text-center text-stone-400">
                <p>No transactions found for this account.</p>
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-stone-100 bg-stone-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Total Debit</div>
                        <div className="text-lg font-bold text-stone-900">{fmt(data?.total_debit)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Total Credit</div>
                        <div className="text-lg font-bold text-stone-900">{fmt(data?.total_credit)}</div>
                      </div>
                    </div>
                    <div className={`px-4 py-2 rounded-xl ${Number(data?.closing_balance) >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      <div className="text-xs font-medium">Closing Balance</div>
                      <div className="text-lg font-bold">{fmt(data?.closing_balance)}</div>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-stone-400 uppercase tracking-wider bg-stone-50">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Date</th>
                        <th className="py-3 px-4 font-semibold">Entry #</th>
                        <th className="py-3 px-4 font-semibold">Description</th>
                        <th className="py-3 px-4 font-semibold">Reference</th>
                        <th className="py-3 px-4 font-semibold text-right">Debit</th>
                        <th className="py-3 px-4 font-semibold text-right">Credit</th>
                        <th className="py-3 px-4 font-semibold text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {data?.lines?.map((line, idx) => (
                        <tr key={idx} className="hover:bg-stone-50">
                          <td className="py-3 px-4 text-stone-600">{line.journal_entries?.entry_date || "-"}</td>
                          <td className="py-3 px-4 text-stone-800 font-medium">{line.journal_entries?.entry_number || "-"}</td>
                          <td className="py-3 px-4 text-stone-700">{line.journal_entries?.description || "-"}</td>
                          <td className="py-3 px-4 text-stone-500">{line.journal_entries?.reference || "-"}</td>
                          <td className="py-3 px-4 text-right font-medium text-stone-800">{line.debit ? fmt(line.debit) : "-"}</td>
                          <td className="py-3 px-4 text-right font-medium text-stone-800">{line.credit ? fmt(line.credit) : "-"}</td>
                          <td className={`py-3 px-4 text-right font-semibold ${Number(line.running_balance) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                            {fmt(line.running_balance)}
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
