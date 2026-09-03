import { useEffect, useState } from "react";

export function getIsMobile() {
  if (typeof window === "undefined") return false;
  const narrow = window.matchMedia("(max-width: 768px)").matches;
  const ua = /Mobi|Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent || "");
  return narrow || ua;
}

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(getIsMobile);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = () => setIsMobile(getIsMobile());
    mq.addEventListener("change", handler);
    window.addEventListener("resize", handler);
    return () => {
      mq.removeEventListener("change", handler);
      window.removeEventListener("resize", handler);
    };
  }, []);
  return isMobile;
}
