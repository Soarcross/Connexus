import { cn } from "@/lib/utils"

type Props = {
    left?: React.ReactNode
    right?: React.ReactNode
    /** Render `right` in normal flow below `children` on mobile instead of
     *  hiding it there — for content with no separate mobile toggle (e.g. a
     *  status list), avoiding a second, always-mounted copy in the caller. */
    rightMobileInline?: boolean
    children: React.ReactNode
    className?: string
}

// LinkedIn-style rail grid: optional sticky left/right rails around a center
// column. Rails collapse below lg; center content always renders.
export function PageShell({ left, right, rightMobileInline, children, className }: Props) {
    const cols =
        left && right
            ? "lg:grid-cols-[225px_minmax(0,1fr)_300px]"
            : left
              ? "lg:grid-cols-[225px_minmax(0,1fr)]"
              : right
                ? "lg:grid-cols-[minmax(0,1fr)_300px]"
                : ""

    return (
        <div className={cn("grid grid-cols-1 items-start gap-6", cols, className)}>
            {left && <aside className="hidden lg:block lg:sticky lg:top-[81px]">{left}</aside>}
            <div className="min-w-0">{children}</div>
            {right && (
                <aside className={cn("lg:sticky lg:top-[81px]", !rightMobileInline && "hidden lg:block")}>
                    {right}
                </aside>
            )}
        </div>
    )
}
