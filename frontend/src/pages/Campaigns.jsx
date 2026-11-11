import { useEffect, useState } from "react";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import useEscToClose from "../hooks/useEscToClose";
import { Plus, X, Trash2, Pencil } from "lucide-react";

const emptyForm = { name: "", description: "", goal_amount: "", start_date: "", end_date: "", status: "active" };

const STATUS_STYLES = {
  active: "bg-emerald-100 text-emerald-700",
  completed: "bg-blue-100 text-blue-700",
  archived: "bg-stone-200 text-stone-600",
};

export default function Campaigns() {
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

  function load() { api.get("/campaigns").then((r) => setList(r.data.result || [])).catch(() => setList([])); }
  useEffect(load, []);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm });
    setError("");
    setOpen(true);
  }

  function openEdit(campaign) {
    setEditing(campaign);
    setForm({
      name: campaign.name || "",
      description: campaign.description || "",
      goal_amount: campaign.goal_amount ?? "",
      start_date: campaign.start_date || "",
      end_date: campaign.end_date || "",
      status: campaign.status || "active",
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
      goal_amount: Number(form.goal_amount) || 0,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    };
    try {
      if (editing) await api.patch(`/campaigns/${editing.id}`, payload);
      else await api.post("/campaigns", payload);
      setOpen(false);
      setEditing(null);
      setForm({ ...emptyForm });
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save campaign");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm("Delete campaign?")) return;
    try {
      await api.delete("/campaigns/" + id);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete campaign");
    }
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Campaigns</h1>
        {canEdit && <button onClick={openAdd} className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg"><Plus size={16} /> New Campaign</button>}
      </div>

      {error && <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-4">
        {list.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-stone-800">{c.name}</h2>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[c.status] || STATUS_STYLES.archived}`}>{c.status}</span>
                </div>
                {c.description && <p className="text-sm text-stone-500 mt-1">{c.description}</p>}
                {(c.start_date || c.end_date) && (
                  <p className="text-xs text-stone-400 mt-1">{c.start_date || "—"} → {c.end_date || "—"}</p>
                )}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-stone-500 mb-1">
                    <span>Raised ₹{Number(c.raised).toLocaleString("en-IN")}</span>
                    <span>Goal ₹{Number(c.goal_amount).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-saffron-500 to-amber-500" style={{ width: `${c.progress}%` }} />
                  </div>
                  <div className="text-xs text-stone-400 mt-1">{Number(c.progress).toFixed(1)}%</div>
                </div>
              </div>
              <div className="flex gap-1">
                {canEdit && <button onClick={() => openEdit(c)} className="text-stone-500 p-1.5" title="Edit"><Pencil size={14} /></button>}
                {canDelete && <button onClick={() => remove(c.id)} className="text-rose-500 p-1.5" title="Delete"><Trash2 size={14} /></button>}
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="text-center text-stone-400 py-12">No campaigns yet</div>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4"><h2 className="font-semibold">{editing ? "Edit Campaign" : "New Campaign"}</h2><button onClick={() => setOpen(false)}><X size={16} /></button></div>
            <form onSubmit={submit} className="space-y-3">
              <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="number" placeholder="Goal amount" value={form.goal_amount} onChange={(e) => setForm({ ...form, goal_amount: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <label className="block text-xs text-stone-500">
                Start date
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="mt-1 w-full border rounded-xl px-3 py-2 text-sm" />
              </label>
              <label className="block text-xs text-stone-500">
                End date
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="mt-1 w-full border rounded-xl px-3 py-2 text-sm" />
              </label>
              <label className="block text-xs text-stone-500">
                Status
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1 w-full border rounded-xl px-3 py-2 text-sm">
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              {error && <div className="text-sm text-rose-600">{error}</div>}
              <button disabled={saving} className="w-full bg-saffron-500 text-white rounded-xl py-2 text-sm font-semibold disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
