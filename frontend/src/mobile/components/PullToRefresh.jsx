import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

export default function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onStart = (e) => {
      if (el.scrollTop === 0) startY.current = e.touches[0].clientY;
    };
    const onMove = (e) => {
      if (startY.current == null || refreshing) return;
      if (el.scrollTop > 0) { startY.current = null; setPull(0); return; }
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0) {
        setPull(Math.min(dy * 0.4, 90));
        if (dy > 10) e.preventDefault();
      }
    };
    const onEnd = async () => {
      if (pull > 60 && !refreshing) {
        setRefreshing(true);
        try { await onRefresh?.(); } finally {
          setTimeout(() => { setRefreshing(false); setPull(0); }, 400);
        }
      } else {
        setPull(0);
      }
      startY.current = null;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [pull, refreshing, onRefresh]);

  return (
    <div ref={containerRef} className="relative overflow-y-auto h-full">
      <div
        className="absolute left-0 right-0 flex items-center justify-center text-stone-400 transition-opacity"
        style={{ top: pull - 28, height: 28, opacity: pull > 10 ? 1 : 0 }}
      >
        <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} style={{ transform: `rotate(${pull * 4}deg)` }} />
      </div>
      <div style={{ transform: `translateY(${pull}px)`, transition: pull === 0 ? "transform 0.2s" : "none" }}>
        {children}
      </div>
    </div>
  );
}
