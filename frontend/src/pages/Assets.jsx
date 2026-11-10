import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import { Plus, X, Trash2 } from "lucide-react";

export default function Assets() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "accountant";
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", value: "", location: "", purchase_date: "", status: "active", notes: "" });
  const [saving, setSaving] = useState(false);

  function load() { api.get("/assets").then((r) => setList(r.data.result || [])).catch(() => setList([])); }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/assets", { ...form, value: Number(form.value) || 0 });
      setOpen(false);
      setForm({ name: "", category: "", value: "", location: "", purchase_date: "", status: "active", notes: "" });
      load();
    } finally { setSaving(false); }
  }

  async function remove(id) {
    if (!confirm("Delete asset?")) return;
    await api.delete("/assets/" + id);
    load();
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Assets</h1>
        {canEdit && <button onClick={() => setOpen(true)} className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg"><Plus size={16} /> Add Asset</button>}
      </div>
      <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
            <tr><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-left">Category</th><th className="px-4 py-2 text-left">Location</th><th className="px-4 py-2 text-right">Value</th><th className="px-4 py-2 text-left">Status</th><th className="px-4 py-2" /></tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-t border-stone-100">
                <td className="px-4 py-2 font-semibold">{a.name}</td>
                <td className="px-4 py-2 text-stone-500">{a.category || "-"}</td>
                <td className="px-4 py-2 text-stone-500">{a.location || "-"}</td>
                <td className="px-4 py-2 text-right">₹{Number(a.value).toLocaleString("en-IN")}</td>
                <td className="px-4 py-2">{a.status}</td>
                <td className="px-4 py-2 text-right">{canEdit && <button onClick={() => remove(a.id)} className="text-rose-500"><Trash2 size={14} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="text-center text-stone-400 py-8">No assets yet</div>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4"><h2 className="font-semibold">New Asset</h2><button onClick={() => setOpen(false)}><X size={16} /></button></div>
            <form onSubmit={submit} className="space-y-3">
              <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="number" placeholder="Value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm">
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="disposed">Disposed</option>
              </select>
              <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <button disabled={saving} className="w-full bg-saffron-500 text-white rounded-xl py-2 text-sm font-semibold">{saving ? "Saving..." : "Save"}</button>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
