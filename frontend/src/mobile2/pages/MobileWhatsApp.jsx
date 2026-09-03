import { useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";
import MobileShell from "../MobileShell";
import Card from "../components/Card";

const API_URL = import.meta.env.VITE_API_URL || "";
const PROXY_BASE = API_URL.replace(/\/api\/?$/, "");
const WHATSAPP_WEB_URL = `${PROXY_BASE}/wa`;

function normalizePhone(p) {
  if (!p) return null;
  let d = String(p).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.substring(2);
  if (d.startsWith("0")) d = "91" + d.substring(1);
  if (!d.startsWith("91")) d = "91" + d;
  return d;
}

export default function MobileWhatsApp() {
  const iframeRef = useRef(null);

  return (
    <MobileShell title="WhatsApp">
      <div className="p-4 space-y-3">
        <Card>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold text-stone-800">Web</div>
            <button onClick={() => iframeRef.current && (iframeRef.current.src = WHATSAPP_WEB_URL)} className="m-tap w-9 h-9 rounded-xl bg-royal-50 text-royal-600 flex items-center justify-center"><RefreshCw size={14} /></button>
          </div>
          <iframe ref={iframeRef} src={WHATSAPP_WEB_URL} title="WhatsApp" className="w-full rounded-2xl border border-stone-200" style={{ height: "55vh" }} />
        </Card>
      </div>
    </MobileShell>
  );
}
