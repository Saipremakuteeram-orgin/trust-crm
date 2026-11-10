import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import { Plus, Target, X, Trash2 } from "lucide-react";

export default function Campaigns() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "accountant";
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", goal_amount: "", start_date: "", end_date: "" });
  const [saving, setSaving] = useState(false);

  function load() { api.get("/campaigns").then((r) => setList(r.data.result || [])).catch(() => setList([])); }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/campaigns", { ...form, goal_amount: Number(form.goal_amount) || 0 });
      setOpen(false);
      setForm({ name: "", description: "", goal_amount: "", start_date: "", end_date: "" });
      load();
    } finally { setSaving(false); }
  }

  async function remove(id) {
    if (!confirm("Delete campaign?")) return;
    await api.delete("/campaigns/" + id);
    load();
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Campaigns</h1>
        {canEdit && <button onClick={() => setOpen(true)} className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg"><Plus size={16} /> New Campaign</button>}
      </div>
      <div className="grid gap-4">
        {list.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-stone-800">{c.name}</h2>
                {c.description && <p className="text-sm text-stone-500 mt-1">{c.description}</p>}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-stone-500 mb-1">
                    <span>Raised ₹{Number(c.raised).toLocaleString("en-IN")}</span>
                    <span>Goal ₹{Number(c.goal_amount).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-saffron-500 to-amber-500" style={{ width: `${c.progress}%` }} />
                  </div>
                  <div className="text-xs text-stone-400 mt-1">{c.progress.toFixed(1)}%</div>
                </div>
              </div>
              {canEdit && <button onClick={() => remove(c.id)} className="text-rose-500 p-1.5"><Trash2 size={14} /></button>}
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="text-center text-stone-400 py-12">No campaigns yet</div>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4"><h2 className="font-semibold">New Campaign</h2><button onClick={() => setOpen(false)}><X size={16} /></button></div>
            <form onSubmit={submit} className="space-y-3">
              <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="number" placeholder="Goal amount" value={form.goal_amount} onChange={(e) => setForm({ ...form, goal_amount: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <button disabled={saving} className="w-full bg-saffron-500 text-white rounded-xl py-2 text-sm font-semibold">{saving ? "Saving..." : "Save"}</button>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
