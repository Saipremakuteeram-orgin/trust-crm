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
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      cachedToken = null;
      tokenExpiry = 0;
      refreshPromise = null;
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
