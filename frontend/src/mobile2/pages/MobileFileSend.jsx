import { useEffect, useState, useRef } from "react";
import { Upload, Send } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

export default function MobileFileSend() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const canSend = profile?.role === "admin" || profile?.role === "accountant";
  const [contacts, setContacts] = useState([]);
  const [file, setFile] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get("/contacts").then((r) => setContacts(r.data.result || [])).catch(() => {});
  }, []);

  const withEmail = contacts.filter((c) => c.email);

  function toggle(email) {
    setRecipients((p) => p.includes(email) ? p.filter((e) => e !== email) : [...p, email]);
  }

  async function send() {
    if (!file || !recipients.length) return addToast("File and at least one recipient required", "error");
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("recipients", JSON.stringify(recipients));
      await api.post("/file-send/send", fd);
      addToast("Sent", "success");
      setFile(null); setRecipients([]); if (fileRef.current) fileRef.current.value = "";
    } catch (err) { addToast(err.response?.data?.message || "Failed", "error"); }
    setSending(false);
  }

  return (
    <MobileShell title="Send File">
      {canSend ? (
        <div className="p-4 space-y-3">
          <Card>
            <label className="flex items-center gap-2 text-sm text-stone-700 px-3 py-3 rounded-2xl border-2 border-dashed border-stone-300 cursor-pointer active:bg-stone-50">
              <Upload size={16} /> <span className="truncate">{file ? file.name : "Choose a file"}</span>
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </Card>
          <Card padding={false}>
            <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500 bg-stone-50">Recipients ({recipients.length})</div>
            <div className="max-h-64 overflow-y-auto divide-y divide-stone-100">
              {withEmail.length === 0 ? (
                <div className="px-4 py-4 text-xs text-stone-400">No contacts with email</div>
              ) : withEmail.map((c) => (
                <label key={c.id} className="flex items-center gap-3 px-4 py-3 m-tap active:bg-stone-50">
                  <input type="checkbox" checked={recipients.includes(c.email)} onChange={() => toggle(c.email)} className="rounded" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-stone-800 truncate">{c.name}</div>
                    <div className="text-[11px] text-stone-500 truncate">{c.email}</div>
                  </div>
                </label>
              ))}
            </div>
          </Card>
          <button onClick={send} disabled={sending} className="w-full bg-saffron-500 text-white text-sm font-bold py-3 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2">
            <Send size={16} /> {sending ? "Sending…" : "Send"}
          </button>
        </div>
      ) : (
        <Card><EmptyState title="Read-only" message="You can view history but not send files." /></Card>
      )}
    </MobileShell>
  );
}
