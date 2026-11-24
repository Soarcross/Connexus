import { Card, CardContent } from "@/app/components/ui/card"
import { Skeleton } from "@/app/components/ui/skeleton"

export default function Loading() {
    return (
        // Matches welcome/page.tsx's wrapper and the flow card's layout so
        // nothing shifts when the real step arrives.
        <div className="max-w-xl mx-auto sm:py-6">
            <Card className="border-2 border-border">
                <CardContent className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-1.5 w-full rounded-none" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-8 w-64 max-w-full" />
                        <Skeleton className="h-4 w-80 max-w-full" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-10 w-24 rounded-none" />
                        ))}
                    </div>
                    <Skeleton className="h-9 w-full rounded-none" />
                </CardContent>
            </Card>
        </div>
    )
}
