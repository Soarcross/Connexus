"use client";

import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Single requestAnimationFrame tween from 0 to `target`, ~600ms,
 * ease-out cubic. Runs once per target change. Snaps straight to the
 * target under prefers-reduced-motion.
 */
export function useCountUp(target: number, duration = 600) {
  const [value, setValue] = useState(0);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (prefersReducedMotion()) {
      frame.current = requestAnimationFrame(() => setValue(target));
      return () => {
        if (frame.current) cancelAnimationFrame(frame.current);
      };
    }

    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * ease(t)));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    }
    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, duration]);

  return value;
}
