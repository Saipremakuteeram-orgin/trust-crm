import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { QrCode, MessageCircle, Shield, ExternalLink, MessageSquare } from "lucide-react";
import AppLayout from "../components/AppLayout";
import QRScanner from "../components/WhatsApp/QRScanner";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import api from "../lib/api";

const WHATSAPP_WEB_URL = "https://web.whatsapp.com";

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

  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLinkQR = useCallback(async () => {
    try {
      const res = await api.get("/whatsapp/link-qr", { params: { url: WHATSAPP_WEB_URL } });
      setQrDataUrl(res.data.result.dataUrl);
    } catch {
      /* ignore */
    }
  }, []);

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
    fetchLinkQR();
    fetchContacts();
  }, [fetchLinkQR, fetchContacts]);

  const openWhatsAppWeb = () => {
    window.open(WHATSAPP_WEB_URL, "_blank", "noopener,noreferrer");
  };

  const openChat = (phone) => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      addToast("No phone number for this contact", "error");
      return;
    }
    window.open(`https://wa.me/${normalized}`, "_blank", "noopener,noreferrer");
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
          <p className="text-sm text-stone-500 mt-1">Open WhatsApp Web and message CRM contacts directly</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Direct access panel */}
        <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <MessageCircle size={18} className="text-emerald-500" />
            <h2 className="text-lg font-semibold text-stone-900">Open WhatsApp Web</h2>
          </div>

          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={openWhatsAppWeb}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-semibold shadow-lg shadow-emerald-500/20 hover:shadow-xl transition-all">
            <ExternalLink size={16} />
            Launch WhatsApp Web
          </motion.button>

          <div className="mt-6 flex flex-col items-center">
            {qrDataUrl ? (
              <QRScanner qrDataUrl={qrDataUrl} onRefresh={fetchLinkQR} />
            ) : (
              <div className="flex items-center gap-2 text-stone-400 text-sm">
                <QrCode size={16} className="animate-pulse" /> Loading QR…
              </div>
            )}
            <p className="text-xs text-stone-500 mt-3 text-center max-w-xs">
              Scan with your phone's camera to open WhatsApp Web, or use the launch button above.
            </p>
          </div>
        </div>

        {/* CRM contacts */}
        <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare size={18} className="text-royal-500" />
            <h2 className="text-lg font-semibold text-stone-900">CRM Contacts</h2>
          </div>

          {loading ? (
            <p className="text-sm text-stone-400">Loading…</p>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-stone-400">No contacts found.</p>
          ) : (
            <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
              {contacts.map((c) => (
                <div key={c.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-stone-100 hover:bg-stone-50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{c.name}</p>
                    <p className="text-xs text-stone-400 truncate">{c.phone || "No phone"}</p>
                  </div>
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={() => openChat(c.phone)}
                    disabled={!c.phone}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-40">
                    <MessageSquare size={13} />
                    Chat
                  </motion.button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
