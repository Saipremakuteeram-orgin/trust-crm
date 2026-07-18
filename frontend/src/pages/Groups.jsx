import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Plus, X, Trash2, Pencil, Search, Users, UserPlus } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";

const emptyForm = { name: "", description: "", member_ids: [] };

export default function Groups() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canAdd = role === "admin" || role === "accountant";
  const canDelete = role === "admin";

  const [groups, setGroups] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [search, setSearch] = useState("");
  const [membersOpen, setMembersOpen] = useState(null);
  const [memberSearch, setMemberSearch] = useState("");

  function load() {
    api.get("/groups").then((res) => setGroups(res.data.result));
    api.get("/contacts").then((res) => setContacts(res.data.result));
  }
  useEffect(load, []);

  const filtered = useMemo(() => {
    return groups.filter((g) => {
      if (!search) return true;
      return (g.name || "").toLowerCase().includes(search.toLowerCase());
    });
  }, [groups, search]);

  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (!memberSearch) return true;
      return (c.name || "").toLowerCase().includes(memberSearch.toLowerCase()) ||
        (c.email || "").toLowerCase().includes(memberSearch.toLowerCase());
    });
  }, [contacts, memberSearch]);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }

  function openEdit(group) {
    setEditing(group);
    setForm({ name: group.name, description: group.description || "", member_ids: group.member_ids || [] });
    setOpen(true);
  }

  function toggleMember(id) {
    setForm((f) => ({
      ...f,
      member_ids: f.member_ids.includes(id)
        ? f.member_ids.filter((x) => x !== id)
        : [...f.member_ids, id],
    }));
  }

  function selectAllContacts() {
    setForm((f) => ({
      ...f,
      member_ids: filteredContacts.map((c) => c.id),
    }));
  }

  function deselectAllContacts() {
    setForm((f) => ({ ...f, member_ids: [] }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: form.name, description: form.description, member_ids: form.member_ids };
      if (editing) {
        await api.patch("/groups/" + editing.id, payload);
        addToast("Group updated successfully", "success");
      } else {
        await api.post("/groups", payload);
        addToast("Group created successfully", "success");
      }
      setOpen(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save group", "error");
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm("Are you sure you want to delete this group?")) return;
    try {
      await api.delete("/groups/" + id);
      addToast("Group deleted", "success");
      load();
    } catch (err) {
      addToast("Failed to delete group", "error");
    }
  }

  function getContactName(id) {
    return contacts.find((c) => c.id === id)?.name || "Unknown";
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Contact Groups</h1>
          <p className="text-sm text-stone-500 mt-1">Organize contacts into groups for bulk notifications</p>
        </div>
        {canAdd && (
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openAdd}
            className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-saffron-500/20 transition-all">
            <Plus size={16} /> Add Group
          </motion.button>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-5">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input placeholder="Search groups..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md pl-9 pr-4 py-2 text-sm border-2 border-stone-200 rounded-xl focus:border-saffron-400 transition-colors" />
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {filtered.map((g, i) => (
            <motion.div key={g.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-royal-500 to-royal-600 flex items-center justify-center text-white shadow-md shadow-royal-500/20">
                    <Users size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-stone-900">{g.name}</h3>
                    {g.description && <p className="text-xs text-stone-500 mt-0.5">{g.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {canAdd && (
                    <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                      onClick={() => openEdit(g)}
                      className="text-stone-300 hover:text-royal-600 transition-all p-1.5 rounded-lg hover:bg-royal-50" title="Edit">
                      <Pencil size={15} />
                    </motion.button>
                  )}
                  {canDelete && (
                    <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                      onClick={() => handleDelete(g.id)}
                      className="text-stone-300 hover:text-rose-600 transition-all p-1.5 rounded-lg hover:bg-rose-50" title="Delete">
                      <Trash2 size={15} />
                    </motion.button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-royal-50 text-royal-700 ring-1 ring-royal-200">
                  {g.member_count} {g.member_count === 1 ? "member" : "members"}
                </span>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => { setMembersOpen(g); setMemberSearch(""); }}
                  className="text-xs font-medium text-royal-600 hover:text-royal-700 transition-colors px-2 py-1 rounded-lg hover:bg-royal-50">
                  View Members
                </motion.button>
              </div>

              {g.member_ids && g.member_ids.length > 0 && (
                <div className="mt-3 pt-3 border-t border-stone-100">
                  <div className="flex flex-wrap gap-1">
                    {g.member_ids.slice(0, 3).map((cid) => (
                      <span key={cid} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">
                        {getContactName(cid)}
                      </span>
                    ))}
                    {g.member_ids.length > 3 && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">
                        +{g.member_ids.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="text-center py-16 text-stone-400">
          <Users size={48} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">{groups.length === 0 ? "No groups yet" : "No matches found"}</p>
          <p className="text-sm mt-1">{groups.length === 0 ? "Create your first group to organize contacts" : "Try a different search"}</p>
        </motion.div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold text-stone-900">{editing ? "Edit Group" : "Add Group"}</h2>
                <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                  onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input required placeholder="Group Name" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                <input placeholder="Description (optional)" value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-stone-700">Members</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={selectAllContacts}
                        className="text-xs text-royal-600 hover:text-royal-700 font-medium">Select All</button>
                      <button type="button" onClick={deselectAllContacts}
                        className="text-xs text-stone-400 hover:text-stone-600 font-medium">Clear</button>
                    </div>
                  </div>
                  <input placeholder="Search contacts..." value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="w-full border-2 border-stone-200 rounded-xl px-3 py-2 text-xs mb-2 focus:border-saffron-400 transition-colors" />
                  <div className="space-y-1.5 max-h-40 overflow-y-auto border-2 border-stone-200 rounded-xl p-3">
                    {filteredContacts.length === 0 && <p className="text-xs text-stone-400">No contacts found</p>}
                    {filteredContacts.map((c) => (
                      <label key={c.id} className="flex items-center gap-2.5 text-sm text-stone-700 cursor-pointer group">
                        <input type="checkbox" checked={form.member_ids.includes(c.id)}
                          onChange={() => toggleMember(c.id)}
                          className="rounded border-stone-300 text-saffron-600 focus:ring-saffron-500" />
                        <span className="group-hover:text-stone-900 transition-colors">{c.name}</span>
                        <span className="text-xs text-stone-400 ml-auto">{c.email || ""}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-stone-400 mt-1.5">{form.member_ids.length} selected</p>
                </div>

                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={saving}
                  className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
                  {saving ? "Saving..." : editing ? "Update Group" : "Create Group"}
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {membersOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20 max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h2 className="text-lg font-bold text-stone-900">{membersOpen.name}</h2>
                  <p className="text-xs text-stone-500">{membersOpen.member_count} members</p>
                </div>
                <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
                  onClick={() => setMembersOpen(null)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
              </div>
              <div className="space-y-2">
                {(membersOpen.member_ids || []).length === 0 && (
                  <p className="text-sm text-stone-400 text-center py-4">No members in this group</p>
                )}
                {(membersOpen.member_ids || []).map((cid) => {
                  const c = contacts.find((x) => x.id === cid);
                  if (!c) return null;
                  return (
                    <div key={cid} className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-100">
                      <div>
                        <p className="text-sm font-semibold text-stone-800">{c.name}</p>
                        <p className="text-xs text-stone-500">{c.email || "No email"} {c.phone ? `• ${c.phone}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {c.email && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">Email</span>}
                        {c.telegram_chat_id && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Telegram</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
