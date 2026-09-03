import { useEffect, useState } from "react";
import { Shield, UserPlus, RefreshCw, Trash2 } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileCard from "../components/MobileCard";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

const roleColors = {
  admin: "bg-saffron-50 text-saffron-700",
  accountant: "bg-emerald-50 text-emerald-700",
  viewer: "bg-royal-50 text-royal-700",
};

export default function MobileUsers() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", role: "accountant" });

  useEffect(() => {
    if (profile && profile.role !== "admin") return;
    api.get("/users").then((r) => { setUsers(r.data.result || []); setLoading(false); }).catch(() => setLoading(false));
  }, [profile]);

  if (profile && profile.role !== "admin") {
    return (
      <MobileShell title="Users">
        <EmptyState title="Access denied" message="Only admins can manage users." />
      </MobileShell>
    );
  }

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
    try { await api.patch(`/users/${id}/role`, { role }); addToast("Role updated", "success"); const r = await api.get("/users"); setUsers(r.data.result || []); }
    catch { addToast("Failed", "error"); }
  }

  async function remove(id) {
    if (!window.confirm("Remove this user?")) return;
    try { await api.delete(`/users/${id}`); addToast("Removed", "success"); const r = await api.get("/users"); setUsers(r.data.result || []); }
    catch { addToast("Failed", "error"); }
  }

  return (
    <MobileShell title="Users" subtitle={`${users.length} users`}
      rightAction={
        <button onClick={sync} aria-label="Sync" disabled={syncing} className="m-tap w-10 h-10 rounded-xl flex items-center justify-center active:bg-stone-100 text-stone-600">
          <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
        </button>
      }
    >
      <form onSubmit={addUser} className="p-4 space-y-2">
        <MobileCard>
          <div className="space-y-2">
            <input required placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm" />
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-sm">
              <option value="accountant">Accountant</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" disabled={adding} className="w-full flex items-center justify-center gap-2 bg-saffron-500 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50">
              <UserPlus size={14} />{adding ? "Inviting…" : "Invite user"}
            </button>
          </div>
        </MobileCard>
      </form>

      <div className="px-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-2">Team</div>
        {loading ? (
          <div className="text-center text-xs text-stone-400 py-4">Loading…</div>
        ) : users.length === 0 ? (
          <EmptyState title="No users" />
        ) : (
          <div className="m-card !p-0 overflow-hidden">
            <ul className="m-list">
              {users.map((u) => (
                <li key={u.id} className="px-4 py-3 border-b border-stone-100 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-royal-50 text-royal-600 flex items-center justify-center"><Shield size={16} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-stone-800 truncate">{u.full_name || u.email}</div>
                      <div className="text-[11px] text-stone-500 truncate">{u.email}</div>
                    </div>
                    <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-full ${roleColors[u.role] || roleColors.viewer}`}>
                      <option value="viewer">Viewer</option>
                      <option value="accountant">Accountant</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button onClick={() => remove(u.id)} className="m-tap w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"><Trash2 size={14} /></button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
