import { useEffect, useRef, useState } from "react";
import { Upload, Folder, File as FileIcon, ChevronRight } from "lucide-react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileListItem from "../components/MobileListItem";
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
  const [uploading, setUploading] = useState(false);

  useEffect(() => { load(""); }, []);

  function load(folder) {
    setLoading(true);
    const params = folder ? `?folder=${encodeURIComponent(folder)}` : "";
    api.get("/drive" + params).then((r) => {
      setFiles(r.data.result.files || []);
      setLoading(false);
    }).catch(() => { addToast("Failed to load", "error"); setLoading(false); });
  }

  function open(f) {
    if (isFolder(f)) {
      setCrumbs((p) => [...p, { name: f.name, path: f.id || f.path || f.name }]);
      load(f.id || f.path || f.name);
    }
  }

  function goCrumb(i) {
    if (i < 0) { setCrumbs([]); load(""); return; }
    const c = crumbs[i];
    setCrumbs(crumbs.slice(0, i + 1));
    load(c.path);
  }

  async function handleUpload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      if (crumbs.length) fd.append("parent", crumbs[crumbs.length - 1].path);
      await api.post("/drive/upload", fd);
      addToast("Uploaded", "success");
      load(crumbs[crumbs.length - 1]?.path || "");
    } catch (err) { addToast(err.response?.data?.message || "Failed", "error"); }
    setUploading(false);
    e.target.value = "";
  }

  return (
    <MobileShell title="Common Drive" subtitle={crumbs.length ? crumbs[crumbs.length - 1].name : "Root"}>
      <div className="px-4 pt-3 space-y-2">
        {crumbs.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-stone-500 overflow-x-auto whitespace-nowrap">
            <button onClick={() => goCrumb(-1)} className="font-semibold text-royal-600">Root</button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight size={12} />
                <button onClick={() => goCrumb(i)} className="font-semibold text-royal-600">{c.name}</button>
              </span>
            ))}
          </div>
        )}

        {canEdit && (
          <label className="m-card flex items-center gap-2 text-sm text-stone-700 cursor-pointer active:bg-stone-50">
            <Upload size={16} />
            <span>{uploading ? "Uploading…" : "Upload a file"}</span>
            <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        )}
      </div>

      {loading ? (
        <div className="p-6 text-center text-sm text-stone-400">Loading…</div>
      ) : files.length === 0 ? (
        <EmptyState title="Empty folder" />
      ) : (
        <div className="m-card !p-0 mx-4 mt-3 overflow-hidden">
          <ul className="m-list">
            {files.map((f) => (
              <MobileListItem
                key={f.id}
                onClick={() => open(f)}
                leading={
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isFolder(f) ? "bg-saffron-50 text-saffron-600" : "bg-royal-50 text-royal-600"}`}>
                    {isFolder(f) ? <Folder size={18} /> : <FileIcon size={18} />}
                  </div>
                }
                title={f.name}
                subtitle={f.modifiedTime || ""}
              />
            ))}
          </ul>
        </div>
      )}
    </MobileShell>
  );
}
