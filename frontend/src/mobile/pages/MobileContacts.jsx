import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, X, Trash2 } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileListItem from "../components/MobileListItem";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

const emptyForm = { name: "", email: "", telegram_chat_id: "", phone: "", subscribe_monthly_report: false };

export default function MobileContacts() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const role = profile?.role || "viewer";
  const canAdd = role === "admin" || role === "accountant";
  const canDelete = role === "admin";

  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (params.get("new") === "1" && canAdd) {
      setEditing(null);
      setForm({ ...emptyForm });
      setOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, canAdd]);

  function load() {
    api.get("/contacts").then((r) => setContacts(r.data.result || [])).catch(() => addToast("Failed to load", "error"));
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => (c.name || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q) || (c.phone || "").includes(q));
  }, [contacts, search]);

  function openAdd() { setEditing(null); setForm({ ...emptyForm }); setOpen(true); }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) await api.patch(`/contacts/${editing.id}`, form);
      else await api.post("/contacts", form);
      addToast(editing ? "Contact updated" : "Contact created", "success");
      setOpen(false);
      load();
    } catch (err) { addToast(err.response?.data?.message || "Failed to save", "error"); }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this contact?")) return;
    try { await api.delete(`/contacts/${id}`); addToast("Deleted", "success"); load(); }
    catch { addToast("Failed to delete", "error"); }
  }

  return (
    <MobileShell
      title="Contacts"
      subtitle={`${filtered.length} of ${contacts.length}`}
      rightAction={canAdd ? (
        <button onClick={openAdd} aria-label="Add" className="m-tap w-10 h-10 rounded-xl bg-gradient-to-br from-saffron-500 to-saffron-600 text-white flex items-center justify-center shadow-md active:scale-95">
          <Plus size={20} />
        </button>
      ) : null}
    >
      <div className="px-4 pt-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input placeholder="Search contacts" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm border-2 border-stone-200 rounded-xl focus:border-saffron-400" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={contacts.length === 0 ? "No contacts yet" : "No matches"}
          message={contacts.length === 0 ? "Add your first contact" : "Try a different search term"}
          action={canAdd && contacts.length === 0 ? (
            <button onClick={openAdd} className="mt-2 text-xs font-semibold px-4 py-2 rounded-xl bg-saffron-500 text-white">Add contact</button>
          ) : null}
        />
      ) : (
        <div className="m-card !p-0 mx-4 mt-3 overflow-hidden">
          <ul className="m-list">
            {filtered.map((c) => (
              <MobileListItem
                key={c.id}
                onClick={() => navigate(`/m/contacts/${c.id}`)}
                leading={
                  <div className="w-10 h-10 rounded-xl bg-royal-50 text-royal-600 flex items-center justify-center text-sm font-bold">
                    {(c.name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                }
                title={c.name || "Unnamed"}
                subtitle={[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                trailing={canDelete ? (
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} className="m-tap w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                    <Trash2 size={14} />
                  </button>
                ) : null}
              />
            ))}
          </ul>
        </div>
      )}

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} className="fixed inset-0 bg-black/50 z-40" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 280 }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <h2 className="text-base font-bold">{editing ? "Edit Contact" : "Add Contact"}</h2>
                <button onClick={() => setOpen(false)} aria-label="Close" className="m-tap w-10 h-10 rounded-xl flex items-center justify-center active:bg-stone-100">
                  <X size={20} />
                </button>
              </div>
              <div className="w-12 h-1.5 rounded-full bg-stone-200 mx-auto mb-2" />
              <form onSubmit={handleSubmit} className="space-y-3 px-4 pb-6">
                <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm" />
                <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm" />
                <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm" />
                <input placeholder="Telegram chat ID" value={form.telegram_chat_id} onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.subscribe_monthly_report} onChange={(e) => setForm({ ...form, subscribe_monthly_report: e.target.checked })} className="rounded text-saffron-500" />
                  Subscribe to monthly report
                </label>
                <button type="submit" disabled={saving} className="w-full bg-saffron-500 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
                  {saving ? "Saving…" : editing ? "Update" : "Save"}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </MobileShell>
  );
}
