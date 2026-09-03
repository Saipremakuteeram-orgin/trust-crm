import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import PasswordInput from "../../components/PasswordInput";
import { useToast } from "../../components/Toast";

export default function MobileLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBiometric, setShowBiometric] = useState(false);
  const { enabled, available, enroll, authenticate } = useBiometric();
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled || !available) return;
    (async () => {
      const ok = await authenticate();
      if (ok) navigate("/mobile/home", { replace: true });
    })();
  }, [enabled, available]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) return setError(signInError.message);
    if (data?.session) {
      setShowBiometric(true);
      navigate("/mobile/home", { replace: true });
    }
  }

  async function handleBiometric() {
    const ok = await enroll();
    if (ok) addToast("Biometric enabled", "success");
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-royal-900 via-royal-800 to-royal-700 px-5 pt-12 pb-8">
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl mb-3">
          <img src="/logo.jpg" alt="Trust CRM" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">Trust CRM</h1>
        <p className="text-xs text-royal-200 mt-1">Manage donations & expenses</p>
      </div>
      <form onSubmit={handleLogin} className="space-y-4">
        <input
          type="email" required placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder-royal-300/60 focus:ring-2 focus:ring-saffron-400/50 focus:border-saffron-400/50"
        />
        <PasswordInput required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder-royal-300/60 focus:ring-2 focus:ring-saffron-400/50 focus:border-saffron-400/50" />
        {error && <div className="rounded-2xl bg-rose-500/15 border border-rose-500/30 px-4 py-2.5"><p className="text-xs text-rose-200">{error}</p></div>}
        <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 text-white rounded-2xl py-3 text-sm font-bold shadow-lg disabled:opacity-50">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {showBiometric && available && !enabled && (
        <button onClick={handleBiometric} className="mt-4 w-full bg-white/10 border border-white/20 text-white rounded-2xl py-3 text-sm font-semibold">
          Enable Face ID / Fingerprint
        </button>
      )}
      <div className="text-center mt-6">
        <a href="/login" className="text-[11px] text-royal-200/80 underline">Use desktop view</a>
      </div>
    </div>
  );
}
