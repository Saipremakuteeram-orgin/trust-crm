import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Upload } from "lucide-react";
import api from "../../lib/api";
import { useQuickLog } from "../hooks";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";
import { usePreFill } from "../hooks";
import Card from "./Card";
import Chip from "./Chip";

const emptyForm = {
  type: "credit",
  mode: "cash",
  amount: "",
  party: "",
  description: "",
  txn_date: new Date().toISOString().slice(0, 10),
  category_id: "",
  function_id: "",
  function_category_id: "",
  voucher_filed: null,
  digital_method: "upi",
};

export default function QuickLogSheet() {
  const { open, closeSheet } = useQuickLog();
  const { profile } = useAuth();
  const { addToast } = useToast();
  const { read, write } = usePreFill();
  const prefill = read();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    ...emptyForm,
    ...(prefill.party ? { party: prefill.party } : {}),
    ...(prefill.mode ? { mode: prefill.mode } : {}),
    ...(prefill.category_id ? { category_id: prefill.category_id } : {}),
    ...(prefill.function_id ? { function_id: prefill.function_id } : {}),
  }));
  const [receipt, setReceipt] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const fileRef = useRef(null);

  const canSubmit = form.type && form.amount && Number(form.amount) > 0 && form.party?.trim();

  async function handleSubmit() {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (payload.mode !== "cash") delete payload.voucher_filed;
      if (!payload.function_id) delete payload.function_id;
      if (!payload.function_category_id) delete payload.function_category_id;
      const res = await api.post("/transactions", payload);
      const id = res.data?.result?.id;
      setSavedId(id);
      write({ party: form.party, mode: form.mode, category_id: form.category_id, function_id: form.function_id });
      addToast("Transaction saved", "success");
      if (receipt && id) {
        try {
          const fd = new FormData();
          fd.append("file", receipt);
          await api.post(`/transactions/${id}/receipt`, fd);
          addToast("Receipt attached", "success");
        } catch {
          // ignore receipt upload failure on quick-log
        }
      }
      setStep(3);
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setStep(1);
    setForm({ ...emptyForm, ...(prefill.party ? { party: prefill.party } : {}), ...(prefill.mode ? { mode: prefill.mode } : {}) });
    setReceipt(null);
    setSavedId(null);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeSheet} className="fixed inset-0 bg-black/50 z-40" />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="text-base font-bold text-stone-900">Log transaction</h2>
              <button onClick={closeSheet} aria-label="Close" className="m-tap w-10 h-10 rounded-xl flex items-center justify-center active:bg-stone-100">
                <X size={20} />
              </button>
            </div>
            <div className="w-12 h-1.5 rounded-full bg-stone-200 mx-auto mb-2" />

            <div className="px-4 pb-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  {[1, 2, 3].map((s) => (
                    <div key={s} className={`h-1.5 rounded-full transition-all ${s <= step ? "w-6 bg-saffron-500" : "w-3 bg-stone-200"}`} />
                  ))}
                </div>
                <span className="text-[10px] font-semibold text-stone-500">Step {step} of 3</span>
              </div>

              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Type</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setForm({ ...form, type: "credit" })} className={`m-tap py-3 rounded-2xl text-sm font-bold border-2 ${form.type === "credit" ? "bg-emerald-600 text-white border-emerald-600" : "border-stone-200 text-stone-600"}`}>
                        Credit (In)
                      </button>
                      <button type="button" onClick={() => setForm({ ...form, type: "debit" })} className={`m-tap py-3 rounded-2xl text-sm font-bold border-2 ${form.type === "debit" ? "bg-rose-600 text-white border-rose-600" : "border-stone-200 text-stone-600"}`}>
                        Debit (Out)
                      </button>
                    </div>
                  </div>
                  <button onClick={() => setStep(2)} disabled={!form.type} className="w-full bg-saffron-500 text-white text-sm font-bold py-3 rounded-2xl disabled:opacity-50">
                    Next
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Amount</div>
                    <div className="bg-stone-50 rounded-2xl border-2 border-stone-200 p-4">
                      <div className="text-center text-3xl font-bold text-stone-900">{form.amount || "0"}</div>
                      <NumericPad value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
                    </div>
                  </div>
                  <button onClick={() => setStep(3)} disabled={!form.amount || Number(form.amount) <= 0} className="w-full bg-saffron-500 text-white text-sm font-bold py-3 rounded-2xl disabled:opacity-50">
                    Next
                  </button>
                </div>
              )}

              {step === 3 && (
                <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-3">
                  <input required placeholder="Party (donor / vendor)" value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} className="w-full border-2 border-stone-200 rounded-2xl px-4 py-3 text-sm" />
                  <input placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border-2 border-stone-200 rounded-2xl px-4 py-3 text-sm" />
                  <input required type="date" value={form.txn_date} onChange={(e) => setForm({ ...form, txn_date: e.target.value })} className="w-full border-2 border-stone-200 rounded-2xl px-4 py-3 text-sm" />

                  <div>
                    <div className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Mode</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setForm({ ...form, mode: "cash" })} className={`m-tap py-2.5 rounded-2xl text-sm font-bold border-2 ${form.mode === "cash" ? "bg-saffron-600 text-white border-saffron-600" : "border-stone-200 text-stone-600"}`}>Cash</button>
                      <button type="button" onClick={() => setForm({ ...form, mode: "digital" })} className={`m-tap py-2.5 rounded-2xl text-sm font-bold border-2 ${form.mode === "digital" ? "bg-royal-600 text-white border-royal-600" : "border-stone-200 text-stone-600"}`}>Digital</button>
                    </div>
                  </div>

                  {form.mode === "cash" && (
                    <div>
                      <div className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Voucher Filed? *</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setForm({ ...form, voucher_filed: true })} className={`m-tap py-2.5 rounded-2xl text-sm font-bold border-2 ${form.voucher_filed === true ? "bg-emerald-600 text-white border-emerald-600" : "border-stone-200"}`}>Filed</button>
                        <button type="button" onClick={() => setForm({ ...form, voucher_filed: false })} className={`m-tap py-2.5 rounded-2xl text-sm font-bold border-2 ${form.voucher_filed === false ? "bg-amber-600 text-white border-amber-600" : "border-stone-200"}`}>Pending</button>
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Receipt</div>
                    <label className="flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-stone-300 text-sm text-stone-600 cursor-pointer active:bg-stone-50">
                      <Camera size={16} />
                      <span>{receipt ? receipt.name : "Take a photo"}</span>
                      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setReceipt(e.target.files?.[0] || null)} />
                    </label>
                    {!receipt && (
                      <label className="flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-stone-300 text-sm text-stone-600 cursor-pointer active:bg-stone-50 mt-2">
                        <Upload size={16} />
                        <span>Choose from gallery</span>
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => setReceipt(e.target.files?.[0] || null)} />
                      </label>
                    )}
                  </div>

                  <button type="submit" disabled={saving || !canSubmit} className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-bold py-3 rounded-2xl shadow-lg shadow-saffron-500/25 disabled:opacity-50">
                    {saving ? "Saving…" : savedId ? "Saved!" : "Save transaction"}
                  </button>
                  {savedId && (
                    <button type="button" onClick={reset} className="w-full border-2 border-stone-200 text-stone-700 text-sm font-bold py-3 rounded-2xl">
                      Log another
                    </button>
                  )}
                </form>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
