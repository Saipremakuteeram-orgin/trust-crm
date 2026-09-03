import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Monitor, Copy, Check } from "lucide-react";
import api from "../../lib/api";

export default function MobileDensePlaceholder({
  desktopPath,
  endpoint,
  endpointParams,
  method = "get",
  summary,
  renderSummary,
  renderRows,
  rowLimit = 8,
  transform,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const r = await api[method](endpoint, method === "get" ? { params: endpointParams } : endpointParams);
        if (cancelled) return;
        const v = transform ? transform(r.data) : r.data?.result ?? r.data;
        setData(v);
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [endpoint]);

  const url = `${window.location.origin}${desktopPath}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="space-y-3 pb-24 px-4 pt-3">
      <div className="m-card">
        <div className="text-sm font-bold text-stone-800">{summary || "Summary"}</div>
        {loading && <p className="text-xs text-stone-400 mt-2">Loading…</p>}
        {error && <p className="text-xs text-rose-500 mt-2">{error}</p>}
        {!loading && !error && renderSummary && renderSummary(data)}
      </div>

      {renderRows && (
        <div className="m-card !p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-800">Top items</h3>
            <span className="text-[10px] text-stone-400">Up to {rowLimit}</span>
          </div>
          {loading ? (
            <p className="text-xs text-stone-400 px-4 py-6 text-center">Loading…</p>
          ) : (
            <ul className="m-list">{renderRows(data, rowLimit)}</ul>
          )}
        </div>
      )}

      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="m-card bg-gradient-to-br from-royal-50 to-saffron-50 border-royal-100"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white text-royal-600 flex items-center justify-center shrink-0">
              <Monitor size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-stone-800">Open full view on desktop</p>
              <p className="text-xs text-stone-600 mt-0.5">
                Editing and detailed reports work best on a larger screen.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={desktopPath} className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg bg-white text-royal-700 border border-royal-200 active:scale-95">
                  Open desktop page
                </a>
                <button onClick={handleCopy} className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg bg-white text-stone-700 border border-stone-200 active:scale-95">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
