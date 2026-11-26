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
          <span className="t-overline mb-2.5 inline-flex items-center gap-2 text-saffron-700 dark:text-saffron-400">
            <span className="h-1 w-6 rounded-full bg-gradient-to-r from-saffron-500 to-saffron-300" />
            {eyebrow}
          </span>
        )}
        <h1 className="t-h1 text-balance text-stone-950 dark:text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="t-body mt-2 max-w-[65ch] text-stone-600 dark:text-stone-300">
            {subtitle}
          </p>
        )}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </motion.header>
  );
}
