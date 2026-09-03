import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Mail, Phone, Send, Trash2 } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileCard from "../components/MobileCard";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../lib/AuthContext";

export default function MobileContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { profile } = useAuth();
  const canDelete = profile?.role === "admin";
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/contacts").then((r) => {
      setC((r.data.result || []).find((x) => x.id === id) || null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (!window.confirm("Delete this contact?")) return;
    try {
      await api.delete(`/contacts/${id}`);
      addToast("Deleted", "success");
      navigate(-1);
    } catch { addToast("Failed", "error"); }
  }

  if (loading) return <MobileShell title="Contact" showBack><div className="p-6 text-sm text-stone-400 text-center">Loading…</div></MobileShell>;
  if (!c) return <MobileShell title="Contact" showBack><div className="p-6 text-sm text-stone-500 text-center">Not found</div></MobileShell>;

  return (
    <MobileShell title={c.name || "Contact"} showBack>
      <div className="p-4 space-y-3">
        <MobileCard>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-royal-100 text-royal-700 flex items-center justify-center text-base font-bold">
              {(c.name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-base font-bold text-stone-800">{c.name}</div>
              {c.subscribe_monthly_report && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Monthly report</span>}
            </div>
          </div>
          <div className="space-y-2 mt-3">
            {c.phone && (
              <a href={`tel:${c.phone}`} className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 active:bg-stone-50">
                <Phone size={16} className="text-royal-500" />
                <span className="text-sm text-stone-700">{c.phone}</span>
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 active:bg-stone-50">
                <Mail size={16} className="text-saffron-500" />
                <span className="text-sm text-stone-700">{c.email}</span>
              </a>
            )}
            {c.telegram_chat_id && (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-stone-200">
                <Send size={16} className="text-emerald-500" />
                <span className="text-sm text-stone-700">Telegram: {c.telegram_chat_id}</span>
              </div>
            )}
          </div>
        </MobileCard>
        {canDelete && (
          <button onClick={handleDelete} className="w-full m-tap text-sm font-semibold py-3 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center gap-2">
            <Trash2 size={14} /> Delete contact
          </button>
        )}
      </div>
    </MobileShell>
  );
}
