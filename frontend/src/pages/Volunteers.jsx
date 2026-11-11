import { useEffect, useState } from "react";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import useEscToClose from "../hooks/useEscToClose";
import { Plus, X, Trash2, Pencil } from "lucide-react";

const emptyForm = { name: "", skills: "", availability: "", status: "active", notes: "" };

export default function Volunteers() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "accountant";
  const canDelete = profile?.role === "admin";
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEscToClose(() => setOpen(false), open);

  function load() { api.get("/volunteers").then((r) => setList(r.data.result || [])).catch(() => setList([])); }
  useEffect(load, []);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm });
    setError("");
    setOpen(true);
  }

  function openEdit(volunteer) {
    setEditing(volunteer);
    setForm({
      name: volunteer.name || "",
      skills: volunteer.skills || "",
      availability: volunteer.availability || "",
      status: volunteer.status || "active",
      notes: volunteer.notes || "",
    });
    setError("");
    setOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing) await api.patch(`/volunteers/${editing.id}`, form);
      else await api.post("/volunteers", form);
      setOpen(false);
      setEditing(null);
      setForm({ ...emptyForm });
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save volunteer");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm("Delete volunteer?")) return;
    try {
      await api.delete("/volunteers/" + id);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete volunteer");
    }
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Volunteers</h1>
        {canEdit && <button onClick={openAdd} className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg"><Plus size={16} /> Add Volunteer</button>}
      </div>

      {error && <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700">{error}</div>}

      <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
            <tr><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-left">Skills</th><th className="px-4 py-2 text-left">Availability</th><th className="px-4 py-2 text-left">Status</th><th className="px-4 py-2" /></tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id} className="border-t border-stone-100">
                <td className="px-4 py-2 font-semibold">{v.name}</td>
                <td className="px-4 py-2 text-stone-500">{v.skills || "-"}</td>
                <td className="px-4 py-2 text-stone-500">{v.availability || "-"}</td>
                <td className="px-4 py-2 capitalize">{v.status}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {canEdit && <button onClick={() => openEdit(v)} className="text-stone-500" title="Edit"><Pencil size={14} /></button>}
                    {canDelete && <button onClick={() => remove(v.id)} className="text-rose-500" title="Delete"><Trash2 size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="text-center text-stone-400 py-8">No volunteers yet</div>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4"><h2 className="font-semibold">{editing ? "Edit Volunteer" : "New Volunteer"}</h2><button onClick={() => setOpen(false)}><X size={16} /></button></div>
            <form onSubmit={submit} className="space-y-3">
              <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input placeholder="Skills" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input placeholder="Availability" value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              {error && <div className="text-sm text-rose-600">{error}</div>}
              <button disabled={saving} className="w-full bg-saffron-500 text-white rounded-xl py-2 text-sm font-semibold disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
