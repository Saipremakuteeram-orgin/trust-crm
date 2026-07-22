import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const fetchedRef = useRef(new Set());
  const abortRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      const userId = sess?.user?.id;
      if (!userId) {
        setProfile(null);
        fetchedRef.current.clear();
        return;
      }
      if (fetchedRef.current.has(userId)) return;
      fetchedRef.current.add(userId);
      fetchProfile(userId);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId) {
    if (!userId) { setProfile(null); return; }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", userId)
        .single();
      if (!controller.signal.aborted) setProfile(data);
    } catch {
      if (!controller.signal.aborted) setProfile(null);
    }
  }

  function refreshProfile() {
    const userId = session?.user?.id;
    if (!userId) return;
    fetchedRef.current.delete(userId);
    fetchProfile(userId);
  }

  return <AuthContext.Provider value={{ session, profile, refreshProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
