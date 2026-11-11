import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "../lib/supabase";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import { Shield, QrCode, Trash2, CheckCircle } from "lucide-react";

export default function Security() {
  const { profile } = useAuth();
  const [factors, setFactors] = useState([]);
  const [enrolling, setEnrolling] = useState(false);
  const [qr, setQr] = useState(null);
  const [factorId, setFactorId] = useState(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(data?.totp || []);
  }
  useEffect(load, []);

  async function enroll() {
    setEnrolling(true);
    setMessage("");
    // A previously abandoned enrollment leaves an unverified factor behind and
    // makes every new enroll call fail, so clear those first.
    const stale = factors.filter((f) => f.status !== "verified");
    for (const factor of stale) {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Trust CRM" });
    if (error) { setMessage(error.message); setEnrolling(false); return; }
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    await load();
    setEnrolling(false);
  }

  async function cancelEnroll() {
    if (factorId) await supabase.auth.mfa.unenroll({ factorId });
    setQr(null);
    setFactorId(null);
    setCode("");
    setMessage("");
    await load();
  }

  async function verify() {
    if (!factorId) return;
    setVerifying(true);
    setMessage("");
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) { setMessage(challengeError.message); setVerifying(false); return; }
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (error) { setMessage(error.message); setVerifying(false); return; }
    setMessage("MFA enabled successfully");
    setQr(null);
    setFactorId(null);
    setCode("");
    await load();
    setVerifying(false);
  }

  async function unenroll(id) {
    if (!confirm("Disable MFA?")) return;
    await supabase.auth.mfa.unenroll({ factorId: id });
    await load();
  }

  return (
    <AppLayout>
      <h1 className="text-3xl font-bold text-stone-900 tracking-tight mb-6">Security</h1>
      <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6 max-w-xl">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="text-saffron-600" />
          <div>
            <div className="font-semibold text-stone-800">Two-Factor Authentication (TOTP)</div>
            <div className="text-xs text-stone-500">Add an authenticator app for extra security.</div>
          </div>
        </div>

        {factors.length > 0 && (
          <div className="mb-4">
            <div className="text-sm font-medium text-stone-700 mb-2">Enrolled factors</div>
            {factors.map((f) => (
              <div key={f.id} className="flex items-center justify-between border rounded-xl px-3 py-2 mb-2">
                <span className="text-sm">{f.friendly_name || "Authenticator"} {f.status === "verified" && <CheckCircle size={12} className="inline text-emerald-600" />}</span>
                <button onClick={() => unenroll(f.id)} className="text-rose-500"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}

        {!qr && !factors.some((f) => f.status === "verified") && (
          <button onClick={enroll} disabled={enrolling} className="bg-saffron-500 text-white rounded-xl px-4 py-2 text-sm font-semibold">
            {enrolling ? "Enrolling..." : "Enable MFA"}
          </button>
        )}

        {qr && (
          <div className="mt-4">
            <div className="text-sm text-stone-600 mb-2">Scan this QR code with your authenticator app:</div>
            <img src={qr} alt="MFA QR" className="w-48 h-48 border rounded-xl" />
            <div className="mt-3">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter 6-digit code" className="border rounded-xl px-3 py-2 text-sm w-full mb-2" />
              <button onClick={verify} disabled={verifying || code.trim().length !== 6} className="bg-saffron-500 text-white rounded-xl px-4 py-2 text-sm font-semibold w-full disabled:opacity-50">
                {verifying ? "Verifying..." : "Verify & Enable"}
              </button>
              <button onClick={cancelEnroll} className="mt-2 text-xs text-stone-500 hover:text-stone-700 w-full">Cancel</button>
            </div>
          </div>
        )}

        {message && <div className="mt-3 text-sm text-stone-600">{message}</div>}
      </div>
    </AppLayout>
  );
}
