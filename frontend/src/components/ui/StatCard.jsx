import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { EASE } from "./tokens";
import { AnimatedNumber } from "./motion";

/**
 * StatCard - the dashboard metric template. One shape, one radius, one motion
 * spec for every number on the page. Accent is passed per metric (financial
 * semantics only), never invented per card.
 */
export default function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = "#f59e0b",
  index = 0,
  onClick,
  animateValue = false,
  format,
}) {
  const reduce = useReducedMotion();
  const interactive = Boolean(onClick);

  const Wrapper = interactive ? motion.button : motion.div;
  const wrapperProps = interactive
    ? { type: "button", onClick, whileTap: { scale: 0.985 } }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: reduce ? 0 : index * 0.06, ease: EASE }}
      className={`group relative w-full overflow-hidden rounded-2xl border border-stone-200/80 bg-white p-5 text-left
        shadow-[0_1px_2px_rgba(41,37,36,0.04)] transition-[transform,box-shadow,border-color] duration-300
        hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_18px_40px_-24px_rgba(41,37,36,0.35)]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron-400 focus-visible:ring-offset-2
        dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-16 h-32 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: `radial-gradient(60% 100% at 50% 100%, ${accent}1f, transparent 70%)` }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {label}
          </p>
          <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight text-stone-900 tabular-nums dark:text-stone-50">
            {animateValue && format ? (
              <AnimatedNumber value={value} format={format} />
            ) : (
              value
            )}
          </p>
          {sub && <p className="mt-2 truncate text-xs text-stone-400 dark:text-stone-500">{sub}</p>}
        </div>
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-105"
          style={{ background: `${accent}14`, color: accent }}
        >
          <Icon size={19} strokeWidth={1.75} />
        </span>
      </div>
      {interactive && (
        <span className="relative mt-4 inline-flex items-center gap-1 text-[11px] font-medium text-stone-400 transition-colors group-hover:text-saffron-700 dark:group-hover:text-saffron-400">
          View details
          <ArrowUpRight size={12} className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </span>
      )}
    </Wrapper>
  );
}
