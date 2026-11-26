import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion, animate } from "framer-motion";
import { EASE } from "./tokens";

/**
 * Reveal - enters once when scrolled into view (or immediately on first paint
 * for above-the-fold content). Collapses to a plain element with reduced motion.
 */
export function Reveal({ children, delay = 0, y = 16, className = "", once = true, amount = 0.2 }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { once, amount });
  const shown = reduce || inView;

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.55, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * PageTransition - cross-fades route content. Key it by pathname from the shell
 * so each navigation replays the entrance without touching page components.
 */
export function PageTransition({ children, routeKey }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={routeKey}
      initial={reduce ? false : { opacity: 0, y: 14, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * AnimatedNumber - counts a currency/value up on mount or when it changes.
 * One-shot animation only (never driven by continuous input), skipped entirely
 * under prefers-reduced-motion.
 */
export function AnimatedNumber({ value, format = (n) => String(Math.round(n)), duration = 0.9, className = "" }) {
  const reduce = useReducedMotion();
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(reduce ? target : 0);
  const previous = useRef(0);

  useEffect(() => {
    if (reduce) {
      setDisplay(target);
      return;
    }
    const controls = animate(previous.current, target, {
      duration,
      ease: EASE,
      onUpdate: (latest) => setDisplay(latest),
    });
    previous.current = target;
    return () => controls.stop();
  }, [target, duration, reduce]);

  return <span className={className}>{format(display)}</span>;
}
