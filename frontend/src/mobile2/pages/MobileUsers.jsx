import { useEffect, useState } from "react";
import { UserPlus, RefreshCw, Trash2 } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

export default function MobileUsers() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", role: "accountant" });

  useEffect(() => {
    if (profile?.role !== "admin") return;
    api.get("/users").then((r) => { setUsers(r.data.result || []); setLoading(false); }).catch(() => setLoading(false));
  }, [profile]);

  async function addUser(e) {
    e.preventDefault();
    setAdding(true);
    try {
      await api.post("/users/invite", form);
      addToast("Invite sent", "success");
      setForm({ email: "", full_name: "", role: "accountant" });
      const r = await api.get("/users"); setUsers(r.data.result || []);
    } catch (err) { addToast(err.response?.data?.message || "Failed", "error"); }
    setAdding(false);
  }

  async function sync() {
    setSyncing(true);
    try {
      const r = await api.post("/users/sync");
      addToast(`Synced ${r.data.result?.synced || 0}`, "success");
      const u = await api.get("/users"); setUsers(u.data.result || []);
    } catch { addToast("Sync failed", "error"); }
    setSyncing(false);
  }

  async function changeRole(id, role) {
    try { await api.patch(`/users/${id}/role`, { role }); addToast("Updated", "success"); const r = await api.get("/users"); setUsers(r.data.result || []); }
    catch { addToast("Failed", "error"); }
  }

  async function remove(id) {
    if (!window.confirm("Remove user?")) return;
    try { await api.delete(`/users/${id}`); addToast("Removed", "success"); const r = await api.get("/users"); setUsers(r.data.result || []); }
    catch { addToast("Failed", "error"); }
  }

  if (profile?.role !== "admin") {
    return (
      <MobileShell title="Users">
        <Card><EmptyState title="Access denied" message="Only admins can manage users." /></Card>
      </MobileShell>
    );
  }

  return (
    <MobileShell title="Users" subtitle={`${users.length} users`} rightAction={
      <button onClick={sync} disabled={syncing} className="m-tap w-10 h-10 rounded-xl flex items-center justify-center active:bg-stone-100 text-stone-600">
        <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
      </button>
    }>
      <form onSubmit={addUser} className="p-4 space-y-2">
        <Card>
          <div className="space-y-2">
            <input required placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full border-2 border-stone-200 rounded-2xl px-3 py-2 text-sm" />
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border-2 border-stone-200 rounded-2xl px-3 py-2 text-sm" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full border-2 border-stone-200 rounded-2xl px-3 py-2 text-sm">
              <option value="accountant">Accountant</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" disabled={adding} className="w-full bg-saffron-500 text-white text-sm font-bold py-2.5 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2">
              <UserPlus size={14} /> {adding ? "Inviting…" : "Invite"}
            </button>
          </div>
        </Card>
      </form>

      <div className="px-4 pb-4 space-y-2">
        {loading ? (
          <div className="text-center text-xs text-stone-400 py-4">Loading…</div>
        ) : users.length === 0 ? (
          <Card><EmptyState title="No users" /></Card>
        ) : (
          users.map((u) => (
            <Card key={u.id} padding={false}>
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-stone-800 truncate">{u.full_name || u.email}</div>
                  <div className="text-[11px] text-stone-500 truncate">{u.email}</div>
                </div>
                <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} className="text-[10px] font-bold px-2 py-1 rounded-full bg-stone-100 text-stone-700">
                  <option value="viewer">Viewer</option>
                  <option value="accountant">Accountant</option>
                  <option value="admin">Admin</option>
                </select>
                <button onClick={() => remove(u.id)} className="m-tap w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><Trash2 size={14} /></button>
              </div>
            </Card>
          ))
        )}
      </div>
    </MobileShell>
  );
}
