import axios from "axios";
import { supabase } from "./supabase";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL });

let cachedToken = null;
let tokenExpiry = 0;
let refreshPromise = null;

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.access_token) {
    cachedToken = session.access_token;
    tokenExpiry = session.expires_at ? session.expires_at * 1000 : Date.now() + 300000;
    refreshPromise = null;
  } else {
    cachedToken = null;
    tokenExpiry = 0;
    refreshPromise = null;
  }
});

api.interceptors.request.use(async (config) => {
  if (cachedToken && Date.now() < tokenExpiry) {
    config.headers.Authorization = `Bearer ${cachedToken}`;
    return config;
  }
  if (!refreshPromise) {
    refreshPromise = supabase.auth.getSession().then(({ data }) => {
      const token = data?.session?.access_token;
      if (token) {
        cachedToken = token;
        tokenExpiry = data.session?.expires_at ? data.session.expires_at * 1000 : Date.now() + 300000;
      }
      return token;
    }).catch(() => null);
  }
  const token = await refreshPromise;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => {
    sessionStorage.removeItem('trustcrm.mfaRedirect');
    return response;
  },
  (error) => {
    if (error.response?.status === 403 && error.response?.data?.code === 'mfa_required') {
      // The API rejected a password-only token. Refresh the session and reload
      // once so MfaGate can present the verification step (guard against loops).
      const key = 'trustcrm.mfaRedirect';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        supabase.auth.refreshSession().finally(() => window.location.reload());
      }
    }
    if (error.response?.status === 401) {
      const path = window.location.pathname;
      const isAuthRoute = path === '/login' || path === '/mobile/login' || path.startsWith('/mobile/login');
      if (!isAuthRoute) {
        cachedToken = null;
        tokenExpiry = 0;
        refreshPromise = null;
        const target = path.startsWith('/mobile') ? '/mobile/login' : '/login';
        window.location.href = target;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
