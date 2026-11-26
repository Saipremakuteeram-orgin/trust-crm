import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Mail, Lock, ArrowRight, ShieldCheck, Wallet, Users } from "lucide-react";
import { checkSupabaseConnection, supabase } from "../lib/supabase";
import { formatAuthError, isNetworkAuthError } from "../lib/authMessages";
import PasswordInput from "../components/PasswordInput";
import Button from "../components/ui/Button";
import { EASE } from "../components/ui/tokens";

const highlights = [
  { icon: Wallet, label: "Cash and digital books in one place" },
  { icon: Users, label: "Donors, trustees and volunteers linked" },
  { icon: ShieldCheck, label: "Every entry attributable and auditable" },
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        const health = isNetworkAuthError(signInError)
          ? await checkSupabaseConnection()
          : null;
        setError(formatAuthError(signInError, health));
        return;
      }
      if (data?.session) {
        navigate("/dashboard", { replace: true });
      }
    } catch (signInError) {
      const health = await checkSupabaseConnection();
      setError(formatAuthError(signInError, health));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative grid min-h-[100dvh] bg-stone-50 lg:grid-cols-[1.05fr_1fr] dark:bg-stone-950">
      <div className="grain-overlay" aria-hidden="true" />
      {/* Brand panel */}
      <aside className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-800 px-6 py-10 sm:px-10 lg:px-14 lg:py-12">
        <div aria-hidden="true" className="absolute inset-0 bg-mesh-pattern opacity-40" />
        <motion.div
          aria-hidden="true"
          animate={reduce ? undefined : { scale: [1, 1.08, 1], opacity: [0.35, 0.5, 0.35] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -right-24 top-10 h-72 w-72 rounded-full bg-saffron-400/25 blur-3xl"
        />
        <motion.div
          aria-hidden="true"
          animate={reduce ? undefined : { scale: [1, 1.12, 1], opacity: [0.25, 0.4, 0.25] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute -bottom-28 -left-16 h-80 w-80 rounded-full bg-indigo-400/25 blur-3xl"
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 overflow-hidden rounded-xl border border-white/20 shadow-lg">
              <img src="/logo.jpg?v=2" alt="Sri Sai Dharma Samrakshana Prema Kuteeram" className="h-full w-full object-cover" />
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-200/80">
              Trust CRM
            </div>
          </div>

          <h2 className="t-display mt-10 max-w-md text-balance text-white">
            {["The", "trust\u2019s", "books,", "kept", "in", "order."].map((word, index) => (
              <motion.span
                key={word}
                initial={reduce ? false : { opacity: 0, y: "0.5em", filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.55, delay: 0.12 + index * 0.07, ease: EASE }}
                className="mr-[0.28em] inline-block"
              >
                {word}
              </motion.span>
            ))}
          </h2>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: EASE }}
            className="mt-4 max-w-sm text-sm leading-relaxed text-indigo-200/85"
          >
            Donations, expenses, receipts and reports for Sri Sai Dharma Samrakshana Prema Kuteeram.
          </motion.p>
        </div>

        <ul className="relative mt-10 space-y-3">
          {highlights.map(({ icon: Icon, label }, index) => (
            <motion.li
              key={label}
              initial={reduce ? false : { opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.15 + index * 0.08, ease: EASE }}
              className="flex items-center gap-3 text-sm text-indigo-100/85"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-saffron-300">
                <Icon size={15} strokeWidth={1.75} />
              </span>
              {label}
            </motion.li>
          ))}
        </ul>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center px-5 py-12 sm:px-10">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 lg:hidden">
            <div className="h-12 w-12 overflow-hidden rounded-xl border border-stone-200 shadow-sm dark:border-stone-700">
              <img src="/logo.jpg?v=2" alt="Trust CRM" className="h-full w-full object-cover" />
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">Sign in</h1>
          <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
            Use the email address your trust administrator created for you.
          </p>

          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-[13px] font-medium text-stone-700 dark:text-stone-300">
                Email address
              </label>
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@trust.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 placeholder-stone-400 transition-colors focus:border-saffron-500 focus:outline-none focus:ring-2 focus:ring-saffron-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder-stone-500 dark:focus:ring-saffron-500/25"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-[13px] font-medium text-stone-700 dark:text-stone-300">
                Password
              </label>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <PasswordInput
                  id="password"
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-10 text-sm text-stone-900 placeholder-stone-400 transition-colors focus:border-saffron-500 focus:outline-none focus:ring-2 focus:ring-saffron-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder-stone-500 dark:focus:ring-saffron-500/25"
                />
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 dark:border-rose-500/30 dark:bg-rose-500/10"
              >
                <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
              </motion.div>
            )}

            <Button
              type="submit"
              disabled={loading}
              loading={loading}
              loadingLabel="Signing in"
              iconRight={ArrowRight}
              className="h-11 w-full"
            >
              Sign in
            </Button>
          </form>

          <p className="mt-8 text-xs leading-relaxed text-stone-400 dark:text-stone-500">
            Access is restricted to authorised trust staff. Contact the administrator if your account is locked.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
