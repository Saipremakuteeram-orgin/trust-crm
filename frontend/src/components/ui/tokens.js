// Shared motion tokens and variants for the UI templates.
export const EASE = [0.16, 1, 0.3, 1];

export const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

export const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

export const pressable = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.975 },
  transition: { type: "spring", stiffness: 420, damping: 28 },
};
