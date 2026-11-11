import { useEffect, useState } from "react";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import useEscToClose from "../hooks/useEscToClose";
import { Plus, Calendar, MapPin, Users, Trash2, X, Pencil, UserPlus } from "lucide-react";

const emptyForm = { title: "", description: "", start_at: "", end_at: "", location: "", capacity: "" };

const toDatetimeLocal = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const STATUSES = [
  { value: "registered", label: "Registered" },
  { value: "attended", label: "Attended" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No show" },
];

export default function Events() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "accountant";
  const canDelete = profile?.role === "admin";
  const [events, setEvents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [regs, setRegs] = useState([]);
  const [regLoading, setRegLoading] = useState(false);
  const [regContactId, setRegContactId] = useState("");
  const [regError, setRegError] = useState("");
  useEscToClose(() => setOpen(false), open);
  useEscToClose(() => setSelected(null), !!selected);

  function load() {
    api.get("/events").then((r) => setEvents(r.data.result || [])).catch(() => setEvents([]));
    api.get("/contacts").then((r) => setContacts(r.data.result || [])).catch(() => setContacts([]));
  }
  useEffect(load, []);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm });
    setError("");
    setOpen(true);
  }

  function openEdit(ev) {
    setEditing(ev);
    setForm({
      title: ev.title || "",
      description: ev.description || "",
      start_at: toDatetimeLocal(ev.start_at),
      end_at: toDatetimeLocal(ev.end_at),
      location: ev.location || "",
      capacity: ev.capacity ?? "",
    });
    setError("");
    setOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      ...form,
      description: form.description || null,
      end_at: form.end_at || null,
      location: form.location || null,
      capacity: form.capacity ? Number(form.capacity) : null,
    };
    try {
      if (editing) await api.patch(`/events/${editing.id}`, payload);
      else await api.post("/events", payload);
      setOpen(false);
      setEditing(null);
      setForm({ ...emptyForm });
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save event");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm("Delete event? Registrations for it will be removed too.")) return;
    try {
      await api.delete("/events/" + id);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete event");
    }
  }

  async function loadRegs(eventId) {
    setRegLoading(true);
    try {
      const r = await api.get(`/events/${eventId}/registrations`);
      setRegs(r.data.result || []);
    } catch {
      setRegs([]);
    } finally {
      setRegLoading(false);
    }
  }

  async function viewRegs(ev) {
    setSelected(ev);
    setRegError("");
    setRegContactId("");
    await loadRegs(ev.id);
  }

  async function register(e) {
    e.preventDefault();
    if (!regContactId) return;
    setRegError("");
    try {
      await api.post(`/events/${selected.id}/register`, { contact_id: regContactId });
      setRegContactId("");
      await loadRegs(selected.id);
      load();
    } catch (err) {
      setRegError(err.response?.data?.message || "Failed to register contact");
    }
  }

  async function setRegStatus(registration, status) {
    setRegError("");
    try {
      await api.patch(`/events/registrations/${registration.id}`, { status });
      await loadRegs(selected.id);
      load();
    } catch (err) {
      setRegError(err.response?.data?.message || "Failed to update registration");
    }
  }

  async function removeReg(registration) {
    if (!confirm("Remove this registration?")) return;
    setRegError("");
    try {
      await api.delete(`/events/registrations/${registration.id}`);
      await loadRegs(selected.id);
      load();
    } catch (err) {
      setRegError(err.response?.data?.message || "Failed to remove registration");
    }
  }

  const availableContacts = contacts.filter(
    (c) => !regs.some((r) => r.contact_id === c.id)
  );

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Events</h1>
        {canEdit && (
          <button onClick={openAdd} className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg">
            <Plus size={16} /> Add Event
          </button>
        )}
      </div>

      {error && <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-4">
        {events.map((ev) => (
          <div key={ev.id} className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-stone-800">{ev.title}</h2>
                {ev.description && <p className="text-sm text-stone-500 mt-1">{ev.description}</p>}
                <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-stone-500">
                  <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(ev.start_at).toLocaleString()}</span>
                  {ev.location && <span className="flex items-center gap-1"><MapPin size={12} /> {ev.location}</span>}
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {ev.registered || 0} registered{ev.capacity ? ` / ${ev.capacity}` : ""}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => viewRegs(ev)} className="text-xs px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200">Registrations</button>
                {canEdit && <button onClick={() => openEdit(ev)} className="text-stone-500 p-1.5" title="Edit"><Pencil size={14} /></button>}
                {canDelete && <button onClick={() => remove(ev.id)} className="text-rose-500 p-1.5" title="Delete"><Trash2 size={14} /></button>}
              </div>
            </div>
          </div>
        ))}
        {events.length === 0 && <div className="text-center text-stone-400 py-12">No events yet</div>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4"><h2 className="font-semibold">{editing ? "Edit Event" : "New Event"}</h2><button onClick={() => setOpen(false)}><X size={16} /></button></div>
            <form onSubmit={submit} className="space-y-3">
              <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <label className="block text-xs text-stone-500">
                Starts
                <input required type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} className="mt-1 w-full border rounded-xl px-3 py-2 text-sm" />
              </label>
              <label className="block text-xs text-stone-500">
                Ends
                <input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} className="mt-1 w-full border rounded-xl px-3 py-2 text-sm" />
              </label>
              <input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="number" min="1" placeholder="Capacity (blank = unlimited)" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              {error && <div className="text-sm text-rose-600">{error}</div>}
              <button disabled={saving} className="w-full bg-saffron-500 text-white rounded-xl py-2 text-sm font-semibold disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
            </form>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4"><h2 className="font-semibold">Registrations — {selected.title}</h2><button onClick={() => setSelected(null)}><X size={16} /></button></div>

            {canEdit && (
              <form onSubmit={register} className="flex gap-2 mb-4">
                <select value={regContactId} onChange={(e) => setRegContactId(e.target.value)} className="flex-1 border rounded-xl px-3 py-2 text-sm">
                  <option value="">{availableContacts.length ? "Select contact to register" : "No contacts available"}</option>
                  {availableContacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>
                  ))}
                </select>
                <button disabled={!regContactId} className="flex items-center gap-1 bg-saffron-500 text-white rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50">
                  <UserPlus size={14} /> Register
                </button>
              </form>
            )}

            {regError && <div className="mb-3 text-sm text-rose-600">{regError}</div>}
            {regLoading && <div className="text-stone-400 text-sm">Loading...</div>}
            {!regLoading && regs.length === 0 && <div className="text-stone-400 text-sm">No registrations</div>}
            <ul className="space-y-2">
              {regs.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 border rounded-xl px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{r.contacts?.name || "Unknown contact"}</span>
                  {canEdit ? (
                    <select
                      value={r.status}
                      onChange={(e) => setRegStatus(r, e.target.value)}
                      className="border rounded-lg px-2 py-1 text-xs"
                    >
                      {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-stone-500">{r.status}</span>
                  )}
                  {canDelete && (
                    <button onClick={() => removeReg(r)} className="text-rose-500 p-1" title="Remove registration"><Trash2 size={14} /></button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
