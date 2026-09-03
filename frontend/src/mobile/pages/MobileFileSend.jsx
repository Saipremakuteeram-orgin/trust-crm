import { useEffect, useRef, useState } from "react";
import { Upload, Send, Search } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileCard from "../components/MobileCard";
import MobileListItem from "../components/MobileListItem";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

export default function MobileFileSend() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const canEdit = profile?.role === "admin" || profile?.role === "accountant";
  const [contacts, setContacts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [file, setFile] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get("/contacts").then((r) => setContacts(r.data.result || [])).catch(() => {});
    api.get("/file-send/logs").then((r) => setLogs(r.data.result || [])).catch(() => {});
  }, []);

  const withEmail = contacts.filter((c) => c.email);
  const filtered = withEmail.filter((c) => (c.name || c.email).toLowerCase().includes(search.toLowerCase()));

  function toggle(email) {
    setRecipients((p) => p.includes(email) ? p.filter((e) => e !== email) : [...p, email]);
  }

  async function handleSend() {
    if (!file) return addToast("Choose a file", "error");
    if (!recipients.length) return addToast("Pick at least one recipient", "error");
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("recipients", JSON.stringify(recipients));
      const res = await api.post("/file-send/send", fd);
      const r = res.data.result;
      addToast(`Sent (${r.status})`, "success");
      setFile(null); setRecipients([]); if (fileRef.current) fileRef.current.value = "";
      const lg = await api.get("/file-send/logs"); setLogs(lg.data.result || []);
    } catch (err) { addToast(err.response?.data?.message || "Failed", "error"); }
    setSending(false);
  }

  return (
    <MobileShell title="Send File">
      {canEdit && (
        <div className="p-4 space-y-3">
          <MobileCard>
            <label className="flex items-center gap-2 text-sm text-stone-700 px-3 py-3 border-2 border-dashed border-stone-300 rounded-xl active:bg-stone-50">
              <Upload size={16} />
              <span className="truncate">{file ? file.name : "Choose a file"}</span>
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </MobileCard>
          <MobileCard className="!p-0 overflow-hidden">
            <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500 bg-stone-50">Recipients ({recipients.length})</div>
            <div className="px-4 py-2 border-b border-stone-100">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts"
                  className="w-full pl-8 pr-3 py-2 text-xs border-2 border-stone-200 rounded-lg" />
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-stone-400">No contacts with email</div>
            ) : (
              <ul className="m-list max-h-64 overflow-y-auto">
                {filtered.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center gap-3 px-4 py-3 m-tap active:bg-stone-50">
                      <input type="checkbox" checked={recipients.includes(c.email)} onChange={() => toggle(c.email)} className="rounded text-saffron-500" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-stone-800 truncate">{c.name}</div>
                        <div className="text-[11px] text-stone-500 truncate">{c.email}</div>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </MobileCard>
          <button onClick={handleSend} disabled={sending} className="w-full flex items-center justify-center gap-2 m-tap bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold py-3 rounded-xl shadow-md disabled:opacity-50">
            <Send size={16} /> {sending ? "Sending…" : "Send file"}
          </button>
        </div>
      )}

      <div className="px-4 pt-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-2">Recent</div>
        {logs.length === 0 ? (
          <EmptyState title="No history yet" />
        ) : (
          <div className="m-card !p-0 overflow-hidden">
            <ul className="m-list">
              {logs.slice(0, 20).map((l) => (
                <MobileListItem
                  key={l.id}
                  title={l.file_name || l.docName || "File"}
                  subtitle={`${l.sent_at || ""} · ${l.status}`}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
