import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import api from "../lib/api";

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/search?q=${encodeURIComponent(q)}`);
        setResults(data?.result || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-500 text-sm transition-colors"
      >
        <Search size={14} />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-white border border-stone-200">Ctrl K</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100">
          <Search size={16} className="text-stone-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search contacts, transactions, receipts, compliance…"
            className="flex-1 outline-none text-sm text-stone-800 placeholder-stone-400"
          />
          <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-600">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading && <div className="px-4 py-3 text-sm text-stone-400">Searching…</div>}
          {!loading && results.length === 0 && q.trim() && (
            <div className="px-4 py-3 text-sm text-stone-400">No results</div>
          )}
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => { navigate(r.to); setOpen(false); setQ(""); }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-stone-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-stone-800 truncate">{r.title}</div>
                <div className="text-xs text-stone-500 truncate">{r.subtitle}</div>
              </div>
              <span className="text-[10px] uppercase font-semibold text-stone-400">{r.type}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
