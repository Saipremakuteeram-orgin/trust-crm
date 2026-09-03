import { useEffect, useRef, useState } from "react";
import { RefreshCw, MessageCircle } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileCard from "../components/MobileCard";
import MobileListItem from "../components/MobileListItem";
import EmptyState from "../components/EmptyState";
import { useToast } from "../../components/Toast";

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
  const { addToast } = useToast();
  const iframeRef = useRef(null);
  const [contacts, setContacts] = useState([]);
  const [search] = useState("");

  useEffect(() => {
    api.get("/contacts").then((r) => setContacts(r.data.result || [])).catch(() => addToast("Failed to load", "error"));
  }, []);

  const filtered = contacts.filter((c) => (c.name || "").toLowerCase().includes(search.toLowerCase()));

  const openChat = (phone) => {
    const norm = normalizePhone(phone);
    if (!norm) return addToast("No phone", "error");
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.location.href = `${WHATSAPP_WEB_URL}/send?phone=${norm}`;
    }
  };

  return (
    <MobileShell title="WhatsApp" subtitle="Chat">
      <div className="px-4 pt-3">
        <MobileCard>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold text-stone-800 flex items-center gap-2"><MessageCircle size={16} /> Web</div>
            <button onClick={() => iframeRef.current && (iframeRef.current.src = WHATSAPP_WEB_URL)} className="m-tap w-9 h-9 rounded-lg bg-royal-50 text-royal-600 flex items-center justify-center"><RefreshCw size={14} /></button>
          </div>
          <iframe ref={iframeRef} src={WHATSAPP_WEB_URL} title="WhatsApp Web" className="w-full rounded-xl border border-stone-200" style={{ height: "45vh" }} />
        </MobileCard>
      </div>

      <div className="px-4 pt-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-2">Contacts</div>
        {filtered.length === 0 ? (
          <EmptyState title="No contacts" message="Add contacts to start a chat." />
        ) : (
          <div className="m-card !p-0 overflow-hidden">
            <ul className="m-list">
              {filtered.map((c) => (
                <MobileListItem
                  key={c.id}
                  onClick={() => openChat(c.phone)}
                  title={c.name || "Unnamed"}
                  subtitle={c.phone || "No phone"}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
