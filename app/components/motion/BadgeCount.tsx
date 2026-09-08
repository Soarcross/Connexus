"use client";

/**
 * One-shot pop animation whenever `count` changes — keyed on the value
 * itself, which forces React to remount the span and re-trigger the
 * animation. Use for unread counts, cart totals, notification badges.
 */
export function BadgeCount({ count }: { count: number }) {
  return (
    <span
      key={count}
      className="badge-pop"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        fontFamily: "var(--font-sans)",
        fontSize: 10,
        fontWeight: 500,
        color: "var(--accent-foreground)",
        background: "var(--accent)",
      }}
    >
      {count}
    </span>
  );
}
