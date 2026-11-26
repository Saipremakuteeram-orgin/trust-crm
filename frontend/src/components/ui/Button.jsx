import { motion, useReducedMotion } from "framer-motion";

const base =
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55 dark:focus-visible:ring-offset-stone-950";

const variants = {
  // Ink primary keeps AA contrast on the warm palette; saffron stays the accent.
  primary:
    "bg-stone-900 text-white shadow-e2 hover:bg-stone-800 dark:bg-saffron-500 dark:text-stone-950 dark:hover:bg-saffron-400",
  brand:
    "bg-gradient-to-r from-saffron-400 to-saffron-500 text-stone-950 shadow-brand hover:from-saffron-300 hover:to-saffron-400",
  secondary:
    "border border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-stone-700",
  ghost:
    "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white",
  danger:
    "bg-rose-600 text-white hover:bg-rose-500 shadow-[0_14px_30px_-18px_rgba(225,29,72,0.9)]",
};

const sizes = {
  sm: "h-9 px-3 text-[13px]",
  md: "h-[42px] px-4 text-sm",
  icon: "h-[42px] w-[42px] px-0",
  iconSm: "h-9 w-9 px-0",
};

/**
 * Button - one control across the app. Variant controls intent only; the
 * press feedback is physical (translate + scale) and collapses under
 * reduced motion.
 */
export default function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  loadingLabel,
  children,
  className = "",
  ...props
}) {
  const reduce = useReducedMotion();

  return (
    <motion.button
      whileHover={reduce ? undefined : { y: -1 }}
      whileTap={reduce ? undefined : { scale: 0.975 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white dark:border-stone-950/30 dark:border-t-stone-950" />
          {loadingLabel || children}
        </>
      ) : (
        <>
          {Icon && <Icon size={16} strokeWidth={1.75} />}
          {children}
          {IconRight && <IconRight size={16} strokeWidth={1.75} />}
        </>
      )}
    </motion.button>
  );
}
