import { Card, CardContent } from "@/app/components/ui/card"
import { Skeleton } from "@/app/components/ui/skeleton"
import { CardSkeleton, PersonCardSkeleton } from "@/app/components/loading/skeletons"

export default function Loading() {
    return (
        <div className="flex flex-col gap-8">
            {/* Welcome banner — the greeting depends on the profile, so it pulses. */}
            <Card className="bg-primary/5 border-primary/15">
                <CardContent className="flex flex-col gap-2">
                    <Skeleton className="h-7 w-56" />
                    <Skeleton className="h-4 w-80 max-w-full" />
                </CardContent>
            </Card>

            <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold tracking-tight">Opportunities of the Month</h2>
                    <Skeleton className="h-8 w-20" />
                </div>
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <Skeleton className="size-7 rounded-md" />
                        <Skeleton className="h-5 w-24" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {Array.from({ length: 2 }).map((_, i) => (
                            <CardSkeleton key={i} size="sm" lines={2} />
                        ))}
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold tracking-tight">Suggested Connections</h2>
                    <Skeleton className="h-8 w-20" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <PersonCardSkeleton key={i} />
                    ))}
                </div>
            </section>
        </div>
    )
}
