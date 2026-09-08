import { Card, CardContent } from "@/app/components/ui/card"
import { Skeleton } from "@/app/components/ui/skeleton"

/**
 * Shared skeleton pieces for the route-level `loading.tsx` files.
 *
 * Two rules these follow, because a loading state that ignores them makes
 * navigation feel worse rather than better:
 *
 *  1. **Static chrome is rendered for real.** Page headings and their
 *     descriptions do not depend on any query, so they are printed as-is rather
 *     than skeletoned. Only the data-dependent regions pulse. The heading
 *     therefore does not move or re-render when the real page arrives.
 *  2. **The skeleton occupies the real layout.** Same wrappers, same gaps, same
 *     card sizes and counts as the loaded page, so content does not jump when it
 *     swaps in.
 */

export function PageHeading({ title, description }: { title: string; description: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
    )
}

/** A card whose body is a few pulsing lines — the generic list item. */
export function CardSkeleton({ lines = 2, size }: { lines?: number; size?: "sm" }) {
    return (
        <Card size={size}>
            <CardContent className="flex flex-col gap-3">
                <Skeleton className="h-4 w-2/3" />
                {Array.from({ length: lines }).map((_, i) => (
                    <Skeleton key={i} className={i === lines - 1 ? "h-3.5 w-1/2" : "h-3.5 w-full"} />
                ))}
            </CardContent>
        </Card>
    )
}

/** Matches the avatar-over-name-over-tags person card used on People and Home. */
export function PersonCardSkeleton() {
    return (
        <Card>
            <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
                <Skeleton className="size-14 rounded-none" />
                <div className="flex flex-col gap-1.5 items-center w-full">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                </div>
                <div className="flex flex-wrap gap-1 justify-center">
                    <Skeleton className="h-5 w-16 rounded-none" />
                    <Skeleton className="h-5 w-12 rounded-none" />
                </div>
            </CardContent>
        </Card>
    )
}

export function PersonCardGrid({ count = 9 }: { count?: number }) {
    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: count }).map((_, i) => (
                <PersonCardSkeleton key={i} />
            ))}
        </div>
    )
}

/** The search input + filter button row that sits above People/Opportunities. */
export function FilterBarSkeleton() {
    return (
        <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 flex-1 min-w-[12rem]" />
            <Skeleton className="h-9 w-24 shrink-0" />
        </div>
    )
}

/** One row of the conversation list: avatar, name, preview. */
export function ConversationRowSkeleton() {
    return (
        <div className="px-6 py-4 flex items-center gap-4">
            <Skeleton className="size-10 rounded-none shrink-0" />
            <div className="flex flex-col gap-2 min-w-0 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48 max-w-full" />
            </div>
        </div>
    )
}
