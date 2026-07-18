import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import { ShieldAlert, Table2 } from "lucide-react";

export default function Spreadsheet() {
  const { profile } = useAuth();
  const containerRef = useRef(null);
  const univerRef = useRef(null);

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
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <Table2 size={16} />
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
            {role?.charAt(0).toUpperCase() + role?.slice(1)}
          </span>
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
