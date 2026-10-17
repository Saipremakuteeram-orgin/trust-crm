import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Camera, Check, Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";
import api from "../lib/api";
import { useToast } from "./Toast";
import {
  analyzeExpenseImage,
  getExpenseOcrEstimateSeconds,
  prewarmExpenseOcr,
} from "../lib/ocr/client";

const EMPTY_ITEM = { item_name: "", source_text: "", quantity: 1, amount: "", confidence: null, category_id: "" };
const OCR_PHASES = {
  model: { start: 0, weight: 0.55 },
  image: { start: 0.55, weight: 0.1 },
  inference: { start: 0.65, weight: 0.35 },
};

const fmt = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
}).format(Number(value || 0));

function normalizeItems(items) {
  return (items || []).map((item, index) => ({
    ...item,
    line_number: index + 1,
    item_name: item.item_name || "",
    amount: item.amount === null || item.amount === undefined ? "" : String(item.amount),
    quantity: item.quantity || 1,
    category_id: item.category_id || "",
  }));
}

function expenseUploadErrorMessage(error) {
  const status = error?.response?.status;
  const serverMessage = error?.response?.data?.message;
  if (serverMessage) return serverMessage;
  if (status === 404) return "The expense upload service is not deployed yet. Deploy the latest backend and try again.";
  if (status) return `The expense image could not be saved (HTTP ${status}). Please try again.`;
  if (error?.code === "ERR_NETWORK") return "The backend could not be reached. Check the backend deployment and try again.";
  return "The image loaded, but it could not be saved. Please try again.";
}

function formatSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "calculating…";
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} sec`;
  return `${Math.floor(seconds / 60)} min ${Math.ceil(seconds % 60)} sec`;
}

function progressPercent(progress) {
  const phase = OCR_PHASES[progress?.phase] || OCR_PHASES.model;
  const value = phase.start + phase.weight * Math.max(0, Math.min(1, Number(progress?.progress) || 0));
  return Math.round(value * 100);
}

export default function ExpenseScanReview({ open, onClose, onApproved, initialMode = "cash" }) {
  const { addToast } = useToast();
  const fileInputRef = useRef(null);
  const [step, setStep] = useState("capture");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [ocrProgress, setOcrProgress] = useState({ phase: "model", progress: 0, label: "Preparing OCR engine…" });
  const [ocrEtaSeconds, setOcrEtaSeconds] = useState(null);
  const [ocrElapsedSeconds, setOcrElapsedSeconds] = useState(0);
  const ocrStartedAtRef = useRef(0);
  const [error, setError] = useState("");
  const [scan, setScan] = useState(null);
  const [draft, setDraft] = useState(null);
  const [functions, setFunctions] = useState([]);
  const [functionDetail, setFunctionDetail] = useState(null);
  const [categories, setCategories] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [functionLoading, setFunctionLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const [approval, setApproval] = useState({
    party: "",
    txn_date: new Date().toISOString().slice(0, 10),
    mode: initialMode,
    digital_method: "upi",
    voucher_filed: null,
    function_id: "",
    function_category_id: "",
    category_id: "",
    notify_contact_ids: [],
  });

  const itemTotal = useMemo(
    () => (draft?.items || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
    [draft?.items]
  );

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    Promise.all([
      api.get("/functions").catch(() => ({ data: { result: [] } })),
      api.get("/categories").catch(() => ({ data: { result: [] } })),
      api.get("/contacts").catch(() => ({ data: { result: [] } })),
    ]).then(([functionResponse, categoryResponse, contactResponse]) => {
      if (cancelled) return;
      setFunctions(functionResponse.data.result || []);
      setCategories(categoryResponse.data.result || []);
      setContacts(contactResponse.data.result || []);
    });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (step !== "analyzing" || !ocrStartedAtRef.current) return undefined;
    const updateEta = () => {
      const elapsed = (Date.now() - ocrStartedAtRef.current) / 1000;
      setOcrElapsedSeconds(elapsed);
      setOcrEtaSeconds((current) => Math.max(0, Math.ceil((current ?? 1) - 0.25)));
    };
    updateEta();
    const timer = window.setInterval(updateEta, 250);
    return () => window.clearInterval(timer);
  }, [step]);

  useEffect(() => {
    if (!open) return undefined;
    void prewarmExpenseOcr().catch(() => {
      // The upload flow will retry and can fall back to manual entry.
    });
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!open) {
      setStep("capture");
      setFile(null);
      setScan(null);
      setDraft(null);
      setError("");
      setPersisting(false);
      ocrStartedAtRef.current = 0;
      setOcrProgress({ phase: "model", progress: 0, label: "Preparing OCR engine…" });
      setOcrEtaSeconds(null);
      setOcrElapsedSeconds(0);
      setFunctionDetail(null);
      setApproval({
        party: "",
        txn_date: new Date().toISOString().slice(0, 10),
        mode: initialMode,
        digital_method: "upi",
        voucher_filed: null,
        function_id: "",
        function_category_id: "",
        category_id: "",
        notify_contact_ids: [],
      });
    }
  }, [open, initialMode]);

  async function handleFile(fileToRead) {
    if (!fileToRead) return;
    if (!fileToRead.type.startsWith("image/")) {
      setError("Please choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (fileToRead.size > 10 * 1024 * 1024) {
      setError("The image must be smaller than 10 MB.");
      return;
    }

    setFile(fileToRead);
    setError("");
    setStep("analyzing");
    ocrStartedAtRef.current = Date.now();
    setOcrProgress({ phase: "model", progress: 0, label: "Preparing OCR engine…" });
    setOcrEtaSeconds(getExpenseOcrEstimateSeconds({ fileSize: fileToRead.size }));
    setOcrElapsedSeconds(0);

    let parsed;
    try {
      // Let the browser paint the preview before OCR starts on the worker.
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      parsed = await analyzeExpenseImage(fileToRead, {
        onProgress: (progress) => {
          setOcrProgress(progress);
          if (progress.phase === "model" && progress.progress === 1) {
            setOcrEtaSeconds(getExpenseOcrEstimateSeconds({ fileSize: fileToRead.size }));
          }
        },
      });
    } catch {
      const fallback = {
        items: [{ ...EMPTY_ITEM }],
        raw_lines: [],
        ocr_payload: {},
        detected_party: "",
        detected_date: null,
        detected_total: null,
        total_mismatch: false,
        average_confidence: 0,
      };
      const items = normalizeItems(fallback.items);
      setDraft({ ...fallback, items });
      setStep("review");
      setError("Text extraction was unavailable. The image is loaded; enter the expense details manually.");
      try {
        setPersisting(true);
        await persistDraft(fileToRead, fallback, items);
      } catch (persistError) {
        setError(expenseUploadErrorMessage(persistError));
      } finally {
        setPersisting(false);
      }
      return;
    }

    const items = normalizeItems(parsed.items.length ? parsed.items : [{ ...EMPTY_ITEM }]);
    setDraft({ ...parsed, items });
    setApproval((current) => ({
      ...current,
      party: parsed.detected_party || "",
      txn_date: parsed.detected_date || current.txn_date,
    }));
    setStep("review");
    if (parsed.warning) addToast(parsed.warning, "info");
    try {
      setPersisting(true);
      await persistDraft(fileToRead, parsed, items);
    } catch (persistError) {
      setError(expenseUploadErrorMessage(persistError));
    } finally {
      setPersisting(false);
    }
  }

  async function persistDraft(imageFile, parsed, items) {
    const body = new FormData();
    body.append("file", imageFile);
    body.append("raw_text", (parsed.raw_lines || []).map((line) => line.source_text).join("\n"));
    body.append("ocr_payload", JSON.stringify(parsed.ocr_payload || {}));
    body.append("items", JSON.stringify(items));
    body.append("detected_party", parsed.detected_party || "");
    body.append("detected_date", parsed.detected_date || "");
    body.append("detected_total", parsed.detected_total ?? "");
    // Let the browser set the multipart boundary. Setting this header manually
    // can make multer reject the request in some browsers/adapters.
    const response = await api.post("/expense-scans", body);
    setScan(response.data.result);
  }

  async function loadFunctionDetail(functionId) {
    setApproval((current) => ({ ...current, function_id: functionId, function_category_id: "" }));
    setFunctionDetail(null);
    if (!functionId) return;
    setFunctionLoading(true);
    try {
      const response = await api.get(`/functions/${functionId}`);
      setFunctionDetail(response.data.result || null);
    } catch {
      addToast("Could not load event categories", "error");
    } finally {
      setFunctionLoading(false);
    }
  }

  function updateItem(index, updates) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item),
    }));
  }

  function removeItem(index) {
    setDraft((current) => ({
      ...current,
      items: current.items.filter((_item, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, line_number: itemIndex + 1 })),
    }));
  }

  function addItem() {
    setDraft((current) => ({
      ...current,
      items: [...current.items, { ...EMPTY_ITEM, line_number: current.items.length + 1 }],
    }));
  }

  function toggleContact(contactId) {
    setApproval((current) => ({
      ...current,
      notify_contact_ids: current.notify_contact_ids.includes(contactId)
        ? current.notify_contact_ids.filter((id) => id !== contactId)
        : [...current.notify_contact_ids, contactId],
    }));
  }

  async function handleApprove() {
    if (!scan?.id || !draft?.items?.length) {
      setError("Scan at least one expense item before approving.");
      return;
    }
    if (!approval.function_id) {
      setError("Select the function or event before approving.");
      return;
    }
    if (approval.mode === "cash" && typeof approval.voucher_filed !== "boolean") {
      setError("Select whether the cash voucher has been filed.");
      return;
    }
    if (draft.items.some((item) => !item.item_name.trim() || Number(item.amount) <= 0)) {
      setError("Every item needs a name and a positive amount.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const patchResponse = await api.patch(`/expense-scans/${scan.id}`, {
        detected_party: approval.party,
        detected_date: approval.txn_date,
        detected_total: draft.detected_total,
        items: draft.items.map((item, index) => ({
          ...item,
          line_number: index + 1,
          amount: Number(item.amount),
          quantity: Number(item.quantity || 1),
        })),
      });
      setScan(patchResponse.data.result);

      const approveResponse = await api.post(`/expense-scans/${scan.id}/approve`, {
        party: approval.party,
        txn_date: approval.txn_date,
        mode: approval.mode,
        digital_method: approval.digital_method,
        voucher_filed: approval.voucher_filed,
        function_id: approval.function_id,
        function_category_id: approval.function_category_id || null,
        category_id: approval.category_id || null,
        notify_contact_ids: approval.notify_contact_ids,
      });

      setStep("done");
      addToast(`${approveResponse.data.result.transaction_ids.length} expense transaction(s) created`, "success");
      onApproved?.(approveResponse.data.result);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to approve expense");
    } finally {
      setSaving(false);
    }
  }

  function resetScan() {
    setStep("capture");
    setFile(null);
    setScan(null);
    setDraft(null);
    setError("");
    setPersisting(false);
    ocrStartedAtRef.current = 0;
    setOcrProgress({ phase: "model", progress: 0, label: "Preparing OCR engine…" });
    setOcrEtaSeconds(null);
    setOcrElapsedSeconds(0);
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-black/60 p-3 sm:p-6 flex items-end sm:items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          onClick={(event) => event.stopPropagation()}
          className="bg-white w-full max-w-5xl max-h-[94vh] overflow-y-auto rounded-3xl shadow-2xl"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 bg-white/95 backdrop-blur border-b border-stone-100">
            <div>
              <h2 className="text-lg font-bold text-stone-900">Scan handwritten expense</h2>
              <p className="text-xs text-stone-500">OCR runs locally in your browser. Nothing is posted until approval.</p>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-500" aria-label="Close scan">
              <X size={20} />
            </button>
          </div>

          <div className="p-5">
            {step === "capture" && (
              <div className="min-h-[300px] flex flex-col items-center justify-center text-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-saffron-50 text-saffron-600 flex items-center justify-center">
                  <Camera size={30} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">Photograph the item and price</h3>
                  <p className="text-sm text-stone-500 mt-1 max-w-md">Use a clear, well-lit photo. You can correct every OCR result before it becomes an expense.</p>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer bg-saffron-500 hover:bg-saffron-600 text-white px-5 py-3 rounded-2xl text-sm font-bold">
                  <Camera size={18} /> Take or choose photo
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => handleFile(event.target.files?.[0])}
                  />
                </label>
                {error && <p className="text-sm text-rose-600 max-w-md">{error}</p>}
              </div>
            )}

            {step === "analyzing" && (
              <div className="min-h-[300px] flex flex-col items-center justify-center text-center gap-4">
                {previewUrl && <img src={previewUrl} alt="Expense note preview" className="max-h-48 max-w-full rounded-2xl object-contain border border-stone-200" />}
                  <Loader2 size={28} className="animate-spin text-saffron-500" />
                  <div>
                    <h3 className="font-bold text-stone-900">Reading the note…</h3>
                    <p className="text-sm text-stone-500 mt-1">{ocrProgress.label}</p>
                    <div className="w-full max-w-sm mt-3">
                      <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                        <div className="h-full rounded-full bg-saffron-500 transition-all duration-300" style={{ width: `${progressPercent(ocrProgress)}%` }} />
                      </div>
                      <div className="flex items-center justify-between gap-3 mt-2 text-[11px] text-stone-400">
                        <span>{progressPercent(ocrProgress)}% complete · elapsed {formatSeconds(ocrElapsedSeconds)}</span>
                        <span>ETA ~{formatSeconds(ocrEtaSeconds)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-stone-400 mt-2">The preview is ready. Text extraction continues in the background. The first scan may take longer while the OCR engine is cached.</p>
                  </div>
              </div>
            )}

            {step === "review" && draft && (
              <div className="space-y-5">
                <div className="grid lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.4fr)] gap-5">
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3 lg:sticky lg:top-20">
                      {previewUrl && <img src={previewUrl} alt="Handwritten expense note" className="w-full max-h-[52vh] object-contain rounded-xl" />}
                      <div className="flex items-center justify-between gap-2 mt-3 text-xs text-stone-500">
                        <span>Average OCR confidence</span>
                        <span className={draft.average_confidence < 0.6 ? "text-amber-700 font-bold" : "text-emerald-700 font-bold"}>
                          {Math.round((draft.average_confidence || 0) * 100)}%
                        </span>
                      </div>
                    </div>
                    <button type="button" onClick={resetScan} className="w-full flex items-center justify-center gap-2 border-2 border-stone-200 text-stone-700 px-4 py-2.5 rounded-xl text-sm font-semibold">
                      <RotateCcw size={16} /> Scan another image
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-stone-900">Review extracted expenses</h3>
                        <p className="text-xs text-stone-500 mt-1">Yellow rows need a quick human check.</p>
                      </div>
                      <div className="text-right text-sm">
                        <div className="text-[11px] uppercase tracking-wider text-stone-400">Item total</div>
                        <div className="font-bold text-stone-900">{fmt(itemTotal)}</div>
                      </div>
                    </div>

                    {draft.total_mismatch && (
                      <div className="flex gap-2 items-start rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2.5 text-xs">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        <span>Detected total {fmt(draft.detected_total)} differs from the item total {fmt(itemTotal)}. Check the rows before approving.</span>
                      </div>
                    )}

                    <div className="space-y-2">
                      {draft.items.map((item, index) => (
                        <div key={`${item.id || "new"}-${index}`} className={`rounded-2xl border p-3 ${Number(item.confidence || 0) < 0.6 ? "border-amber-300 bg-amber-50/40" : "border-stone-200 bg-white"}`}>
                          <div className="grid sm:grid-cols-[minmax(0,1fr)_130px_34px] gap-2 items-start">
                            <div>
                              <label className="block text-[10px] uppercase tracking-wider text-stone-400 mb-1">Item</label>
                              <input value={item.item_name} onChange={(event) => updateItem(index, { item_name: event.target.value })} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Expense item" />
                              {item.source_text && <div className="text-[11px] text-stone-400 mt-1 truncate">OCR: {item.source_text}</div>}
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase tracking-wider text-stone-400 mb-1">Amount</label>
                              <input type="number" min="0.01" step="0.01" value={item.amount} onChange={(event) => updateItem(index, { amount: event.target.value })} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="0.00" />
                            </div>
                            <button type="button" onClick={() => removeItem(index)} className="mt-5 p-2 rounded-xl text-stone-400 hover:text-rose-600 hover:bg-rose-50" aria-label="Remove item"><Trash2 size={16} /></button>
                          </div>
                          <div className="flex items-center justify-between gap-3 mt-2">
                            <select value={item.category_id || ""} onChange={(event) => updateItem(index, { category_id: event.target.value })} className="w-full max-w-xs border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-600">
                              <option value="">Use selected category</option>
                              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                            </select>
                            <span className={`text-[11px] font-semibold ${Number(item.confidence || 0) < 0.6 ? "text-amber-700" : "text-emerald-700"}`}>
                              {item.confidence == null ? "Manual" : `${Math.round(Number(item.confidence) * 100)}% confidence`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button type="button" onClick={addItem} className="flex items-center gap-2 text-sm font-semibold text-royal-700 px-3 py-2 rounded-xl hover:bg-royal-50"><Plus size={16} /> Add item</button>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <label className="text-xs font-semibold text-stone-500">Vendor / party
                        <input value={approval.party} onChange={(event) => setApproval({ ...approval, party: event.target.value })} className="mt-1 w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm font-normal" placeholder="Vendor or payee" />
                      </label>
                      <label className="text-xs font-semibold text-stone-500">Expense date
                        <input type="date" value={approval.txn_date} onChange={(event) => setApproval({ ...approval, txn_date: event.target.value })} className="mt-1 w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm font-normal" />
                      </label>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <label className="text-xs font-semibold text-stone-500">Function / event <span className="text-rose-500">*</span>
                        <select value={approval.function_id} onChange={(event) => loadFunctionDetail(event.target.value)} className="mt-1 w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm font-normal">
                          <option value="">Select an active event</option>
                          {functions.filter((fn) => fn.status === "active").map((fn) => <option key={fn.id} value={fn.id}>{fn.name}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-stone-500">Event category
                        <select value={approval.function_category_id} onChange={(event) => setApproval({ ...approval, function_category_id: event.target.value })} disabled={!approval.function_id || functionLoading} className="mt-1 w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm font-normal disabled:bg-stone-50">
                          <option value="">Optional category</option>
                          {(functionDetail?.categories || []).map((category) => <option key={category.id} value={category.id}>{category.category_name || category.name}</option>)}
                        </select>
                      </label>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-semibold text-stone-500 mb-1">Payment mode</div>
                        <div className="grid grid-cols-2 gap-2">
                          {[["cash", "Cash"], ["digital", "Digital"]].map(([value, label]) => <button key={value} type="button" onClick={() => setApproval({ ...approval, mode: value, voucher_filed: value === "digital" ? false : null })} className={`py-2.5 rounded-xl text-sm font-bold border-2 ${approval.mode === value ? "border-saffron-500 bg-saffron-50 text-saffron-700" : "border-stone-200 text-stone-600"}`}>{label}</button>)}
                        </div>
                      </div>
                      {approval.mode === "digital" ? (
                        <label className="text-xs font-semibold text-stone-500">Digital method
                          <select value={approval.digital_method} onChange={(event) => setApproval({ ...approval, digital_method: event.target.value })} className="mt-1 w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm font-normal">
                            <option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="cheque">Cheque</option><option value="other">Other</option>
                          </select>
                        </label>
                      ) : (
                        <div>
                          <div className="text-xs font-semibold text-stone-500 mb-1">Voucher filed? <span className="text-rose-500">*</span></div>
                          <div className="grid grid-cols-2 gap-2">
                            {[[true, "Filed"], [false, "Pending"]].map(([value, label]) => <button key={String(value)} type="button" onClick={() => setApproval({ ...approval, voucher_filed: value })} className={`py-2.5 rounded-xl text-sm font-bold border-2 ${approval.voucher_filed === value ? "border-saffron-500 bg-saffron-50 text-saffron-700" : "border-stone-200 text-stone-600"}`}>{label}</button>)}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-stone-500 mb-2">Notify contacts (optional)</div>
                      <div className="flex flex-wrap gap-2">
                        {contacts.filter((contact) => contact.enabled !== false).map((contact) => <button key={contact.id} type="button" onClick={() => toggleContact(contact.id)} className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${approval.notify_contact_ids.includes(contact.id) ? "border-royal-500 bg-royal-50 text-royal-700" : "border-stone-200 text-stone-500"}`}>{approval.notify_contact_ids.includes(contact.id) && <Check size={12} className="inline mr-1" />}{contact.name}</button>)}
                      </div>
                    </div>
                  </div>
                </div>

                {error && <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2.5 text-sm">{error}</div>}
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-stone-100">
                  <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-stone-200 text-stone-700 text-sm font-semibold">Cancel</button>
                   <button type="button" onClick={handleApprove} disabled={saving || persisting || !scan?.id} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-saffron-500 hover:bg-saffron-600 text-white text-sm font-bold disabled:opacity-50">
                     {saving || persisting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                     {saving ? "Approving…" : persisting ? "Saving image…" : `Approve ${draft.items.length} expense${draft.items.length === 1 ? "" : "s"}`}
                   </button>
                </div>
              </div>
            )}

            {step === "done" && (
              <div className="min-h-[300px] flex flex-col items-center justify-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"><Check size={32} /></div>
                <div><h3 className="text-lg font-bold text-stone-900">Expenses approved</h3><p className="text-sm text-stone-500 mt-1">Each reviewed item was saved as a separate expense under the selected event.</p></div>
                <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl bg-saffron-500 text-white text-sm font-bold">Close</button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
