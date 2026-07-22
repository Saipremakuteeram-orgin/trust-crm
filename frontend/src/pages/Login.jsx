import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "../lib/supabase";
import PasswordInput from "../components/PasswordInput";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) return setError(signInError.message);
    if (data?.session) {
      navigate("/dashboard", { replace: true });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-login">
      <div className="absolute inset-0 bg-mesh-pattern" />
      <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full opacity-20 animate-spin-slow"
        style={{ background: "conic-gradient(from 0deg, #fbbf24, #f59e0b, transparent, #fbbf24)" }} />
      <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full opacity-15 animate-spin-slow"
        style={{ background: "conic-gradient(from 180deg, #818cf8, #6366f1, transparent, #818cf8)", animationDirection: "reverse" }} />

      <motion.div className="absolute top-20 left-20 w-3 h-3 rounded-full bg-saffron-400/30"
        animate={{ y: [0, -12, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute top-40 right-32 w-2 h-2 rounded-full bg-royal-400/40"
        animate={{ y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }} />
      <motion.div className="absolute bottom-32 left-40 w-4 h-4 rounded-full bg-emerald-500/20"
        animate={{ y: [0, -16, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }} />
      <motion.div className="absolute bottom-20 right-20 w-2 h-2 rounded-full bg-saffron-300/30"
        animate={{ y: [0, -10, 0] }} transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 1.5 }} />

      <div className="w-full max-w-md mx-4 relative z-10">
        <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="glass rounded-3xl p-8 shadow-2xl shadow-black/20">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="flex flex-col items-center mb-8">
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl mb-4">
              <img src="/logo.jpg" alt="Trust CRM" className="w-full h-full object-cover" />
            </motion.div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Trust CRM</h1>
            <p className="text-sm text-royal-200/80 mt-1">Sign in to manage donations & expenses</p>
          </motion.div>

          <form onSubmit={handleLogin} className="space-y-5">
            <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
              <input type="email" required placeholder="Email address" value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder-royal-300/60 focus:ring-2 focus:ring-saffron-400/50 focus:border-saffron-400/50 transition-all duration-200" />
            </motion.div>
            <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
              <PasswordInput required placeholder="Password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder-royal-300/60 focus:ring-2 focus:ring-saffron-400/50 focus:border-saffron-400/50 transition-all duration-200" />
            </motion.div>

            {error && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl bg-rose-500/15 border border-rose-500/30 px-4 py-2.5">
                <p className="text-sm text-rose-200">{error}</p>
              </motion.div>
            )}

            <motion.button initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.02, boxShadow: "0 0 30px rgba(251, 191, 36, 0.3)" }}
              whileTap={{ scale: 0.98 }}
              type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-3 text-sm font-semibold shadow-lg shadow-saffron-500/30 transition-all duration-300 disabled:opacity-50">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </motion.svg>
                  Signing in...
                </span>
              ) : "Sign in"}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
