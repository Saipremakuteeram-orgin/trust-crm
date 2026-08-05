import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import {
  Send, Paperclip, X, Users, Loader2, Mail as MailIcon, Search, ShieldAlert, File as FileIcon, ChevronDown, Inbox, ArrowLeft,
} from "lucide-react";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const statusConfig = {
  sent: { color: "text-emerald-500", bg: "bg-emerald-50", ring: "ring-emerald-200", label: "Sent" },
  failed: { color: "text-rose-500", bg: "bg-rose-50", ring: "ring-rose-200", label: "Failed" },
};

export default function Mail() {
  const { session, profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canEdit = role === "admin" || role === "accountant";

  const [contacts, setContacts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const [toInput, setToInput] = useState("");
  const [toChips, setToChips] = useState([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [search, setSearch] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [sending, setSending] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const fileInputRef = useRef(null);
  const bodyRef = useRef(null);

  function loadContacts() {
    api.get("/contacts").then((res) => setContacts(res.data.result || [])).catch(() => setContacts([]));
  }
  function loadLogs() {
    setLoadingLogs(true);
    api.get("/mail/logs")
      .then((res) => setLogs(res.data.result || []))
      .catch(() => {})
      .finally(() => setLoadingLogs(false));
  }
  useEffect(() => { loadContacts(); loadLogs(); }, []);

  const recipientsWithEmail = contacts.filter((c) => c.email);
  const filteredRecipients = recipientsWithEmail.filter((c) =>
    (c.name || c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  function addChip(email) {
    const e = email.trim();
    if (!e || toChips.includes(e) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return;
    setToChips((prev) => [...prev, e]);
    setToInput("");
    setSearch("");
  }
  function handleToKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addChip(toInput);
    } else if (e.key === "Backspace" && !toInput && toChips.length) {
      setToChips((prev) => prev.slice(0, -1));
    }
  }
  function removeChip(email) {
    setToChips((prev) => prev.filter((c) => c !== email));
  }

  function toggleContactRecipient(c) {
    if (toChips.includes(c.email)) setToChips((prev) => prev.filter((x) => x !== c.email));
    else setToChips((prev) => [...prev, c.email]);
  }

  function handleFiles(e) {
    const list = Array.from(e.target.files || []);
    setAttachments((prev) => [...prev, ...list]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  function removeAttachment(name) {
    setAttachments((prev) => prev.filter((f) => f.name !== name));
  }

  async function exec(command) {
    document.execCommand(command, false, null);
    if (bodyRef.current) setBody(bodyRef.current.innerHTML);
    bodyRef.current?.focus();
  }

  async function handleSend() {
    const allRecipients = [...toChips, ...toInput.split(",").map((s) => s.trim()).filter(Boolean)];
    if (allRecipients.length === 0) return addToast("Add at least one recipient", "error");
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("to", allRecipients.join(","));
      formData.append("subject", subject);
      formData.append("body", bodyRef.current ? bodyRef.current.innerHTML : body);
      attachments.forEach((f) => formData.append("attachments", f));

      const res = await api.post("/mail/send", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const r = res.data.result;
      addToast(`Mail "${r.subject}" sent to ${r.recipients.length} recipient(s)`, "success");
      setToChips([]); setToInput(""); setSubject(""); setBody(""); setAttachments([]);
      if (bodyRef.current) bodyRef.current.innerHTML = "";
      loadLogs();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to send mail", "error");
    }
    setSending(false);
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Mail</h1>
          <p className="text-sm text-stone-500 mt-1">Compose and send emails with attachments</p>
        </div>
        <button onClick={() => setShowSent((s) => !s)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors">
          <Inbox size={15} /> {showSent ? "Compose" : "Sent"} ({logs.length})
        </button>
      </motion.div>

      {!canEdit && (
        <div className="flex items-center gap-3 mb-6 bg-royal-50 border border-royal-100 rounded-2xl px-5 py-3 text-sm text-royal-700">
          <ShieldAlert size={18} /> You have read-only access. You can view the Sent folder below.
        </div>
      )}

      {showSent || !canEdit ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100 flex items-center gap-2">
            <button onClick={() => setShowSent(false)}
              className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 transition-colors">
              <ArrowLeft size={16} />
            </button>
            <Inbox size={16} className="text-stone-500" />
            <h2 className="text-sm font-semibold text-stone-700">Sent Mail</h2>
          </div>
          {loadingLogs ? (
            <div className="flex items-center justify-center py-16"><Loader2 size={26} className="animate-spin text-saffron-500" /></div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 text-stone-400"><MailIcon size={36} className="mx-auto mb-3 opacity-40" /><p className="font-medium">No mail sent yet</p></div>
          ) : (
            <div className="divide-y divide-stone-100">
              {logs.map((log, i) => {
                const cfg = statusConfig[log.status] || statusConfig.failed;
                const recips = Array.isArray(log.recipients) ? log.recipients : [];
                return (
                  <motion.div key={log.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                    className="px-5 py-4 hover:bg-stone-50/50">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-stone-800 truncate">{log.subject}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} ring-1 ${cfg.ring}`}>{cfg.label}</span>
                          {log.attachment_names?.length > 0 && (
                            <span className="text-[10px] text-stone-400 flex items-center gap-1"><Paperclip size={11} />{log.attachment_names.length}</span>
                          )}
                        </div>
                        <p className="text-xs text-stone-500 mt-1 truncate">From: {log.sender_email || session?.user?.email || "—"}</p>
                        <p className="text-xs text-stone-500 mt-1 truncate">To: {recips.map((r) => r.email).join(", ") || "—"}</p>
                        {log.body_text && <p className="text-xs text-stone-400 mt-1 line-clamp-2">{log.body_text}</p>}
                      </div>
                      <div className="text-xs text-stone-400 whitespace-nowrap">{formatDate(log.created_at)}</div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
          {/* Compose header */}
          <div className="flex items-center gap-2 px-5 py-4 border-b border-stone-100 bg-stone-50/60">
            <MailIcon size={16} className="text-stone-500" />
            <h2 className="text-sm font-semibold text-stone-700">New Message</h2>
          </div>

          {/* To field */}
          <div className="flex items-start gap-3 px-5 py-3 border-b border-stone-100">
            <label className="text-sm font-medium text-stone-500 pt-2 min-w-[40px]">To</label>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-1.5 min-h-[36px] rounded-lg border border-stone-200 px-2 py-1.5 focus-within:ring-2 focus-within:ring-saffron-400">
                {toChips.map((email) => (
                  <span key={email} className="flex items-center gap-1 bg-saffron-100 text-saffron-700 text-xs font-medium px-2 py-1 rounded-full">
                    {email}
                    <button type="button" onClick={() => removeChip(email)} className="hover:text-saffron-900"><X size={12} /></button>
                  </span>
                ))}
                <input
                  value={toInput}
                  onChange={(e) => { setToInput(e.target.value); setSearch(e.target.value); }}
                  onKeyDown={handleToKeyDown}
                  onBlur={() => addChip(toInput)}
                  placeholder={toChips.length ? "" : "recipient@email.com"}
                  className="flex-1 min-w-[120px] text-sm outline-none bg-transparent py-0.5"
                />
              </div>
              {search && (
                <div className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-stone-200 divide-y divide-stone-100">
                  {filteredRecipients.length === 0 && <div className="px-4 py-2 text-sm text-stone-400">No contacts</div>}
                  {filteredRecipients.map((c) => (
                    <button key={c.id} type="button" onClick={() => toggleContactRecipient(c)}
                      className={`w-full flex items-center gap-2 px-4 py-2 text-left text-sm hover:bg-stone-50 ${toChips.includes(c.email) ? "bg-saffron-50" : ""}`}>
                      <Users size={13} className="text-stone-400" />
                      <span className="font-medium text-stone-800">{c.name || c.email}</span>
                      <span className="text-stone-400 text-xs">{c.email}</span>
                      {toChips.includes(c.email) && <span className="ml-auto text-saffron-600 text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setShowCc((s) => !s)} className="text-xs text-stone-400 hover:text-stone-600 pt-2">Cc</button>
          </div>

          {showCc && (
            <div className="flex items-center gap-3 px-5 py-3 border-b border-stone-100">
              <label className="text-sm font-medium text-stone-500 min-w-[40px]">Cc</label>
              <input
                onChange={(e) => setToInput(e.target.value)}
                placeholder="cc@email.com (comma separated)"
                className="flex-1 text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-saffron-400"
              />
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-stone-100">
            <label className="text-sm font-medium text-stone-500 min-w-[40px]">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 text-sm border-0 outline-none focus:ring-0 px-1 py-1"
            />
          </div>

          {/* Body (rich text) */}
          <div className="px-5 py-3">
            <div className="flex items-center gap-1 mb-2 border-b border-stone-100 pb-2">
              {["bold", "italic", "underline"].map((cmd) => (
                <button key={cmd} type="button" onMouseDown={(e) => { e.preventDefault(); exec(cmd); }}
                  className="w-8 h-8 rounded-lg text-stone-500 hover:bg-stone-100 capitalize font-semibold text-xs">
                  {cmd[0].toUpperCase()}
                </button>
              ))}
              <span className="w-px h-5 bg-stone-200 mx-1" />
              <button type="button" onMouseDown={(e) => { e.preventDefault(); document.execCommand("insertUnorderedList", false, null); }}
                className="w-8 h-8 rounded-lg text-stone-500 hover:bg-stone-100 text-xs">•≡</button>
            </div>
            <div
              ref={bodyRef}
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => setBody(e.currentTarget.innerHTML)}
              className="min-h-[200px] text-sm text-stone-800 outline-none leading-relaxed"
              style={{ whiteSpace: "pre-wrap" }}
              data-placeholder="Compose your message..."
            />
          </div>

          {/* Attachments */}
          <div className="px-5 pb-3">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachments.map((f) => (
                  <span key={f.name} className="flex items-center gap-1.5 bg-stone-100 text-stone-700 text-xs px-2.5 py-1.5 rounded-lg">
                    <FileIcon size={13} /> {f.name}
                    <button type="button" onClick={() => removeAttachment(f.name)} className="hover:text-rose-500"><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFiles} />
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 text-sm text-stone-600 rounded-xl border border-stone-200 hover:bg-stone-50 transition-colors">
              <Paperclip size={15} /> Attach files
            </button>
          </div>

          {/* Send bar */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-stone-100 bg-stone-50/60">
            <span className="text-xs text-stone-400">From: {session?.user?.email || profile?.email || "—"}</span>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleSend} disabled={sending}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold shadow-lg shadow-saffron-500/20 hover:shadow-xl transition-all disabled:opacity-50">
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {sending ? "Sending..." : "Send"}
            </motion.button>
          </div>
        </motion.div>
      )}
    </AppLayout>
  );
}
