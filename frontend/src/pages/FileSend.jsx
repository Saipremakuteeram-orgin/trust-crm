import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import {
  Send, Upload, File as FileIcon, Users, Loader2, CheckCircle, XCircle, Clock, ShieldAlert, Search,
} from "lucide-react";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const statusConfig = {
  sent: { icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-50", ring: "ring-emerald-200", label: "Sent" },
  partial: { icon: Clock, color: "text-amber-500", bg: "bg-amber-50", ring: "ring-amber-200", label: "Partial" },
  failed: { icon: XCircle, color: "text-rose-500", bg: "bg-rose-50", ring: "ring-rose-200", label: "Failed" },
};

export default function FileSend() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canEdit = role === "admin" || role === "accountant";

  const [contacts, setContacts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);

  function loadContacts() {
    api.get("/contacts").then((res) => setContacts(res.data.result || [])).catch(() => setContacts([]));
  }
  function loadLogs() {
    setLoadingLogs(true);
    api.get("/file-send/logs")
      .then((res) => setLogs(res.data.result || []))
      .catch(() => {})
      .finally(() => setLoadingLogs(false));
  }
  useEffect(() => { loadContacts(); loadLogs(); }, []);

  const recipientsWithEmail = contacts.filter((c) => c.email);
  const filteredRecipients = recipientsWithEmail.filter((c) =>
    (c.name || c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  function toggleRecipient(email) {
    setSelectedRecipients((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  }

  async function handleSend() {
    if (!selectedFile) return addToast("Please choose a file", "error");
    if (selectedRecipients.length === 0) return addToast("Select at least one recipient", "error");
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("recipients", JSON.stringify(selectedRecipients));
      const res = await api.post("/file-send/send", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const r = res.data.result;
      addToast(`Sent "${r.docName}" — ${r.status} (${r.recipients.filter((x) => x.status === "sent").length}/${r.recipients.length})`, "success");
      setSelectedFile(null);
      setSelectedRecipients([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadLogs();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to send file", "error");
    }
    setSending(false);
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Send File</h1>
          <p className="text-sm text-stone-500 mt-1">Upload a document and email it to contacts via Telegram</p>
        </div>
      </motion.div>

      {!canEdit && (
        <div className="flex items-center gap-3 mb-6 bg-royal-50 border border-royal-100 rounded-2xl px-5 py-3 text-sm text-royal-700">
          <ShieldAlert size={18} /> You have read-only access. You can view sent-file history below.
        </div>
      )}

      {canEdit && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6 mb-6">
          {/* File picker */}
          <div className="mb-5">
            <label className="text-sm font-medium text-stone-700 mb-1.5 block">Document *</label>
            <label className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 cursor-pointer hover:border-saffron-400 hover:bg-saffron-50/30 transition-all">
              <Upload size={18} className="text-stone-400" />
              <span className="text-sm text-stone-600">
                {selectedFile ? selectedFile.name : "Click to choose a file from your device"}
              </span>
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
            </label>
          </div>

          {/* Recipients */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-stone-700">Recipients *</label>
              <span className="text-xs text-stone-400">{selectedRecipients.length} selected</span>
            </div>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contacts by name or email"
                className="w-full pl-9 pr-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-saffron-400" />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-stone-200 divide-y divide-stone-100">
              {filteredRecipients.length === 0 && (
                <div className="px-4 py-3 text-sm text-stone-400">No contacts with email found</div>
              )}
              {filteredRecipients.map((c) => {
                const checked = selectedRecipients.includes(c.email);
                return (
                  <button key={c.id} type="button" onClick={() => toggleRecipient(c.email)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${checked ? "bg-saffron-50" : "hover:bg-stone-50"}`}>
                    <span className={`w-4 h-4 rounded border flex items-center justify-center ${checked ? "bg-saffron-500 border-saffron-500" : "border-stone-300"}`}>
                      {checked && <CheckCircle size={12} className="text-white" />}
                    </span>
                    <span className="font-medium text-stone-800">{c.name || c.email}</span>
                    <span className="text-stone-400 text-xs">{c.email}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleSend} disabled={sending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold shadow-lg shadow-saffron-500/20 hover:shadow-xl transition-all disabled:opacity-50">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {sending ? "Sending..." : "Send File"}
          </motion.button>
        </motion.div>
      )}

      {/* Sent history (visible to all roles) */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100 flex items-center gap-2">
          <FileIcon size={16} className="text-stone-500" />
          <h2 className="text-sm font-semibold text-stone-700">Sent Files History</h2>
        </div>
        {loadingLogs ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={26} className="animate-spin text-saffron-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-stone-400">
            <Clock size={36} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No files sent yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-500 text-left">
                <tr>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Document</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Sent By</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Recipients</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const cfg = statusConfig[log.status] || statusConfig.failed;
                  const StatusIcon = cfg.icon;
                  const recips = Array.isArray(log.recipients) ? log.recipients : [];
                  const sentCount = recips.filter((r) => r.status === "sent").length;
                  return (
                    <motion.tr key={log.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }} className="border-t border-stone-100">
                      <td className="px-5 py-3 font-medium text-stone-800">{log.doc_name}</td>
                      <td className="px-5 py-3 text-stone-600 text-xs">{log.sender_email || "—"}</td>
                      <td className="px-5 py-3 text-stone-600 text-xs max-w-[260px]">
                        {recips.length === 0 ? "—" : (
                          <span title={recips.map((r) => r.email).join(", ")}>
                            {recips.slice(0, 2).map((r) => r.email).join(", ")}
                            {recips.length > 2 ? ` +${recips.length - 2} more` : ""}
                            <span className="text-stone-400"> ({sentCount}/{recips.length})</span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color} ring-1 ${cfg.ring}`}>
                          <StatusIcon size={12} /> {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-stone-500 text-xs">{formatDate(log.created_at)}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </AppLayout>
  );
}
