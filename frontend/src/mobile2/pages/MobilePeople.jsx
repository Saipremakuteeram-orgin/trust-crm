import { useState, useEffect, useMemo } from "react";
import { Search, Plus, X } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import ContactCard from "../components/ContactCard";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

export default function MobilePeople() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canAdd = profile?.role === "admin" || profile?.role === "accountant";

  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", telegram_chat_id: "", subscribe_monthly_report: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (params.get("new") === "1" && canAdd) {
      setEditing(null);
      setForm({ name: "", email: "", phone: "", telegram_chat_id: "", subscribe_monthly_report: false });
      setOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, canAdd]);

  function load() {
    api.get("/contacts").then((r) => setContacts(r.data.result || [])).catch(() => addToast("Failed", "error"));
  }

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const list = contacts.filter((c) => !q || (c.name || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q));
    return list.reduce((acc, c) => {
      const letter = (c.name || "#")[0].toUpperCase();
      (acc[letter] ||= []).push(c);
      return acc;
    }, {});
  }, [contacts, search]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) await api.patch(`/contacts/${editing.id}`, form);
      else await api.post("/contacts", form);
      addToast(editing ? "Updated" : "Created", "success");
      setOpen(false);
      load();
    } catch (err) { addToast(err.response?.data?.message || "Failed", "error"); }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this contact?")) return;
    try { await api.delete(`/contacts/${id}`); addToast("Deleted", "success"); load(); }
    catch { addToast("Failed", "error"); }
  }

  return (
    <MobileShell title="People" subtitle={`${contacts.length} contacts`} rightAction={canAdd ? (
      <button onClick={() => { setEditing(null); setForm({ name: "", email: "", phone: "", telegram_chat_id: "", subscribe_monthly_report: false }); setOpen(true); }} aria-label="Add" className="m-tap w-10 h-10 rounded-xl bg-saffron-500 text-white flex items-center justify-center shadow-md active:scale-95">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    ) : null}>
      <div className="px-4 pt-3 space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input placeholder="Search contacts…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2.5 text-sm border-2 border-stone-200 rounded-2xl focus:border-saffron-400" />
        </div>
      </div>

      <div className="px-4 pt-3 space-y-3">
        {Object.keys(grouped).length === 0 ? (
          <Card>
            <EmptyState title="No contacts" message="Add your first contact to get started." action={canAdd ? (
              <button onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold px-4 py-2 rounded-2xl bg-saffron-500 text-white">Add contact</button>
            ) : null} />
          </Card>
        ) : (
          Object.entries(grouped).map(([letter, list]) => (
            <div key={letter}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 px-1 mb-1">{letter}</div>
              <div className="space-y-2">
                {list.map((c) => (
                  <ContactCard
                    key={c.id}
                    contact={c}
                    onTap={() => navigate(`/mobile/people/${c.id}`)}
                    onLongPress={(contact) => { setEditing(contact); setForm({ name: contact.name || "", email: contact.email || "", phone: contact.phone || "", telegram_chat_id: contact.telegram_chat_id || "", subscribe_monthly_report: !!contact.subscribe_monthly_report }); }}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={() => setOpen(false)}>
          <Card padding={false} className="w-full rounded-t-3xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="text-base font-bold">{editing ? "Edit" : "Add"} contact</div>
              <button onClick={() => setOpen(false)} className="m-tap w-10 h-10 rounded-xl flex items-center justify-center active:bg-stone-100"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-4 pb-6 space-y-3">
              <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border-2 border-stone-200 rounded-2xl px-4 py-3 text-sm" />
              <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full border-2 border-stone-200 rounded-2xl px-4 py-3 text-sm" />
              <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border-2 border-stone-200 rounded-2xl px-4 py-3 text-sm" />
              <input placeholder="Telegram chat ID" value={form.telegram_chat_id} onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })} className="w-full border-2 border-stone-200 rounded-2xl px-4 py-3 text-sm" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.subscribe_monthly_report} onChange={(e) => setForm({ ...form, subscribe_monthly_report: e.target.checked })} className="rounded" /> Subscribe to monthly report</label>
              <button type="submit" disabled={saving} className="w-full bg-saffron-500 text-white rounded-2xl py-3 text-sm font-bold disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
            </form>
          </Card>
        </div>
      )}
    </MobileShell>
  );
}
