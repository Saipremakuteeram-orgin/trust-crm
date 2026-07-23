import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import useEscToClose from "../hooks/useEscToClose";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function TransactionListModal({ open, onClose, title, subtitle, transactions, loading }) {
  useEscToClose(onClose, open);
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={onClose}>
          <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl shadow-black/20 w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-stone-100">
              <div>
                <h2 className="text-lg font-bold text-stone-900">{title}</h2>
                {subtitle && <p className="text-xs text-stone-400 mt-0.5">{subtitle}</p>}
              </div>
              <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors">
                <X size={18} />
              </motion.button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-12 text-center text-stone-400">Loading transactions...</div>
              ) : !transactions || transactions.length === 0 ? (
                <div className="p-12 text-center text-stone-400">No transactions found.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 text-stone-500 text-left sticky top-0">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Party</th>
                      <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Mode</th>
                      <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Category</th>
                      <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Voucher</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id} className="border-t border-stone-100">
                        <td className="px-4 py-3 text-stone-600 whitespace-nowrap">{t.txn_date}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            t.type === "credit" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                          }`}>{t.type === "credit" ? "Credit" : "Debit"}</span>
                        </td>
                        <td className="px-4 py-3 text-stone-800 font-medium">{t.party || "-"}</td>
                        <td className={`px-4 py-3 font-bold whitespace-nowrap ${t.type === "credit" ? "text-emerald-700" : "text-rose-700"}`}>{fmt(t.amount)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            t.mode === "cash" ? "bg-saffron-50 text-saffron-700 ring-1 ring-saffron-200" : "bg-royal-50 text-royal-700 ring-1 ring-royal-200"
                          }`}>{t.mode === "cash" ? "Cash" : (t.digital_method?.toUpperCase() || "Digital")}</span>
                        </td>
                        <td className="px-4 py-3 text-stone-500 text-xs">{t.categories?.name || "-"}</td>
                        <td className="px-4 py-3">
                          {t.mode === "cash" ? (
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                              t.voucher_filed ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                            }`}>{t.voucher_filed ? "Filed" : "Pending"}</span>
                          ) : (
                            <span className="text-xs text-stone-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-5 py-3 border-t border-stone-100 text-xs text-stone-400 text-right">
              {transactions ? `${transactions.length} transaction(s)` : ""}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
