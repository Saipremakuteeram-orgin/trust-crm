import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { supabase } from "../lib/supabase";

// Blocks the app until a user who enrolled TOTP has actually completed the
// second factor. Without this, enrolling in /security had no effect because
// signInWithPassword returns an aal1 session that the router accepted.
export default function MfaGate({ children }) {
  const [state, setState] = useState("checking");
  const [factorId, setFactorId] = useState(null);
  const [challengeId, setChallengeId] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startChallenge(id) {
    const { data, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: id });
    if (challengeError) {
      setError(challengeError.message);
      return;
    }
    setChallengeId(data.id);
  }

  async function check() {
    const { data, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) {
      setState("ready");
      return;
    }
    if (data?.nextLevel !== "aal2" || data?.currentLevel === "aal2") {
      setState("ready");
      return;
    }

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = (factors?.totp || []).find((factor) => factor.status === "verified");
    if (!verified) {
      setState("ready");
      return;
    }

    setFactorId(verified.id);
    setState("required");
    await startChallenge(verified.id);
  }

  useEffect(() => { check(); }, []);

  async function verify(event) {
    event.preventDefault();
    if (!factorId || !challengeId) return;
    setBusy(true);
    setError("");
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code: code.trim(),
    });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    await supabase.auth.refreshSession();
    setState("ready");
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (state === "ready") return children;

  if (state === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <p className="text-sm text-stone-400">Checking security settings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="text-saffron-600" />
          <div>
            <h1 className="font-semibold text-stone-800">Two-factor verification</h1>
            <p className="text-xs text-stone-500">Enter the 6-digit code from your authenticator app.</p>
          </div>
        </div>

        <form onSubmit={verify} className="space-y-3">
          <input
            autoFocus
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="w-full rounded-xl border border-stone-200 px-3 py-2 text-center text-lg tracking-[0.3em] outline-none focus:border-saffron-400 focus:ring-2 focus:ring-saffron-100"
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button
            disabled={busy || code.length !== 6 || !challengeId}
            className="w-full rounded-xl bg-saffron-500 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Verifying..." : "Verify"}
          </button>
        </form>

        <button onClick={signOut} className="mt-4 w-full text-xs text-stone-500 hover:text-stone-700">
          Sign out
        </button>
      </div>
    </div>
  );
}
