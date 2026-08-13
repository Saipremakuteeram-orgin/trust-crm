import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { MessageCircle, Shield, RefreshCw, ExternalLink, MessageSquare } from "lucide-react";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import api from "../lib/api";

// WhatsApp Web is served through our own backend proxy (/wa) so it can be
// embedded in an iframe (WhatsApp's own CSP forbids direct framing).
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

export default function WhatsAppPage() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";

  const iframeRef = useRef(null);
  const [contacts, setContacts] = useState([]);
  const [frameBlocked, setFrameBlocked] = useState(false);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await api.get("/contacts");
      const list = res.data.result || res.data || [];
      setContacts(Array.isArray(list) ? list : []);
    } catch {
      addToast("Failed to load contacts", "error");
    }
  }, [addToast]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // If WhatsApp refuses to load inside the frame (its CSP blocks framing),
  // surface a fallback after a short wait.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const doc = iframeRef.current && iframeRef.current.contentDocument;
        // Cross-origin: contentDocument is null when blocked/empty.
        if (!doc || doc.body === null) {
          // Can't reliably detect block cross-origin; leave as-is.
        }
      } catch (_) { /* cross-origin, ignore */ }
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  const reloadFrame = () => {
    if (iframeRef.current) iframeRef.current.src = WHATSAPP_WEB_URL;
    setFrameBlocked(false);
  };

  const openChatInFrame = (phone) => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      addToast("No phone number for this contact", "error");
      return;
    }
    if (iframeRef.current) iframeRef.current.src = `${WHATSAPP_WEB_URL}/send?phone=${normalized}`;
  };

  const canEdit = role === "admin" || role === "accountant";

  if (!canEdit) {
    return (
      <AppLayout>
        <div className="flex items-center gap-3 bg-royal-50 border border-royal-100 rounded-2xl px-5 py-3 text-sm text-royal-700">
          <Shield size={18} /> WhatsApp integration is restricted to Admin and Accountant roles.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">WhatsApp Integration</h1>
          <p className="text-sm text-stone-500 mt-1">WhatsApp Web embedded inline — message CRM contacts directly</p>
        </div>
        <button onClick={reloadFrame}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-700 bg-stone-100 rounded-xl hover:bg-stone-200 transition-colors">
          <RefreshCw size={14} /> Reload
        </button>
      </motion.div>

      <div className="h-[calc(100vh-220px)] grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Embedded WhatsApp Web */}
        <div className="relative bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
          <iframe
            ref={iframeRef}
            src={WHATSAPP_WEB_URL}
            title="WhatsApp Web"
            className="w-full h-full border-0"
            onError={() => setFrameBlocked(true)}
          />
          {frameBlocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
              <MessageCircle size={32} className="text-stone-300" />
              <p className="text-sm text-stone-500">WhatsApp Web could not be embedded.</p>
              <a href={WHATSAPP_WEB_URL} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-600 bg-emerald-50 rounded-xl hover:bg-emerald-100">
                <ExternalLink size={14} /> Open WhatsApp Web
              </a>
            </div>
          )}
        </div>

        {/* CRM contacts */}
        <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-4 overflow-y-auto">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={16} className="text-royal-500" />
            <h2 className="text-sm font-semibold text-stone-900">CRM Contacts</h2>
          </div>
          {contacts.length === 0 ? (
            <p className="text-xs text-stone-400">No contacts found.</p>
          ) : (
            <div className="space-y-1.5">
              {contacts.map((c) => (
                <button key={c.id} onClick={() => openChatInFrame(c.phone)}
                  disabled={!c.phone}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-stone-100 hover:bg-stone-50 transition-colors text-left disabled:opacity-40">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{c.name}</p>
                    <p className="text-xs text-stone-400 truncate">{c.phone || "No phone"}</p>
                  </div>
                  <MessageSquare size={14} className="text-emerald-500 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
