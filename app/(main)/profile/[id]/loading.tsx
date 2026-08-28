import { Card, CardContent } from "@/app/components/ui/card"
import { Skeleton } from "@/app/components/ui/skeleton"

export default function Loading() {
    return (
        // Matches profile/[id]/page.tsx's wrapper exactly so the card does not
        // shift when the real profile arrives.
        <div className="max-w-2xl mx-auto sm:px-2 sm:py-6 flex flex-col gap-4">
            <Card>
                <CardContent className="pt-0">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5">
                        <Skeleton className="size-24 rounded-full shrink-0" />
                        <div className="flex flex-col gap-2 min-w-0 flex-1 pt-2">
                            <Skeleton className="h-8 w-48" />
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-4 w-full max-w-sm" />
                        </div>
                    </div>
                </CardContent>
            </Card>
            {Array.from({ length: 2 }).map((_, i) => (
                <Card key={i}>
                    <CardContent className="flex flex-col gap-3">
                        <Skeleton className="h-5 w-32" />
                        <div className="flex flex-wrap gap-2">
                            <Skeleton className="h-6 w-20 rounded-full" />
                            <Skeleton className="h-6 w-24 rounded-full" />
                            <Skeleton className="h-6 w-16 rounded-full" />
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
