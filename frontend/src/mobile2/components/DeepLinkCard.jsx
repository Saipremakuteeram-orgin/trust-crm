import { Monitor, ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";

export default function DeepLinkCard({ href, title = "Open on desktop", reason }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${href}`;
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {}
  };
  return (
    <div className="rounded-3xl border border-royal-100 bg-gradient-to-br from-royal-50 to-saffron-50 p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-white text-royal-600 flex items-center justify-center shrink-0">
          <Monitor size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-stone-800">{title}</p>
          {reason && <p className="text-xs text-stone-600 mt-0.5">{reason}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={href} className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl bg-white text-royal-700 border border-royal-200 active:scale-95">
              <ExternalLink size={14} /> Open
            </a>
            <button onClick={handleCopy} className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl bg-white text-stone-700 border border-stone-200 active:scale-95">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
