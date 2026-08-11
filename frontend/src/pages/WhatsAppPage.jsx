import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QrCode, MessageCircle, Shield, Loader2, Wifi, WifiOff } from "lucide-react";
import AppLayout from "../components/AppLayout";
import QRScanner from "../components/WhatsApp/QRScanner";
import ChatSidebar from "../components/WhatsApp/ChatSidebar";
import ChatWindow from "../components/WhatsApp/ChatWindow";
import FilePicker from "../components/WhatsApp/FilePicker";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import api from "../lib/api";
import { supabase } from "../lib/supabase";

const STATUS = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  QR_PENDING: "qr_pending",
  CONNECTED: "connected",
};

function StatusBadge({ status }) {
  const config = {
    [STATUS.DISCONNECTED]: { Icon: WifiOff, label: "Disconnected", color: "text-stone-500", bg: "bg-stone-100" },
    [STATUS.CONNECTING]: { Icon: Loader2, label: "Connecting", color: "text-amber-500", bg: "bg-amber-50" },
    [STATUS.QR_PENDING]: { Icon: QrCode, label: "Scan QR Code", color: "text-saffron-500", bg: "bg-saffron-50" },
    [STATUS.CONNECTED]: { Icon: Wifi, label: "Connected", color: "text-emerald-500", bg: "bg-emerald-50" },
  };
  const c = config[status] || config[STATUS.DISCONNECTED];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.color} ring-1 ring-inset ring-current ring-opacity-10`}>
      <c.Icon size={12} className={status === STATUS.CONNECTING ? "animate-spin" : ""} />
      {c.label}
    </span>
  );
}

export default function WhatsAppPage() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";

  const [sessionStatus, setSessionStatus] = useState(STATUS.DISCONNECTED);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [chats, setChats] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const sseRef = useRef(null);
  const messageEndRef = useRef(null);
  const selectedChatRef = useRef(null);

  useEffect(() => { selectedChatRef.current = selectedChat; }, [selectedChat]);

  const fetchQR = useCallback(async () => {
    try {
      const res = await api.get("/whatsapp/qr");
      const { qr, dataUrl } = res.data.result;
      if (qr && dataUrl) {
        setQrDataUrl(dataUrl);
        setSessionStatus(STATUS.QR_PENDING);
      }
    } catch {
      /* no QR yet */
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get("/whatsapp/status");
      const { connected } = res.data.result;
      if (connected) {
        setSessionStatus(STATUS.CONNECTED);
      } else {
        await fetchQR();
        setSessionStatus(STATUS.DISCONNECTED);
      }
    } catch {
      setSessionStatus(STATUS.DISCONNECTED);
    }
  }, [fetchQR]);

  const fetchChats = useCallback(async () => {
    try {
      const res = await api.get("/whatsapp/chats");
      setChats(res.data.result);
    } catch {
      addToast("Failed to load chats", "error");
    } finally {
    }
  }, [addToast]);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await api.get("/whatsapp/sync-contacts");
      setContacts(res.data.result);
    } catch {
      addToast("Failed to sync contacts", "error");
    }
  }, [addToast]);

  const fetchMessages = useCallback(async (chatId) => {
    if (!chatId) return;
    setLoadingMessages(true);
    try {
      const res = await api.get(`/whatsapp/chats/${encodeURIComponent(chatId)}/messages`);
      const msgs = res.data.result;
      setMessages(msgs.reverse());
    } catch {
      addToast("Failed to load messages", "error");
    } finally {
      setLoadingMessages(false);
    }
  }, [addToast]);

  const handleSelectChat = useCallback((chat) => {
    setSelectedChat(chat);
    setShowFilePicker(false);
    if (chat.isWAContact) {
      fetchMessages(chat.id);
    }
  }, [fetchMessages]);

  const handleConnect = async () => {
    setLoading(true);
    try {
      await api.post("/whatsapp/connect");
      setSessionStatus(STATUS.CONNECTING);
      addToast("WhatsApp client initializing… check for a QR code below.", "success");
      setTimeout(fetchQR, 3000);
    } catch {
      addToast("Failed to connect WhatsApp", "error");
    }
    setLoading(false);
  };

  const handleDisconnect = async () => {
    try {
      await api.post("/whatsapp/disconnect");
      setSessionStatus(STATUS.DISCONNECTED);
      setQrDataUrl(null);
      setSelectedChat(null);
      setMessages([]);
      setChats([]);
      addToast("WhatsApp disconnected", "success");
    } catch {
      addToast("Failed to disconnect", "error");
    }
  };

  const handleSendMessage = async (text) => {
    if (!selectedChat || !text.trim()) return;
    const phone = selectedChat.phoneNorm || selectedChat.number;
    if (!phone) return addToast("No phone number for this contact", "error");
    try {
      await api.post("/whatsapp/send", { phone, message: text });
      setMessages((prev) => [...prev, { fromMe: true, body: text, timestamp: Date.now() / 1000, ack: 3 }]);
      messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to send message", "error");
    }
  };

  const setupSSE = useCallback(() => {
    if (sseRef.current) sseRef.current.close();

    supabase.auth.getSession().then(({ data }) => {
      const token = data?.session?.access_token;
      if (!token) return;

      const baseUrl = api.defaults.baseURL.replace("/api", "");
      const url = `${baseUrl}/api/whatsapp/events/stream?token=${token}`;
      const evtSource = new EventSource(url);
      sseRef.current = evtSource;

      evtSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const { event: evt, data } = payload;

          if (evt === "qr") {
            fetchQR();
          } else if (evt === "authenticated") {
            setSessionStatus(STATUS.CONNECTING);
          } else if (evt === "ready") {
            setSessionStatus(STATUS.CONNECTED);
            setQrDataUrl(null);
            fetchChats();
            fetchContacts();
          } else if (evt === "message") {
            if (selectedChatRef.current && data.chatId && selectedChatRef.current.id === data.chatId) {
              setMessages((prev) => [...prev, data]);
              setTimeout(() => messageEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            }
          } else if (evt === "disconnected") {
            setSessionStatus(STATUS.DISCONNECTED);
            setQrDataUrl(null);
            setChats([]);
            addToast("WhatsApp session disconnected", "warning");
          } else if (evt === "auth_failure") {
            setSessionStatus(STATUS.DISCONNECTED);
            setQrDataUrl(null);
            addToast(data?.message || "WhatsApp authentication failed", "error");
          }
        } catch (e) {
          console.error("[WhatsApp SSE] parse error:", e);
        }
      };

      evtSource.onerror = (err) => {
        console.error("[WhatsApp SSE] error:", err);
      };
    });
  }, [fetchQR, fetchChats, fetchContacts, addToast]);

  useEffect(() => {
    fetchStatus();
    setupSSE();
    return () => {
      if (sseRef.current) sseRef.current.close();
    };
  }, [fetchStatus, setupSSE]);

  useEffect(() => {
    if (sessionStatus === STATUS.CONNECTED) {
      fetchChats();
      fetchContacts();
    }
  }, [sessionStatus, fetchChats, fetchContacts]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
          <p className="text-sm text-stone-500 mt-1">Embed WhatsApp Web to message CRM contacts directly</p>
        </div>
        <StatusBadge status={sessionStatus} />
      </motion.div>

      <div className="h-[calc(100vh-240px)] flex bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
        <AnimatePresence>
          {sessionStatus === STATUS.DISCONNECTED && !qrDataUrl && (
            <motion.div key="connect-prompt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
              <div className="w-20 h-20 rounded-3xl bg-royal-100 flex items-center justify-center">
                <MessageCircle size={36} className="text-royal-600" />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-semibold text-stone-900 mb-2">Connect your WhatsApp</h3>
                <p className="text-sm text-stone-500 max-w-md">
                  Scan the QR code with your phone's WhatsApp app to link your account.
                  Your session is encrypted and isolated to your user account only.
                </p>
              </div>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={handleConnect} disabled={loading}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold shadow-lg shadow-saffron-500/20 hover:shadow-xl transition-all disabled:opacity-50">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
                Connect WhatsApp
              </motion.button>
            </motion.div>
          )}

          {(sessionStatus === STATUS.QR_PENDING || sessionStatus === STATUS.CONNECTING) && qrDataUrl && (
            <motion.div key="qr-scanner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 p-8 overflow-y-auto">
              <QRScanner qrDataUrl={qrDataUrl} onRefresh={fetchQR} />
              <div className="mt-4 text-center">
                <p className="text-xs text-stone-500">Waiting for you to scan the QR code with your phone</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {sessionStatus === STATUS.CONNECTED && (
          <>
            <ChatSidebar
              chats={chats}
              contacts={contacts}
              selectedChat={selectedChat}
              onSelectChat={handleSelectChat}
              onRefreshContacts={fetchContacts}
            />
            <div className="flex-1 flex flex-col">
              {selectedChat ? (
                <ChatWindow
                  chat={selectedChat}
                  messages={messages}
                  loading={loadingMessages}
                  onSendMessage={handleSendMessage}
                  onAttach={() => setShowFilePicker(true)}
                  messageEndRef={messageEndRef}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-stone-400">
                  <div className="text-center">
                    <MessageCircle size={48} className="mx-auto mb-3 opacity-20" />
                    <p>Select a contact or chat to start messaging</p>
                  </div>
                </div>
              )}
            </div>
            {showFilePicker && (
              <FilePicker
                onClose={() => setShowFilePicker(false)}
                selectedChat={selectedChat}
                onSendFile={() => addToast("File sent via WhatsApp", "success")}
              />
            )}
            <button onClick={handleDisconnect}
              className="absolute top-4 right-4 p-2 rounded-lg bg-stone-100 hover:bg-stone-200 transition-colors"
              title="Disconnect WhatsApp">
              <WifiOff size={16} />
            </button>
          </>
        )}
      </div>
    </AppLayout>
  );
}

