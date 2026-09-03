import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UsersRound, Trash2 } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileListItem from "../components/MobileListItem";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

export default function MobileGroups() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const canDelete = profile?.role === "admin";
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/groups").then((r) => { setGroups(r.data.result || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleDelete(id) {
    if (!window.confirm("Delete this group?")) return;
    try { await api.delete(`/groups/${id}`); addToast("Deleted", "success"); const r = await api.get("/groups"); setGroups(r.data.result || []); }
    catch { addToast("Failed", "error"); }
  }

  return (
    <MobileShell title="Groups" subtitle={`${groups.length} groups`}>
      {loading ? (
        <div className="p-6 text-center text-sm text-stone-400">Loading…</div>
      ) : groups.length === 0 ? (
        <EmptyState title="No groups yet" message="Create groups on desktop to bulk-notify contacts." />
      ) : (
        <div className="m-card !p-0 mx-4 mt-3 overflow-hidden">
          <ul className="m-list">
            {groups.map((g) => (
              <MobileListItem
                key={g.id}
                onClick={() => navigate(`/m/contacts?group=${g.id}`)}
                leading={
                  <div className="w-10 h-10 rounded-xl bg-royal-50 text-royal-600 flex items-center justify-center"><UsersRound size={18} /></div>
                }
                title={g.name}
                subtitle={`${g.member_count || 0} members`}
                trailing={canDelete ? (
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(g.id); }} className="m-tap w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"><Trash2 size={14} /></button>
                ) : null}
              />
            ))}
          </ul>
        </div>
      )}
    </MobileShell>
  );
}
