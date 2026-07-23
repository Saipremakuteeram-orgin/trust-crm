import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import useEscToClose from "../hooks/useEscToClose";
import {
  FolderOpen, File, Upload, FolderPlus, Trash2, Pencil, Copy,
  ChevronRight, Home, Search, MoreVertical, X, Loader2, Download
} from "lucide-react";

function formatSize(bytes) {
  if (!bytes) return "—";
  const b = Number(bytes);
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function isFolder(f) {
  return f.mimeType === "application/vnd.google-apps.folder" || f.name?.endsWith("/");
}

export default function DriveManager() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const role = profile?.role || "viewer";
  const canEdit = role === "admin" || role === "accountant";
  const fileInputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [currentFolder, setCurrentFolder] = useState("");
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [actionMenu, setActionMenu] = useState(null);
  const [renameOpen, setRenameOpen] = useState(null);
  const [renameName, setRenameName] = useState("");
  const [selected, setSelected] = useState([]);
  useEscToClose(() => setNewFolderOpen(false), newFolderOpen);
  useEscToClose(() => setRenameOpen(null), !!renameOpen);

  const loadFiles = useCallback(async (folder) => {
    setLoading(true);
    try {
      const params = folder ? `?folder=${encodeURIComponent(folder)}` : "";
      const res = await api.get("/drive" + params);
      setFiles(res.data.result.files || []);
      setCurrentFolder(res.data.result.currentFolder || "");
    } catch (err) {
      addToast("Failed to load files", "error");
    }
    setLoading(false);
  }, [addToast]);

  useEffect(() => { loadFiles(currentFolder); }, []);

  function navigateToFolder(folderPath, folderName) {
    if (!folderPath) {
      setCurrentFolder("");
      setBreadcrumbs([]);
      loadFiles("");
      return;
    }
    setBreadcrumbs((prev) => [...prev, { path: folderPath, name: folderName }]);
    loadFiles(folderPath);
  }

  function navigateToCrumb(idx) {
    const crumb = breadcrumbs[idx];
    const newCrumbs = breadcrumbs.slice(0, idx + 1);
    setBreadcrumbs(newCrumbs);
    loadFiles(crumb.path);
  }

  async function handleCreateFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreating(true);
    try {
      await api.post("/drive/folder", { parent: currentFolder, name: newFolderName.trim() });
      addToast("Folder created", "success");
      setNewFolderOpen(false);
      setNewFolderName("");
      loadFiles(currentFolder);
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to create folder", "error");
    }
    setCreating(false);
  }

  async function handleUpload(e) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (const f of fileList) formData.append("files", f);
      if (currentFolder) formData.append("folder", currentFolder);
      await api.post("/drive/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      addToast(`Uploaded ${fileList.length} file(s)`, "success");
      loadFiles(currentFolder);
    } catch (err) {
      addToast(err.response?.data?.message || "Upload failed", "error");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleRename(e) {
    e.preventDefault();
    if (!renameName.trim() || !renameOpen) return;
    try {
      await api.patch("/drive/rename", { path: renameOpen.id, newName: renameName.trim() });
      addToast("Renamed successfully", "success");
      setRenameOpen(null);
      loadFiles(currentFolder);
    } catch (err) {
      addToast("Failed to rename", "error");
    }
  }

  async function handleDelete() {
    const toDelete = selected.length > 0 ? selected : (actionMenu ? [actionMenu] : []);
    if (toDelete.length === 0) return;
    if (!window.confirm(`Delete ${toDelete.length} item(s)?`)) return;
    try {
      await api.delete("/drive", { data: { files: toDelete } });
      addToast("Deleted", "success");
      setSelected([]);
      setActionMenu(null);
      loadFiles(currentFolder);
    } catch (err) {
      addToast("Failed to delete", "error");
    }
  }

  async function handleDownload(file) {
    try {
      const res = await api.get(`/drive/download?path=${encodeURIComponent(file.id)}`);
      window.open(res.data.result.url, "_blank");
    } catch (err) {
      addToast("Failed to download", "error");
    }
  }

  function toggleSelect(id) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  const filtered = files.filter((f) => {
    if (!search) return true;
    return (f.name || "").toLowerCase().includes(search.toLowerCase());
  });

  const folders = filtered.filter((f) => isFolder(f));
  const regularFiles = filtered.filter((f) => !isFolder(f));

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Common Drive</h1>
          <p className="text-sm text-stone-500 mt-1">Shared folder accessible by admin and accountant</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" className="hidden" multiple onChange={handleUpload} />
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50">
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {uploading ? "Uploading..." : "Upload"}
            </motion.button>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => { setNewFolderOpen(true); setNewFolderName(""); }}
              className="flex items-center gap-2 bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-saffron-500/20 transition-all">
              <FolderPlus size={16} /> New Folder
            </motion.button>
          </div>
        )}
      </motion.div>

      {/* Breadcrumbs */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
        className="flex items-center gap-1 text-sm mb-4 flex-wrap">
        <button onClick={() => navigateToFolder(null)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors font-medium">
          <Home size={14} /> Common
        </button>
        {breadcrumbs.map((b, i) => (
          <span key={b.path} className="flex items-center gap-1">
            <ChevronRight size={12} className="text-stone-400" />
            <button onClick={() => navigateToCrumb(i)}
              className="px-2 py-1 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors font-medium">
              {b.name}
            </button>
          </span>
        ))}
      </motion.div>

      {/* Search + bulk actions */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        className="mb-4 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input placeholder="Search files..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border-2 border-stone-200 rounded-xl focus:border-saffron-400 transition-colors" />
        </div>
        {selected.length > 0 && canEdit && (
          <button onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors">
            <Trash2 size={14} /> Delete ({selected.length})
          </button>
        )}
      </motion.div>

      {/* File Grid */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-5 min-h-[400px]">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-saffron-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-stone-400">
            <FolderOpen size={48} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">{files.length === 0 ? "This folder is empty" : "No matches found"}</p>
            <p className="text-sm mt-1">{files.length === 0 ? "Create a folder or upload a file to get started" : "Try a different search"}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {folders.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Folders</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {folders.map((f) => (
                    <div key={f.id}
                      className="group relative flex items-center gap-3 p-3 rounded-xl border border-stone-100 hover:border-saffron-200 hover:bg-saffron-50/30 cursor-pointer transition-all"
                      onDoubleClick={() => navigateToFolder(f.id, f.name)}>
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-saffron-400 to-saffron-500 flex items-center justify-center text-white shadow-sm">
                        <FolderOpen size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-stone-800 truncate">{f.name}</p>
                        <p className="text-[10px] text-stone-400">{formatDate(f.createdTime)}</p>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); toggleSelect(f.id); }}
                            className={`w-4 h-4 rounded border-2 transition-colors ${selected.includes(f.id) ? "bg-saffron-500 border-saffron-500" : "border-stone-300"}`} />
                          <button onClick={(e) => { e.stopPropagation(); setActionMenu(actionMenu === f.id ? null : f.id); }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-stone-200 transition-all">
                            <MoreVertical size={14} className="text-stone-500" />
                          </button>
                        </div>
                      )}
                      <AnimatePresence>
                        {actionMenu === f.id && (
                          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-stone-200 py-1 z-30 w-40"
                            onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => { setRenameOpen(f); setRenameName(f.name); setActionMenu(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50">
                              <Pencil size={13} /> Rename
                            </button>
                            <hr className="my-1 border-stone-100" />
                            <button onClick={handleDelete}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
                              <Trash2 size={13} /> Delete
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {regularFiles.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Files</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {regularFiles.map((f) => (
                    <div key={f.id}
                      className="group relative flex items-center gap-3 p-3 rounded-xl border border-stone-100 hover:border-royal-200 hover:bg-royal-50/30 cursor-pointer transition-all">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-royal-400 to-royal-500 flex items-center justify-center text-white shadow-sm">
                        <File size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-stone-800 truncate">{f.name}</p>
                        <p className="text-[10px] text-stone-400">{formatSize(f.size)} · {formatDate(f.modifiedTime || f.createdTime)}</p>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); toggleSelect(f.id); }}
                            className={`w-4 h-4 rounded border-2 transition-colors ${selected.includes(f.id) ? "bg-saffron-500 border-saffron-500" : "border-stone-300"}`} />
                          <button onClick={(e) => { e.stopPropagation(); setActionMenu(actionMenu === f.id ? null : f.id); }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-stone-200 transition-all">
                            <MoreVertical size={14} className="text-stone-500" />
                          </button>
                        </div>
                      )}
                      <AnimatePresence>
                        {actionMenu === f.id && (
                          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-stone-200 py-1 z-30 w-40"
                            onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => handleDownload(f)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50">
                              <Download size={13} /> Download
                            </button>
                            <button onClick={() => { setRenameOpen(f); setRenameName(f.name); setActionMenu(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50">
                              <Pencil size={13} /> Rename
                            </button>
                            <hr className="my-1 border-stone-100" />
                            <button onClick={handleDelete}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
                              <Trash2 size={13} /> Delete
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* New Folder Modal */}
      <AnimatePresence>
        {newFolderOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-stone-900">New Folder</h2>
                <button onClick={() => setNewFolderOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100"><X size={18} /></button>
              </div>
              <form onSubmit={handleCreateFolder} className="space-y-4">
                <input autoFocus required placeholder="Folder name" value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={creating}
                  className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 disabled:opacity-50">
                  {creating ? "Creating..." : "Create Folder"}
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rename Modal */}
      <AnimatePresence>
        {renameOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-stone-900">Rename</h2>
                <button onClick={() => setRenameOpen(null)} className="p-1.5 rounded-lg hover:bg-stone-100"><X size={18} /></button>
              </div>
              <form onSubmit={handleRename} className="space-y-4">
                <input autoFocus required value={renameName} onChange={(e) => setRenameName(e.target.value)}
                  className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25">
                  Rename
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
