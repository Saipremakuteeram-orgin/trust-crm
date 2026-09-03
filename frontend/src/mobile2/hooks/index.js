import { useState, useEffect, useCallback } from "react";

const BIOMETRIC_KEY = "trustCrmBiometric";
const PREFILL_KEY = "trustCrmPreFill";
const CACHE_KEY = "trustCrmFeedCache";
const CACHE_TTL = 5 * 60 * 1000;

export function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function useBiometric() {
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    try {
      setEnabled(!!(typeof window !== "undefined" && localStorage.getItem(BIOMETRIC_KEY)));
      setAvailable(!!(typeof window !== "undefined" && navigator.credentials && navigator.credentials.get));
    } catch {
      setAvailable(false);
    }
  }, []);

  const enroll = useCallback(async () => {
    try {
      if (!navigator.credentials?.create) throw new Error("not-supported");
      await navigator.credentials.create({ publicKey: { challenge: new Uint8Array(32), pubKeyCredParams: [{ type: "public-key", alg: -7 }] } });
      localStorage.setItem(BIOMETRIC_KEY, "1");
      setEnabled(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const authenticate = useCallback(async () => {
    try {
      if (!enabled || !navigator.credentials?.get) return false;
      await navigator.credentials.get({ publicKey: { challenge: new Uint8Array(32), allowCredentials: [] } });
      return true;
    } catch {
      return false;
    }
  }, [enabled]);

  const disable = useCallback(() => {
    localStorage.removeItem(BIOMETRIC_KEY);
    setEnabled(false);
  }, []);

  return { enabled, available, enroll, authenticate, disable };
}

export function usePreFill() {
  const read = useCallback(() => {
    try {
      const raw = localStorage.getItem(PREFILL_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, []);

  const write = useCallback((values) => {
    try {
      const current = read();
      localStorage.setItem(PREFILL_KEY, JSON.stringify({ ...current, ...values, updatedAt: Date.now() }));
    } catch {}
  }, [read]);

  const reset = useCallback(() => {
    try { localStorage.removeItem(PREFILL_KEY); } catch {}
  }, []);

  return { read, write, reset };
}

export function useCachedFeed() {
  const read = useCallback(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const write = useCallback((payload) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...payload, cachedAt: Date.now(), expiresAt: Date.now() + CACHE_TTL }));
    } catch {}
  }, []);

  const clear = useCallback(() => {
    try { localStorage.removeItem(CACHE_KEY); } catch {}
  }, []);

  return { read, write, clear };
}

export function useQuickLog() {
  const [open, setOpen] = useState(false);
  const openSheet = useCallback(() => setOpen(true), []);
  const closeSheet = useCallback(() => setOpen(false), []);
  return { open, openSheet, closeSheet };
}

export function getIsMobile() {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent || "") || (window.innerWidth < 768);
}
