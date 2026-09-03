import { useEffect, useState, useRef } from "react";
import { Send, Paperclip } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileCard from "../components/MobileCard";
import MobileListItem from "../components/MobileListItem";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

export default function MobileMail() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const canEdit = profile?.role === "admin" || profile?.role === "accountant";
  const [contacts, setContacts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState("compose");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get("/contacts").then((r) => setContacts(r.data.result || [])).catch(() => {});
    api.get("/mail/logs").then((r) => setLogs(r.data.result || [])).catch(() => {});
  }, []);

  async function handleSend() {
    if (!to.trim()) return addToast("Recipient required", "error");
    if (!subject.trim()) return addToast("Subject required", "error");
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("to", to);
      fd.append("subject", subject);
      fd.append("body", body);
      if (file) fd.append("file", file);
      await api.post("/mail/send", fd);
      addToast("Sent", "success");
      setTo(""); setSubject(""); setBody(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      const lg = await api.get("/mail/logs"); setLogs(lg.data.result || []);
      setTab("sent");
    } catch (err) { addToast(err.response?.data?.message || "Failed", "error"); }
    setSending(false);
  }

  return (
    <MobileShell title="Mail">
      <div className="px-4 pt-3 flex gap-2">
        <button onClick={() => setTab("compose")} className={`flex-1 m-tap text-sm font-semibold py-2 rounded-xl border-2 ${tab === "compose" ? "bg-saffron-500 text-white border-saffron-500" : "border-stone-200 text-stone-600"}`}>Compose</button>
        <button onClick={() => setTab("sent")} className={`flex-1 m-tap text-sm font-semibold py-2 rounded-xl border-2 ${tab === "sent" ? "bg-saffron-500 text-white border-saffron-500" : "border-stone-200 text-stone-600"}`}>Sent</button>
      </div>

      {tab === "compose" ? (
        canEdit ? (
          <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="p-4 space-y-3">
            <MobileCard>
              <div className="space-y-2">
                <input placeholder="To (email)" type="email" value={to} onChange={(e) => setTo(e.target.value)}
                  className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm" />
                <input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)}
                  className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm" />
                <textarea rows={6} placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)}
                  className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm resize-none" />
                <label className="flex items-center gap-2 text-sm text-stone-700 px-3 py-3 border-2 border-dashed border-stone-300 rounded-xl active:bg-stone-50">
                  <Paperclip size={14} /> <span className="truncate">{file ? file.name : "Attach a file"}</span>
                  <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </label>
                <button type="submit" disabled={sending} className="w-full flex items-center justify-center gap-2 bg-saffron-500 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50">
                  <Send size={16} /> {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </MobileCard>
            <MobileCard>
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">Quick contacts</div>
              <div className="flex flex-wrap gap-1.5">
                {contacts.filter((c) => c.email).slice(0, 20).map((c) => (
                  <button type="button" key={c.id} onClick={() => setTo(c.email)} className="text-[10px] font-semibold px-2 py-1 rounded-full bg-royal-50 text-royal-700 active:bg-royal-100">{c.name}</button>
                ))}
              </div>
            </MobileCard>
          </form>
        ) : (
          <EmptyState title="Read-only" message="You can view sent mail but not compose new." />
        )
      ) : (
        <div className="px-4 pt-3">
          {logs.length === 0 ? (
            <EmptyState title="No sent mail" />
          ) : (
            <div className="m-card !p-0 overflow-hidden">
              <ul className="m-list">
                {logs.slice(0, 30).map((l) => (
                  <MobileListItem key={l.id} title={l.subject || "(no subject)"} subtitle={`${l.to || ""} · ${l.sent_at || ""}`} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </MobileShell>
  );
}
