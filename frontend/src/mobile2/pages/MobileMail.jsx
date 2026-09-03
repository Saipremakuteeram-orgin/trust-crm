import { useEffect, useState, useRef } from "react";
import { Send, Paperclip } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import Card from "../components/Card";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

export default function MobileMail() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const canSend = profile?.role === "admin" || profile?.role === "accountant";
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get("/contacts").then((r) => setContacts(r.data.result || [])).catch(() => {});
  }, []);

  async function send(e) {
    e.preventDefault();
    if (!to.trim() || !subject.trim()) return addToast("To and subject required", "error");
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
    } catch (err) { addToast(err.response?.data?.message || "Failed", "error"); }
    setSending(false);
  }

  return (
    <MobileShell title="Mail">
      {canSend ? (
        <form onSubmit={send} className="p-4 space-y-3">
          <Card>
            <div className="space-y-2">
              <input placeholder="To (email)" type="email" value={to} onChange={(e) => setTo(e.target.value)} className="w-full border-2 border-stone-200 rounded-2xl px-3 py-2 text-sm" />
              <input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full border-2 border-stone-200 rounded-2xl px-3 py-2 text-sm" />
              <textarea rows={6} placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} className="w-full border-2 border-stone-200 rounded-2xl px-3 py-2 text-sm resize-none" />
              <label className="flex items-center gap-2 text-sm text-stone-700 px-3 py-3 rounded-2xl border-2 border-dashed border-stone-300 cursor-pointer active:bg-stone-50">
                <Paperclip size={14} /> <span className="truncate">{file ? file.name : "Attach a file"}</span>
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              <button type="submit" disabled={sending} className="w-full bg-saffron-500 text-white text-sm font-bold py-2.5 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2">
                <Send size={16} /> {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </Card>
        </form>
      ) : (
        <Card><div className="text-center text-xs text-stone-500 py-6">You can view sent mail but not compose.</div></Card>
      )}
    </MobileShell>
  );
}
