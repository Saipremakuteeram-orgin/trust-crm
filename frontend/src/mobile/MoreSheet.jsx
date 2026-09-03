import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { X, ChevronRight } from "lucide-react";
import { getAllVisibleMore } from "./lib/mobileNav";
import { useAuth } from "../lib/AuthContext";

export default function MoreSheet({ open, onClose }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const role = profile?.role || "viewer";
  const groups = getAllVisibleMore(role);

  const go = (to) => { onClose(); setTimeout(() => navigate(to), 120); };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            role="dialog" aria-label="More menu"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="text-base font-bold text-stone-900">More</h2>
              <button onClick={onClose} aria-label="Close" className="m-tap w-10 h-10 rounded-xl flex items-center justify-center active:bg-stone-100">
                <X size={20} />
              </button>
            </div>
            <div className="w-12 h-1.5 rounded-full bg-stone-200 mx-auto mb-2" />
            <div className="space-y-3 pb-6">
              {groups.map((g) => (
                <div key={g.title} className="mx-3 m-card !p-0 overflow-hidden">
                  <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500 bg-stone-50">
                    {g.title}
                  </div>
                  <ul className="m-list">
                    {g.items.map((it) => {
                      const Icon = it.icon;
                      return (
                        <li key={it.to}>
                          <button
                            onClick={() => go(it.to)}
                            className="w-full flex items-center gap-3 px-4 py-3 m-tap text-left active:bg-stone-50"
                          >
                            <div className="w-9 h-9 rounded-xl bg-saffron-50 text-saffron-600 flex items-center justify-center shrink-0">
                              <Icon size={18} />
                            </div>
                            <span className="flex-1 text-sm font-semibold text-stone-800 truncate">{it.label}</span>
                            <ChevronRight size={18} className="text-stone-300" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
