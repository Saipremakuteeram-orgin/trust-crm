import axios from "axios";
import { supabase } from "./supabase";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL });

let cachedToken = null;
let tokenExpiry = 0;

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.access_token) {
    cachedToken = session.access_token;
    tokenExpiry = session.expires_at ? session.expires_at * 1000 : Date.now() + 300000;
  } else {
    cachedToken = null;
    tokenExpiry = 0;
  }
});

api.interceptors.request.use(async (config) => {
  if (cachedToken && Date.now() < tokenExpiry) {
    config.headers.Authorization = `Bearer ${cachedToken}`;
    return config;
  }
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) {
    cachedToken = token;
    tokenExpiry = data.session?.expires_at ? data.session.expires_at * 1000 : Date.now() + 300000;
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      cachedToken = null;
      tokenExpiry = 0;
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
