import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import { Plus, Calendar, MapPin, Users, Trash2, X } from "lucide-react";

export default function Events() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "accountant";
  const [events, setEvents] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", start_at: "", end_at: "", location: "", capacity: "" });
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [regs, setRegs] = useState([]);

  function load() { api.get("/events").then((r) => setEvents(r.data.result || [])).catch(() => setEvents([])); }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/events", { ...form, capacity: form.capacity ? Number(form.capacity) : null });
      setOpen(false);
      setForm({ title: "", description: "", start_at: "", end_at: "", location: "", capacity: "" });
      load();
    } finally { setSaving(false); }
  }

  async function remove(id) {
    if (!confirm("Delete event?")) return;
    await api.delete("/events/" + id);
    load();
  }

  async function viewRegs(ev) {
    setSelected(ev);
    const r = await api.get("/events/" + ev.id + "/registrations");
    setRegs(r.data.result || []);
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Events</h1>
        {canEdit && (
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg">
            <Plus size={16} /> Add Event
          </button>
        )}
      </div>

      <div className="grid gap-4">
        {events.map((ev) => (
          <div key={ev.id} className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-stone-800">{ev.title}</h2>
                {ev.description && <p className="text-sm text-stone-500 mt-1">{ev.description}</p>}
                <div className="flex items-center gap-4 mt-2 text-xs text-stone-500">
                  <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(ev.start_at).toLocaleString()}</span>
                  {ev.location && <span className="flex items-center gap-1"><MapPin size={12} /> {ev.location}</span>}
                  {ev.capacity && <span className="flex items-center gap-1"><Users size={12} /> cap {ev.capacity}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => viewRegs(ev)} className="text-xs px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200">Registrations</button>
                {canEdit && <button onClick={() => remove(ev.id)} className="text-rose-500 p-1.5"><Trash2 size={14} /></button>}
              </div>
            </div>
          </div>
        ))}
        {events.length === 0 && <div className="text-center text-stone-400 py-12">No events yet</div>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4"><h2 className="font-semibold">New Event</h2><button onClick={() => setOpen(false)}><X size={16} /></button></div>
            <form onSubmit={submit} className="space-y-3">
              <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input required type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="number" placeholder="Capacity" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <button disabled={saving} className="w-full bg-saffron-500 text-white rounded-xl py-2 text-sm font-semibold">{saving ? "Saving..." : "Save"}</button>
            </form>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4"><h2 className="font-semibold">Registrations — {selected.title}</h2><button onClick={() => setSelected(null)}><X size={16} /></button></div>
            {regs.length === 0 && <div className="text-stone-400 text-sm">No registrations</div>}
            <ul className="space-y-2">
              {regs.map((r) => (
                <li key={r.id} className="flex items-center justify-between border rounded-xl px-3 py-2 text-sm">
                  <span>{r.contacts?.name}</span>
                  <span className="text-xs text-stone-500">{r.status}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
