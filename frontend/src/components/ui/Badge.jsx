const tones = {
  neutral:
    "border-stone-200 bg-stone-100 text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300",
  brand:
    "border-saffron-200 bg-saffron-50 text-saffron-700 dark:border-saffron-500/30 dark:bg-saffron-500/10 dark:text-saffron-300",
  positive:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  negative:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  info:
    "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300",
};

/**
 * Badge - semantic status chip. Tone carries meaning (positive, negative,
 * warning, info); never used as decoration.
 */
export default function Badge({ children, tone = "neutral", className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5 ${tones[tone] || tones.neutral} ${className}`}
    >
      {children}
    </span>
  );
}
