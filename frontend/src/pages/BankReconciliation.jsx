import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Pencil, Trash2, Upload, CheckCircle2, Clock, AlertTriangle, Link2, Unlink, FileText, Calendar } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import useEscToClose from "../hooks/useEscToClose";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

const emptyStatement = {
  bank_name: "",
  account_number: "",
  period_start: "",
  period_end: "",
};

const emptyItem = {
  transaction_date: "",
  description: "",
  amount: "",
  type: "debit",
  reference_no: "",
  notes: "",
};

export default function BankReconciliation() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canEdit = role === "admin" || role === "accountant";

  const [statements, setStatements] = useState([]);
  const [selectedStatement, setSelectedStatement] = useState(null);
  const [items, setItems] = useState([]);
  const [unmatchedTxns, setUnmatchedTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statementModal, setStatementModal] = useState({ open: false, editing: null });
  const [statementForm, setStatementForm] = useState({ ...emptyStatement });
  const [savingStatement, setSavingStatement] = useState(false);
  const [itemModal, setItemModal] = useState({ open: false });
  const [itemForm, setItemForm] = useState({ ...emptyItem });
  const [savingItem, setSavingItem] = useState(false);
  useEscToClose(() => { setStatementModal({ open: false, editing: null }); setItemModal({ open: false }); }, statementModal.open || itemModal.open);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/bank-statements");
      setStatements(res.data.result || []);
    } catch {
      addToast("Failed to load bank statements", "error");
    }
    setLoading(false);
  }
  useEffect(() => { let cancelled = false; load().finally(() => { cancelled = true; }); return () => { cancelled = true; }; }, []);

  async function selectStatement(statement) {
    setSelectedStatement(statement);
    try {
      const [itemsRes, txnsRes] = await Promise.all([
        api.get(`/bank-statements/${statement.id}/items`),
        api.get(`/bank-reconciliation/unmatched-transactions?period_start=${statement.period_start}&period_end=${statement.period_end}`),
      ]);
      setItems(itemsRes.data.result || []);
      setUnmatchedTxns(txnsRes.data.result || []);
    } catch {
      addToast("Failed to load reconciliation data", "error");
    }
  }

  function openAddStatement() {
    setStatementForm({
      bank_name: selectedStatement?.bank_name || "",
      account_number: selectedStatement?.account_number || "",
      period_start: selectedStatement?.period_start || "",
      period_end: selectedStatement?.period_end || "",
    });
    setStatementModal({ open: true, editing: null });
    setSavingStatement(false);
  }

  function openEditStatement(statement) {
    setStatementForm({
      bank_name: statement.bank_name || "",
      account_number: statement.account_number || "",
      period_start: statement.period_start || "",
      period_end: statement.period_end || "",
    });
    setStatementModal({ open: true, editing: statement });
    setSavingStatement(false);
  }

  async function handleSaveStatement(e) {
    e.preventDefault();
    if (!statementForm.period_start || !statementForm.period_end) {
      addToast("Period dates are required", "error");
      return;
    }
    setSavingStatement(true);
    try {
      const payload = {
        bank_name: statementForm.bank_name.trim() || "Unknown",
        account_number: statementForm.account_number.trim() || null,
        period_start: statementForm.period_start,
        period_end: statementForm.period_end,
      };

      if (statementModal.editing) {
        await api.patch(`/bank-statements/${statementModal.editing.id}`, payload);
        addToast("Statement updated", "success");
      } else {
        await api.post("/bank-statements", payload);
        addToast("Statement created", "success");
      }
      setStatementModal({ open: false, editing: null });
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save statement", "error");
    }
    setSavingStatement(false);
  }

  async function handleDeleteStatement(id) {
    if (!window.confirm("Delete this bank statement?")) return;
    try {
      await api.delete(`/bank-statements/${id}`);
      addToast("Statement deleted", "success");
      if (selectedStatement?.id === id) {
        setSelectedStatement(null);
        setItems([]);
        setUnmatchedTxns([]);
      }
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to delete statement", "error");
    }
  }

  function openAddItem() {
    setItemForm({
      ...emptyItem,
      transaction_date: selectedStatement?.period_start || new Date().toISOString().slice(0, 10),
    });
    setItemModal({ open: true });
    setSavingItem(false);
  }

  async function handleSaveItem(e) {
    e.preventDefault();
    if (!itemForm.description.trim() || !itemForm.amount || !itemForm.transaction_date) {
      addToast("Description, amount and date are required", "error");
      return;
    }
    setSavingItem(true);
    try {
      const payload = {
        transaction_date: itemForm.transaction_date,
        description: itemForm.description.trim(),
        amount: Number(itemForm.amount),
        type: itemForm.type,
        reference_no: itemForm.reference_no.trim() || null,
        notes: itemForm.notes.trim() || null,
      };

      await api.post(`/bank-statements/${selectedStatement.id}/items`, payload);
      addToast("Item added", "success");
      setItemModal({ open: false });
      selectStatement(selectedStatement);
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save item", "error");
    }
    setSavingItem(false);
  }

  async function handleMatchItem(itemId, transactionId) {
    try {
      await api.patch(`/bank-reconciliation-items/${itemId}`, {
        status: 'matched',
        matched_transaction_id: transactionId,
      });
      addToast("Transaction matched", "success");
      selectStatement(selectedStatement);
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to match transaction", "error");
    }
  }

  async function handleUnmatchItem(itemId) {
    try {
      await api.patch(`/bank-reconciliation-items/${itemId}`, {
        status: 'unmatched',
        matched_transaction_id: null,
      });
      addToast("Transaction unmatched", "success");
      selectStatement(selectedStatement);
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to unmatch transaction", "error");
    }
  }

  async function handleDeleteItem(itemId) {
    if (!window.confirm("Delete this reconciliation item?")) return;
    try {
      await api.delete(`/bank-reconciliation-items/${itemId}`);
      addToast("Item deleted", "success");
      selectStatement(selectedStatement);
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to delete item", "error");
    }
  }

  function getStatusStyle(status) {
    switch (status) {
      case 'matched': return 'bg-emerald-100 text-emerald-700';
      case 'ignored': return 'bg-stone-100 text-stone-500';
      default: return 'bg-amber-100 text-amber-700';
    }
  }

  const matchedCount = items.filter(i => i.status === 'matched').length;
  const unmatchedCount = items.filter(i => i.status === 'unmatched').length;
  const statementTotal = items.reduce((s, i) => s + (i.type === 'credit' ? Number(i.amount) || 0 : -Number(i.amount) || 0), 0);

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Calendar className="text-royal-600" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Bank Reconciliation</h1>
              <p className="text-sm text-stone-500">Match bank statement entries with transactions</p>
            </div>
          </div>
          {canEdit && (
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openAddStatement}
              className="flex items-center gap-2 bg-saffron-500 hover:bg-saffron-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
              <Plus size={18} /> New Statement
            </motion.button>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
            <p>Loading bank statements...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                <div className="p-4 border-b border-stone-100">
                  <h2 className="text-sm font-semibold text-stone-700">Bank Statements</h2>
                </div>
                <div className="divide-y divide-stone-50">
                  {statements.length === 0 ? (
                    <div className="p-6 text-center text-stone-400 text-sm">No statements yet.</div>
                  ) : (
                    statements.map((s) => (
                      <div key={s.id}
                        onClick={() => selectStatement(s)}
                        className={`p-4 cursor-pointer hover:bg-stone-50 transition-colors ${selectedStatement?.id === s.id ? 'bg-saffron-50 border-l-4 border-saffron-500' : ''}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-stone-800 text-sm">{s.bank_name}</div>
                            <div className="text-xs text-stone-500">{s.period_start} to {s.period_end}</div>
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-1">
                              <button onClick={(e) => { e.stopPropagation(); openEditStatement(s); }} className="p-1 rounded hover:bg-royal-50 text-stone-400 hover:text-royal-600">
                                <Pencil size={12} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteStatement(s.id); }} className="p-1 rounded hover:bg-rose-50 text-stone-400 hover:text-rose-600">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              {selectedStatement ? (
                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                  <div className="p-4 border-b border-stone-100 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-stone-700">{selectedStatement.bank_name} - {selectedStatement.period_start} to {selectedStatement.period_end}</h2>
                      <div className="text-xs text-stone-500 mt-1">
                        Total: {fmt(statementTotal)} - Matched: {matchedCount} - Unmatched: {unmatchedCount}
                      </div>
                    </div>
                    {canEdit && (
                      <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openAddItem}
                        className="flex items-center gap-1 bg-saffron-500 hover:bg-saffron-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                        <Plus size={14} /> Add Entry
                      </motion.button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-stone-400 uppercase tracking-wider bg-stone-50">
                        <tr>
                          <th className="py-3 px-4 font-semibold">Date</th>
                          <th className="py-3 px-4 font-semibold">Description</th>
                          <th className="py-3 px-4 font-semibold text-right">Amount</th>
                          <th className="py-3 px-4 font-semibold">Status</th>
                          <th className="py-3 px-4 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {items.length === 0 ? (
                          <tr><td colSpan={5} className="p-8 text-center text-stone-400">No entries yet. Add bank statement entries to begin reconciliation.</td></tr>
                        ) : (
                          items.map((item) => (
                            <tr key={item.id} className="hover:bg-stone-50">
                              <td className="py-3 px-4 text-stone-600">{item.transaction_date}</td>
                              <td className="py-3 px-4">
                                <div className="text-stone-800">{item.description}</div>
                                {item.reference_no && <div className="text-xs text-stone-400">Ref: {item.reference_no}</div>}
                              </td>
                              <td className={`py-3 px-4 text-right font-medium ${item.type === 'credit' ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {item.type === 'credit' ? '+' : '-'}{fmt(item.amount)}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${getStatusStyle(item.status)}`}>
                                  {item.status}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                {item.status === 'unmatched' && unmatchedTxns.length > 0 && (
                                  <select
                                    onChange={(e) => { if (e.target.value) { handleMatchItem(item.id, e.target.value); e.target.value = ''; } }}
                                    className="text-xs border border-stone-200 rounded-lg px-2 py-1 mr-2"
                                    defaultValue="">
                                    <option value="">Match...</option>
                                    {unmatchedTxns.map(t => (
                                      <option key={t.id} value={t.id}>{t.txn_date} - {t.description} - {fmt(t.amount)}</option>
                                    ))}
                                  </select>
                                )}
                                {item.status === 'matched' && (
                                  <button onClick={() => handleUnmatchItem(item.id)} className="text-xs text-stone-500 hover:text-rose-600 mr-2">Unmatch</button>
                                )}
                                {canEdit && (
                                  <button onClick={() => handleDeleteItem(item.id)} className="text-stone-400 hover:text-rose-600">
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
                  <Calendar size={48} className="mx-auto mb-4 opacity-30" />
                  <p>Select a bank statement to view reconciliation items.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Statement Modal */}
        <AnimatePresence>
          {statementModal.open && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
              <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-bold text-stone-900">{statementModal.editing ? "Edit Statement" : "New Statement"}</h2>
                  <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                    onClick={() => setStatementModal({ open: false, editing: null })} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
                </div>
                <form onSubmit={handleSaveStatement} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Bank Name</label>
                      <input type="text" value={statementForm.bank_name} onChange={(e) => setStatementForm({ ...statementForm, bank_name: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Account Number</label>
                      <input type="text" value={statementForm.account_number} onChange={(e) => setStatementForm({ ...statementForm, account_number: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Period Start</label>
                      <input type="date" required value={statementForm.period_start} onChange={(e) => setStatementForm({ ...statementForm, period_start: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Period End</label>
                      <input type="date" required value={statementForm.period_end} onChange={(e) => setStatementForm({ ...statementForm, period_end: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={savingStatement}
                    className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                    {savingStatement ? "Saving..." : statementModal.editing ? "Update Statement" : "Create Statement"}
                  </motion.button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Item Modal */}
        <AnimatePresence>
          {itemModal.open && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
              <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-bold text-stone-900">Add Entry</h2>
                  <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                    onClick={() => setItemModal({ open: false })} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
                </div>
                <form onSubmit={handleSaveItem} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Date</label>
                      <input type="date" required value={itemForm.transaction_date} onChange={(e) => setItemForm({ ...itemForm, transaction_date: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">Type</label>
                      <select value={itemForm.type} onChange={(e) => setItemForm({ ...itemForm, type: e.target.value })}
                        className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors">
                        <option value="credit">Credit</option>
                        <option value="debit">Debit</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Description</label>
                    <input type="text" required value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Amount</label>
                    <input type="number" step="0.01" required value={itemForm.amount} onChange={(e) => setItemForm({ ...itemForm, amount: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Reference No</label>
                    <input type="text" value={itemForm.reference_no} onChange={(e) => setItemForm({ ...itemForm, reference_no: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Notes</label>
                    <textarea rows={2} value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })}
                      className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors resize-none" />
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={savingItem}
                    className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                    {savingItem ? "Saving..." : "Add Entry"}
                  </motion.button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}
