"use client";

import { ReactNode } from "react";

/**
 * Height reveal wrapper. Animates grid-template-rows 0fr -> 1fr — never
 * height, so it works with unknown/dynamic content and respects
 * prefers-reduced-motion for free (the transition-duration kill switch
 * in motion.css handles that).
 */
export function Collapse({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`collapse${open ? " open" : ""}`} data-state={open ? "open" : "closed"}>
      <div>{children}</div>
    </div>
  );
}
