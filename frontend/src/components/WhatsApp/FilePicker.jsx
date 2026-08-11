import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { FileText, Upload, Send, X, FileSpreadsheet, File, Loader2 } from "lucide-react";
import api from "../lib/api";

const reportIcons = {
  "transactions-excel": FileSpreadsheet,
  "transactions-pdf": FileText,
};

export default function FilePicker({ onClose, selectedChat, onSendFile }) {
  const [file, setFile] = useState(null);
  const [reportType, setReportType] = useState("");
  const [sending, setSending] = useState(false);
  const [reports, setReports] = useState([]);
  const fileInputRef = useRef(null);

  useState(() => {
    api.get("/whatsapp/reports")
      .then((res) => setReports(res.data.result))
      .catch(() => setReports([]));
  });

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setReportType("");
    }
  }

  async function handleSend() {
    if (!selectedChat?.phoneNorm) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("phone", selectedChat.phoneNorm);

      if (file) {
        formData.append("file", file);
      } else if (reportType) {
        formData.append("reportType", reportType);
      } else {
        return;
      }

      const res = await api.post("/whatsapp/send-file", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onSendFile(res.data.result);
      onClose();
    } catch (err) {
      console.error("send-file error:", err);
    }
    setSending(false);
  }

  const canSend = file || reportType;

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="w-80 border-l border-stone-200 flex flex-col bg-stone-50/30"
    >
      <div className="p-4 border-b border-stone-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-stone-900">Attach File</h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-stone-200 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="text-xs font-medium text-stone-600 block mb-1.5">Or pick a report</label>
          <div className="space-y-1.5">
            {reports.map((r) => {
              const Icon = reportIcons[r.type] || File;
              const selected = reportType === r.type && !file;
              return (
                <motion.label
                  key={r.type}
                  whileHover={{ scale: 1.01 }}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    selected
                      ? "border-saffron-500 bg-saffron-50"
                      : "border-stone-200 hover:border-stone-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="reportType"
                    value={r.type}
                    checked={selected}
                    onChange={() => { setReportType(r.type); setFile(null); }}
                    className="hidden"
                  />
                  <Icon size={18} className={selected ? "text-saffron-600" : "text-stone-500"} />
                  <span className="text-sm font-medium text-stone-800">{r.label}</span>
                </motion.label>
              );
            })}
          </div>
        </div>

        <div className="border-t border-stone-200 pt-4">
          <label className="text-xs font-medium text-stone-600 block mb-1.5">Or upload from device</label>
          <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-stone-300 bg-white cursor-pointer hover:border-saffron-400 hover:bg-saffron-50/30 transition-all">
            <Upload size={16} className="text-stone-400" />
            <span className="text-sm text-stone-600">
              {file ? file.name : "Choose a file"}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept=".pdf,.xls,.xlsx,.doc,.docx,.csv,.txt,.zip,.jpg,.png"
            />
          </label>
          {file && (
            <div className="mt-2 text-xs text-stone-500">
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-stone-200">
        <motion.button
          whileHover={{ scale: canSend && !sending ? 1.02 : 1 }}
          whileTap={{ scale: canSend && !sending ? 0.98 : 1 }}
          onClick={handleSend}
          disabled={!canSend || sending}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-saffron-500 to-saffron-600 text-white text-sm font-semibold shadow-lg shadow-saffron-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {sending ? "Sending..." : "Send via WhatsApp"}
        </motion.button>
      </div>
    </motion.div>
  );
}
