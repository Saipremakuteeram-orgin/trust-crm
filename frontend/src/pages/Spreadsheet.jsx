import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import AppLayout from "../components/AppLayout";
import api from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../components/Toast";
import { ShieldAlert, Table2, Download, CloudUpload, FileSpreadsheet } from "lucide-react";

export default function Spreadsheet() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const containerRef = useRef(null);
  const univerRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sheetName, setSheetName] = useState("");

  const role = profile?.role || "viewer";
  const canEdit = role === "admin" || role === "accountant";

  if (!canEdit) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center">
          <ShieldAlert size={48} className="text-rose-400 mb-4" />
          <h2 className="text-xl font-bold text-stone-800">Access Denied</h2>
          <p className="text-sm text-stone-500 mt-2">Only admin and accountant roles can access the spreadsheet.</p>
        </div>
      </AppLayout>
    );
  }

  function getSheetData() {
    if (!univerRef.current) return null;
    const fWorkbook = univerRef.current.getActiveWorkbook();
    if (!fWorkbook) return null;
    const snapshot = fWorkbook.save();
    return snapshot;
  }

  async function saveToDrive() {
    const data = getSheetData();
    if (!data) {
      addToast("No spreadsheet data to save", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("/exports/spreadsheet/save", {
        data,
        fileName: sheetName || undefined,
      });
      const file = res.data.result;
      addToast(`Saved to Drive: ${file.name}`, "success");
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function downloadExcel() {
    const data = getSheetData();
    if (!data) {
      addToast("No spreadsheet data to download", "error");
      return;
    }
    setDownloading(true);
    try {
      const res = await api.post("/exports/spreadsheet/download", {
        data,
        fileName: sheetName || undefined,
      }, { responseType: "blob" });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", res.headers["content-disposition"]?.split("filename=")?.[1]?.replace(/"/g, "") || "spreadsheet.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast("Downloaded as Excel file", "success");
    } catch (err) {
      addToast("Failed to download", "error");
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    if (!containerRef.current || univerRef.current) return;

    let disposed = false;

    async function init() {
      const { createUniver, LocaleType, mergeLocales } = await import("@univerjs/presets");
      const { UniverSheetsCorePreset } = await import("@univerjs/preset-sheets-core");
      const UniverPresetSheetsCoreEnUS = (await import("@univerjs/preset-sheets-core/locales/en-US")).default;
      await import("@univerjs/preset-sheets-core/lib/index.css");

      if (disposed || !containerRef.current) return;

      const { univerAPI } = createUniver({
        locale: LocaleType.EN_US,
        locales: {
          [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS),
        },
        presets: [
          UniverSheetsCorePreset({
            container: containerRef.current,
          }),
        ],
      });

      univerAPI.createWorkbook({});
      univerRef.current = univerAPI;
    }

    init();

    return () => {
      disposed = true;
      if (univerRef.current) {
        univerRef.current.dispose();
        univerRef.current = null;
      }
    };
  }, []);

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Spreadsheet</h1>
          <p className="text-sm text-stone-500 mt-1">Create and edit spreadsheets directly in your browser</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" value={sheetName} onChange={(e) => setSheetName(e.target.value)}
            placeholder="Sheet name..."
            className="px-3 py-1.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-saffron-400 w-44" />
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={downloadExcel} disabled={downloading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50">
            <Download size={15} className={downloading ? "animate-bounce" : ""} />
            {downloading ? "Downloading..." : "Download Excel"}
          </motion.button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={saveToDrive} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-gradient-to-r from-royal-500 to-royal-600 text-white shadow-md shadow-royal-500/25 hover:shadow-lg transition-all disabled:opacity-50">
            <CloudUpload size={15} className={saving ? "animate-pulse" : ""} />
            {saving ? "Saving..." : "Save to Drive"}
          </motion.button>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden"
        style={{ height: "calc(100vh - 220px)" }}>
        <div ref={containerRef} className="w-full h-full" />
      </motion.div>
    </AppLayout>
  );
}
