import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Shield, Trash2, ChevronDown } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";

const roleColors = {
  admin: { bg: "bg-saffron-50", text: "text-saffron-700", ring: "ring-saffron-200" },
  accountant: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" },
  viewer: { bg: "bg-royal-50", text: "text-royal-700", ring: "ring-royal-200" },
};

export default function Users() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);

  function load() {
    api.get("/users").then((res) => setUsers(res.data.result)).catch(() => {});
  }
  useEffect(load, []);

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
          <p className="text-sm text-stone-500 mt-1">Manage user roles and access permissions</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <Shield size={16} />
          {users.length} user{users.length !== 1 ? "s" : ""}
        </div>
      </motion.div>

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
                      <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                        onClick={() => deleteUser(u.id)}
                        className="text-stone-300 hover:text-rose-600 transition-all p-1.5 rounded-lg hover:bg-rose-50" title="Delete user">
                        <Trash2 size={15} />
                      </motion.button>
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
    </AppLayout>
  );
}
