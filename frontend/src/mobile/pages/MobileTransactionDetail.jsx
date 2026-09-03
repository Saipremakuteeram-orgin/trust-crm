import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Upload, Download, Trash2 } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileCard from "../components/MobileCard";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../lib/AuthContext";

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function MobileTransactionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canEdit = role === "admin" || role === "accountant";
  const canDelete = role === "admin";
  const [txn, setTxn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get("/transactions").then((r) => {
      const t = (r.data.result || []).find((x) => x.id === id);
      setTxn(t || null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { addToast("Max 20MB", "error"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/transactions/${id}/receipt`, fd);
      addToast("Receipt uploaded", "success");
      setFile(null);
      const r = await api.get("/transactions");
      setTxn((r.data.result || []).find((x) => x.id === id) || null);
    } catch (err) { addToast(err.response?.data?.message || "Upload failed", "error"); }
    setUploading(false);
  }

  async function handleDownload() {
    try {
      const res = await api.get(`/transactions/${id}/receipt`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href = url; a.download = txn.receipt_file_name || "receipt";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (err) { addToast("Download failed", "error"); }
  }

  async function handleRemove() {
    if (!window.confirm("Remove receipt?")) return;
    try {
      await api.delete(`/transactions/${id}/receipt`);
      addToast("Receipt removed", "success");
      const r = await api.get("/transactions");
      setTxn((r.data.result || []).find((x) => x.id === id) || null);
    } catch { addToast("Failed", "error"); }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this transaction?")) return;
    try {
      await api.delete(`/transactions/${id}`);
      addToast("Deleted", "success");
      navigate(-1);
    } catch { addToast("Failed", "error"); }
  }

  if (loading) {
    return <MobileShell title="Transaction" showBack><div className="p-6 text-center text-sm text-stone-400">Loading…</div></MobileShell>;
  }
  if (!txn) {
    return <MobileShell title="Transaction" showBack><div className="p-6 text-center text-sm text-stone-500">Not found</div></MobileShell>;
  }

  return (
    <MobileShell title="Transaction" showBack>
      <div className="p-4 space-y-3">
        <MobileCard>
          <div className="text-[10px] uppercase tracking-wider text-stone-500">{txn.txn_date}</div>
          <div className={`text-3xl font-bold mt-1 ${txn.type === "credit" ? "text-emerald-600" : "text-rose-600"}`}>
            {txn.type === "credit" ? "+" : "-"}{fmt(txn.amount)}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-stone-500">Type</div>
              <div className="font-semibold text-stone-800 capitalize">{txn.type}</div>
            </div>
            <div>
              <div className="text-stone-500">Mode</div>
              <div className="font-semibold text-stone-800 capitalize">{txn.mode}</div>
            </div>
            <div>
              <div className="text-stone-500">Party</div>
              <div className="font-semibold text-stone-800">{txn.party || "—"}</div>
            </div>
            <div>
              <div className="text-stone-500">Category</div>
              <div className="font-semibold text-stone-800">{txn.categories?.name || "—"}</div>
            </div>
            {txn.mode === "cash" && (
              <div>
                <div className="text-stone-500">Voucher</div>
                <div className="font-semibold text-stone-800">{txn.voucher_filed ? "Filed" : "Pending"}</div>
              </div>
            )}
            {txn.functions?.name && (
              <div>
                <div className="text-stone-500">Function</div>
                <div className="font-semibold text-stone-800">{txn.functions.name}</div>
              </div>
            )}
          </div>
          {txn.description && (
            <div className="mt-3 text-xs text-stone-600">{txn.description}</div>
          )}
        </MobileCard>

        <MobileCard>
          <div className="text-sm font-bold text-stone-800 mb-2">Receipt</div>
          {txn.receipt_file_id ? (
            <div className="flex items-center justify-between">
              <div className="text-xs text-stone-600 truncate">{txn.receipt_file_name || "Attached"}</div>
              <div className="flex gap-1">
                {canEdit && (
                  <button onClick={handleDownload} className="m-tap w-9 h-9 rounded-lg bg-royal-50 text-royal-600 flex items-center justify-center"><Download size={15} /></button>
                )}
                {canEdit && (
                  <button onClick={handleRemove} className="m-tap w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"><Trash2 size={15} /></button>
                )}
              </div>
            </div>
          ) : canEdit ? (
            <form onSubmit={handleUpload} className="space-y-2">
              <label className="flex items-center gap-2 px-3 py-3 border-2 border-dashed border-stone-300 rounded-xl text-xs text-stone-600">
                <Upload size={14} /> {file ? file.name : "Tap to choose a file"}
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              {file && (
                <button type="submit" disabled={uploading} className="w-full bg-saffron-500 text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-50">
                  {uploading ? "Uploading…" : "Upload receipt"}
                </button>
              )}
            </form>
          ) : (
            <div className="text-xs text-stone-400">No receipt attached</div>
          )}
        </MobileCard>

        {canDelete && (
          <button onClick={handleDelete} className="w-full m-tap text-sm font-semibold py-3 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
            Delete transaction
          </button>
        )}
      </div>
    </MobileShell>
  );
}
