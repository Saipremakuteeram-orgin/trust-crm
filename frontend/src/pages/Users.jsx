import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Shield, Trash2, ChevronDown, UserPlus, RefreshCw, X, KeyRound, Mail } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import { ShieldAlert } from "lucide-react";

const roleColors = {
  admin: { bg: "bg-saffron-50", text: "text-saffron-700", ring: "ring-saffron-200" },
  accountant: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" },
  viewer: { bg: "bg-royal-50", text: "text-royal-700", ring: "ring-royal-50" },
};

export default function Users() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState("create");
  const [addForm, setAddForm] = useState({ email: "", password: "", full_name: "", role: "accountant" });
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [resetModal, setResetModal] = useState(null);
  const [resetPw, setResetPw] = useState("");
  const [resetting, setResetting] = useState(false);

  if (profile && profile.role !== "admin") {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center">
          <ShieldAlert size={48} className="text-rose-400 mb-4" />
          <h2 className="text-xl font-bold text-stone-800">Access Denied</h2>
          <p className="text-sm text-stone-500 mt-2">You need admin privileges to view this page.</p>
        </div>
      </AppLayout>
    );
  }

  function load() {
    api.get("/users").then((res) => setUsers(res.data.result)).catch(() => {});
  }
  useEffect(load, []);

  async function syncUsers() {
    setSyncing(true);
    try {
      const res = await api.post("/users/sync");
      const count = res.data.result?.synced || 0;
      addToast(count > 0 ? `Synced ${count} missing user(s)` : "All users already in sync", count > 0 ? "success" : "info");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Sync failed", "error");
    } finally {
      setSyncing(false);
    }
  }

  async function addUser(e) {
    e.preventDefault();
    if (!addForm.email.trim()) {
      addToast("Email is required", "error");
      return;
    }
    if (addMode === "create" && (!addForm.password || addForm.password.length < 6)) {
      addToast("Password must be at least 6 characters", "error");
      return;
    }
    setSubmitting(true);
    try {
      if (addMode === "create") {
        await api.post("/users", addForm);
        addToast("User created successfully", "success");
      } else {
        await api.post("/users/invite", { email: addForm.email, full_name: addForm.full_name, role: addForm.role });
        addToast("Invitation sent to " + addForm.email, "success");
      }
      setShowAdd(false);
      setAddForm({ email: "", password: "", full_name: "", role: "accountant" });
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword(e) {
    e.preventDefault();
    if (!resetPw || resetPw.length < 6) {
      addToast("Password must be at least 6 characters", "error");
      return;
    }
    setResetting(true);
    try {
      await api.post(`/users/${resetModal.id}/reset-password`, { password: resetPw });
      addToast("Password updated for " + resetModal.email, "success");
      setResetModal(null);
      setResetPw("");
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to reset password", "error");
    } finally {
      setResetting(false);
    }
  }

  async function changeRole(userId, newRole) {
    try {
      await api.patch(`/users/${userId}/role`, { role: newRole });
      addToast("Role updated successfully", "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to change role", "error");
    }
  }

  async function deleteUser(userId) {
    if (!window.confirm("Are you sure? This will permanently delete this user.")) return;
    try {
      await api.delete(`/users/${userId}`);
      addToast("User deleted", "success");
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to delete user", "error");
    }
  }

  const initials = (name) => name ? name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "?";

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">User Management</h1>
          <p className="text-sm text-stone-500 mt-1">Create, manage roles, and reset passwords</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <Shield size={16} />
          {users.length} user{users.length !== 1 ? "s" : ""}
        </div>
      </motion.div>

      <div className="flex items-center gap-3 mb-6">
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          onClick={syncUsers} disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50">
          <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing..." : "Sync Users"}
        </motion.button>
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          onClick={() => { setAddMode("create"); setAddForm({ email: "", password: "", full_name: "", role: "accountant" }); setShowAdd(true); }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 text-white shadow-md shadow-saffron-500/25 hover:shadow-lg transition-all">
          <UserPlus size={15} />
          Add User
        </motion.button>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-stone-50 to-stone-100/80 text-stone-500 text-left">
            <tr>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">User</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Email</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Role</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">Joined</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const isSelf = u.id === profile?.id;
              const rc = roleColors[u.role] || roleColors.viewer;
              return (
                <motion.tr key={u.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }} className="border-t border-stone-100 table-row-animate">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-saffron-400 to-saffron-600 flex items-center justify-center text-white text-xs font-bold">
                        {initials(u.full_name)}
                      </div>
                      <div>
                        <div className="font-medium text-stone-800">{u.full_name}</div>
                        {isSelf && <span className="text-[10px] text-stone-400">You</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-stone-600">{u.email}</td>
                  <td className="px-5 py-3.5">
                    {isSelf ? (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${rc.bg} ${rc.text} ring-1 ${rc.ring}`}>
                        {u.role?.charAt(0).toUpperCase() + u.role?.slice(1)}
                      </span>
                    ) : (
                      <div className="relative">
                        <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}
                          className={`appearance-none text-xs font-semibold px-2.5 py-1.5 pr-7 rounded-full ${rc.bg} ${rc.text} ring-1 ${rc.ring} cursor-pointer focus:outline-none focus:ring-2 focus:ring-saffron-400 transition-all`}>
                          <option value="admin">Admin</option>
                          <option value="accountant">Accountant</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400" />
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-stone-500 text-xs">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("en-IN") : "-"}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {!isSelf && (
                      <div className="flex items-center justify-end gap-1">
                        <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                          onClick={() => { setResetModal(u); setResetPw(""); }}
                          className="text-stone-300 hover:text-royal-600 transition-all p-1.5 rounded-lg hover:bg-royal-50"
                          title="Reset password">
                          <KeyRound size={15} />
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                          onClick={() => deleteUser(u.id)}
                          className="text-stone-300 hover:text-rose-600 transition-all p-1.5 rounded-lg hover:bg-rose-50"
                          title="Delete user">
                          <Trash2 size={15} />
                        </motion.button>
                      </div>
                    )}
                  </td>
                </motion.tr>
              );
            })}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-stone-400">No users found</td></tr>
            )}
          </tbody>
        </table>
      </motion.div>

      {/* Add User Modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowAdd(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-stone-100">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-stone-900">Add New User</h3>
                <button onClick={() => setShowAdd(false)} className="p-1 rounded-lg text-stone-400 hover:bg-stone-100 transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="flex gap-2 mb-5 p-1 bg-stone-100 rounded-xl">
                <button onClick={() => setAddMode("create")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${addMode === "create" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
                  <KeyRound size={14} /> Create with Password
                </button>
                <button onClick={() => setAddMode("invite")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${addMode === "invite" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
                  <Mail size={14} /> Send Invite Link
                </button>
              </div>

              <form onSubmit={addUser} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-stone-700 mb-1 block">Email *</label>
                  <input type="email" required value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-saffron-400"
                    placeholder="user@example.com" />
                </div>
                <div>
                  <label className="text-sm font-medium text-stone-700 mb-1 block">Full Name</label>
                  <input type="text" value={addForm.full_name}
                    onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-saffron-400"
                    placeholder="John Doe" />
                </div>
                {addMode === "create" && (
                  <div>
                    <label className="text-sm font-medium text-stone-700 mb-1 block">Password *</label>
                    <input type="password" required minLength={6} value={addForm.password}
                      onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-saffron-400"
                      placeholder="Minimum 6 characters" />
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-stone-700 mb-1 block">Role</label>
                  <select value={addForm.role}
                    onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-saffron-400">
                    <option value="accountant">Accountant</option>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowAdd(false)}
                    className="px-4 py-2 text-sm font-medium text-stone-600 rounded-xl hover:bg-stone-100 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting}
                    className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-saffron-500 to-saffron-600 rounded-xl shadow-md shadow-saffron-500/25 hover:shadow-lg transition-all disabled:opacity-50">
                    {submitting ? "Creating..." : addMode === "create" ? "Create User" : "Send Invite"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset Password Modal */}
      <AnimatePresence>
        {resetModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setResetModal(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-stone-100">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-lg font-bold text-stone-900">Reset Password</h3>
                  <p className="text-xs text-stone-500 mt-0.5">{resetModal.email}</p>
                </div>
                <button onClick={() => setResetModal(null)} className="p-1 rounded-lg text-stone-400 hover:bg-stone-100 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={resetPassword} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-stone-700 mb-1 block">New Password</label>
                  <input type="password" required minLength={6} autoFocus value={resetPw}
                    onChange={(e) => setResetPw(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-saffron-400"
                    placeholder="Minimum 6 characters" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setResetModal(null)}
                    className="px-4 py-2 text-sm font-medium text-stone-600 rounded-xl hover:bg-stone-100 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={resetting}
                    className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-royal-500 to-royal-600 rounded-xl shadow-md shadow-royal-500/25 hover:shadow-lg transition-all disabled:opacity-50">
                    {resetting ? "Updating..." : "Update Password"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
