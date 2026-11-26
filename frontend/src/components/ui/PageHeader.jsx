import { motion, useReducedMotion } from "framer-motion";
import { EASE } from "./tokens";

/**
 * PageHeader - one consistent header for every page: optional eyebrow,
 * title, subtitle and a right-aligned actions slot. Collapses to a stacked
 * layout under the sm breakpoint.
 */
export default function PageHeader({ eyebrow, title, subtitle, actions, children }) {
  const reduce = useReducedMotion();

  return (
    <motion.header
      initial={reduce ? false : { opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div className="min-w-0">
        {eyebrow && (
          <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-saffron-700 dark:text-saffron-400">
            <span className="h-1 w-6 rounded-full bg-gradient-to-r from-saffron-500 to-saffron-300" />
            {eyebrow}
          </span>
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50 text-balance">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-stone-500 dark:text-stone-400">
            {subtitle}
          </p>
        )}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </motion.header>
  );
}
