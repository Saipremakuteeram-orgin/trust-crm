import { useEffect, useState } from "react";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Trash2 } from "lucide-react";
import { useAuth } from "../lib/AuthContext";

export default function Contacts() {
  const { profile } = useAuth();
  const role = profile?.role || "viewer";
  const canAdd = role === "admin" || role === "accountant";
  const canDelete = role === "admin";

  const [contacts, setContacts] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", telegram_chat_id: "", phone: "", subscribe_monthly_report: false });

  function load() {
    api.get("/contacts").then((res) => setContacts(res.data.result));
  }
  useEffect(load, []);

  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true);
    await api.post("/contacts", form);
    setSaving(false);
    setOpen(false);
    setForm({ name: "", email: "", telegram_chat_id: "", phone: "", subscribe_monthly_report: false });
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm("Are you sure you want to delete this contact?")) return;
    await api.delete("/contacts/" + id);
    load();
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-stone-900">Contacts</h1>
        {canAdd && (
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm px-4 py-2 rounded-lg transition">
            <Plus size={16} /> Add Contact
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Telegram Chat ID</th>
              <th className="px-4 py-3 font-medium">Monthly Report</th>
              {canDelete && <th className="px-4 py-3 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-t border-stone-100">
                <td className="px-4 py-3 font-medium text-stone-800">{c.name}</td>
                <td className="px-4 py-3 text-stone-600">{c.email || "-"}</td>
                <td className="px-4 py-3 text-stone-600">{c.telegram_chat_id || "-"}</td>
                <td className="px-4 py-3">
                  {c.subscribe_monthly_report
                    ? <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">Yes</span>
                    : <span className="text-xs px-2 py-1 rounded-full bg-stone-100 text-stone-500">No</span>}
                </td>
                {canDelete && (
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(c.id)} className="text-stone-400 hover:text-red-600 transition" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr><td colSpan={canDelete ? 5 : 4} className="px-4 py-8 text-center text-stone-400">No contacts yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-stone-900">Add Contact</h2>
              <button onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
              <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
              <input placeholder="Telegram Chat ID" value={form.telegram_chat_id} onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })} className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
              <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" checked={form.subscribe_monthly_report} onChange={(e) => setForm({ ...form, subscribe_monthly_report: e.target.checked })} />
                Receive automatic monthly report
              </label>
              <button disabled={saving} className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-lg py-2 text-sm font-medium">
                {saving ? "Saving..." : "Save Contact"}
              </button>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
