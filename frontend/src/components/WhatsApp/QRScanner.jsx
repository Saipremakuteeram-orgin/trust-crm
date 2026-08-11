import { motion } from "framer-motion";
import { QrCode, RefreshCw } from "lucide-react";

export default function QRScanner({ qrDataUrl, onRefresh }) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        <div className="p-4 bg-white border-2 border-stone-200 rounded-2xl shadow-lg">
          <img src={qrDataUrl} alt="WhatsApp QR Code" className="w-48 h-48 object-contain" />
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }} className="absolute -bottom-2 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-1 px-3 py-1 bg-emerald-500 rounded-full text-xs font-medium text-white">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            Scanning...
          </div>
        </motion.div>
      </div>

      <div className="text-center">
        <h3 className="text-lg font-semibold text-stone-900 mb-2">Scan with WhatsApp</h3>
        <p className="text-sm text-stone-500 mb-4">
          Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
        </p>
      </div>

      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
        onClick={onRefresh}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-700 bg-stone-100 rounded-xl hover:bg-stone-200 transition-colors">
        <RefreshCw size={14} />
        Refresh QR Code
      </motion.button>

      <QrCode size={16} className="text-stone-300" />
    </div>
  );
}
