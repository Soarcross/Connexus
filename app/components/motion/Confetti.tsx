"use client";

import { useEffect, useState, type CSSProperties } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The secondary palette from globals.css, so the burst follows light/dark.
const COLORS = [
  "var(--accent)",
  "var(--foreground)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

// Deterministic pseudo-random in [0, 1) — keeps render pure and the burst
// identical between renders, so no Math.random() in render.
function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/**
 * One-shot confetti burst, built on the motion system (CSS keyframes in
 * app/motion.css, no animation library). Place inside a `relative`
 * container; pieces burst from its centre and clean themselves up. Any
 * `overflow-hidden` ancestor (Card has one) clips the burst, so give that
 * ancestor `overflow-visible`.
 * Renders nothing under prefers-reduced-motion — pair it with a static
 * success state (e.g. `.stamp-in`) so nothing depends on the animation.
 */
export function Confetti({ pieces = 36 }: { pieces?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const show = requestAnimationFrame(() => setVisible(true));
    // Longest piece is ~1.5s including delay; unmount after.
    const hide = window.setTimeout(() => setVisible(false), 1800);
    return () => {
      cancelAnimationFrame(show);
      window.clearTimeout(hide);
    };
  }, []);

  if (!visible) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible">
      {Array.from({ length: pieces }).map((_, i) => {
        const angle = (i / pieces) * Math.PI * 2 + rand(i) * 0.6;
        // Capped so pieces stay within a phone-width card: transforms count
        // toward scrollable overflow, and a stray piece must not add a
        // horizontal scrollbar.
        const distance = 70 + rand(i + 100) * 80;
        const size = 6 + Math.round(rand(i + 200) * 6);
        const style = {
          width: size,
          height: i % 3 === 0 ? size * 2 : size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          background: COLORS[i % COLORS.length],
          "--dx": `${Math.round(Math.cos(angle) * distance)}px`,
          "--dy": `${Math.round(-Math.abs(Math.sin(angle)) * distance - 30)}px`,
          "--spin": `${Math.round((rand(i + 300) - 0.5) * 720)}deg`,
          "--confetti-duration": `${900 + Math.round(rand(i + 400) * 500)}ms`,
          animationDelay: `${Math.round(rand(i + 500) * 120)}ms`,
        } as CSSProperties;
        return <span key={i} className="confetti-piece" style={style} />;
      })}
    </div>
  );
}
