import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
export const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

export const supabase = createClient(
  SUPABASE_URL || "https://missing-project.supabase.co",
  SUPABASE_ANON_KEY || "missing-anon-key"
);

export async function checkSupabaseConnection(timeoutMs = 8000) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, code: "missing-config", status: 0 };
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: controller.signal,
      cache: "no-store",
    });

    return {
      ok: response.ok,
      code: response.ok ? "ok" : "http",
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      code: error?.name === "AbortError" ? "timeout" : "network",
      status: 0,
    };
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
