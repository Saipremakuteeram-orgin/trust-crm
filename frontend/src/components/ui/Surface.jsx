import { motion, useReducedMotion } from "framer-motion";
import { EASE } from "./tokens";

/**
 * Surface - the single card template for the app. Every panel on a page uses
 * it so radius, border, shadow and padding stay consistent.
 */
export default function Surface({
  title,
  icon: Icon,
  action,
  children,
  className = "",
  bodyClassName = "",
  index = 0,
  padded = true,
}) {
  const reduce = useReducedMotion();

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, delay: reduce ? 0 : index * 0.05, ease: EASE }}
      className={`surface-raised texture-paper edge-highlight rounded-2xl transition-shadow duration-300 hover:shadow-e2 ${className}`}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-stone-200/70 px-5 py-3.5 dark:border-stone-800">
          <h2 className="flex items-center gap-2 text-[13px] font-bold tracking-tight text-stone-950 dark:text-white">
            {Icon && <Icon size={15} className="text-saffron-600 dark:text-saffron-400" strokeWidth={1.75} />}
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={`${padded ? "p-5" : ""} ${bodyClassName}`}>{children}</div>
    </motion.section>
  );
}
