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
      className={`surface-raised texture-paper edge-highlight group relative w-full overflow-hidden rounded-2xl p-5 text-left
        transition-[transform,box-shadow,border-color] duration-300
        hover:-translate-y-0.5 hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-saffron-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-950`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-16 h-32 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: `radial-gradient(60% 100% at 50% 100%, ${accent}1f, transparent 70%)` }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-overline truncate text-stone-600 dark:text-stone-300">
            {label}
          </p>
          <p className="t-money mt-2.5 text-[26px] font-bold leading-none text-stone-950 dark:text-white">
            {animateValue && format ? (
              <AnimatedNumber value={value} format={format} />
            ) : (
              value
            )}
          </p>
          {sub && <p className="t-caption mt-2 truncate">{sub}</p>}
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
