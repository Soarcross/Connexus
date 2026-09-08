"use client";

import { useCountUp } from "@/app/components/motion/useCountUp";

/**
 * Renders a number that tweens up from 0 on mount (single RAF, ~600ms).
 * Snaps straight to the value under prefers-reduced-motion. Thin wrapper
 * around useCountUp for the common "stat tile" case.
 */
export function CountUp({
  value,
  duration,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const shown = useCountUp(value, duration);
  return <span className={className}>{shown}</span>;
}
