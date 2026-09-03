import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Folder, File as FileIcon, Upload } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../components/Toast";

function isFolder(f) {
  return f.mimeType === "application/vnd.google-apps.folder" || f.name?.endsWith("/");
}

export default function MobileDrive() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const canEdit = profile?.role === "admin" || profile?.role === "accountant";
  const [files, setFiles] = useState([]);
  const [crumbs, setCrumbs] = useState([]);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef(null);

  useEffect(() => { load(""); }, []);

  function load(folder) {
    setLoading(true);
    const params = folder ? `?folder=${encodeURIComponent(folder)}` : "";
    api.get("/drive" + params).then((r) => { setFiles(r.data.result.files || []); setLoading(false); }).catch(() => { addToast("Failed", "error"); setLoading(false); });
  }

  function open(f) {
    if (isFolder(f)) {
      setCrumbs((p) => [...p, f.name]);
      load(f.id || f.path || f.name);
    }
  }

  async function upload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const fd = new FormData();
      fd.append("file", f);
      if (crumbs.length) fd.append("parent", crumbs[crumbs.length - 1]);
      await api.post("/drive/upload", fd);
      addToast("Uploaded", "success");
      load(crumbs[crumbs.length - 1]?.path || "");
    } catch (err) { addToast(err.response?.data?.message || "Failed", "error"); }
    e.target.value = "";
  }

  return (
    <MobileShell title="Drive" subtitle={crumbs.length ? crumbs[crumbs.length - 1] : "Root"}>
      {canEdit && (
        <div className="px-4 pt-3">
          <label className="flex items-center gap-2 text-sm text-stone-700 px-4 py-3 rounded-2xl border-2 border-dashed border-stone-300 cursor-pointer active:bg-stone-50">
            <Upload size={16} /> <span>Upload a file</span>
            <input ref={fileRef} type="file" className="hidden" onChange={upload} />
          </label>
        </div>
      )}
      {loading ? (
        <div className="p-6 text-center text-sm text-stone-400">Loading…</div>
      ) : files.length === 0 ? (
        <div className="px-4 pt-3"><Card><EmptyState title="Empty folder" /></Card></div>
      ) : (
        <div className="p-4 space-y-2">
          {files.map((f) => (
            <Card key={f.id} onClick={() => open(f)} padding={false}>
              <div className="px-4 py-3 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isFolder(f) ? "bg-saffron-50 text-saffron-600" : "bg-royal-50 text-royal-600"}`}>
                  {isFolder(f) ? <Folder size={18} /> : <FileIcon size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-stone-800 truncate">{f.name}</div>
                  <div className="text-[11px] text-stone-500">{f.modifiedTime || ""}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </MobileShell>
  );
}
