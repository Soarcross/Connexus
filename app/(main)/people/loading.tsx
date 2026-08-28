import { PageHeading, FilterBarSkeleton, PersonCardGrid } from "@/app/components/loading/skeletons"
import { PageShell } from "@/app/components/layout/page-shell"
import { Card, CardContent } from "@/app/components/ui/card"
import { Skeleton } from "@/app/components/ui/skeleton"

export default function Loading() {
    return (
        <div className="flex flex-col gap-6">
            <PageHeading
                title="People"
                description="Find and connect with students and alumni from your chapter."
            />
            <PageShell
                left={
                    <Card>
                        <CardContent className="flex flex-col gap-4">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-9 w-full" />
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-9 w-full" />
                        </CardContent>
                    </Card>
                }
            >
                <div className="flex flex-col gap-4">
                    <FilterBarSkeleton />
                    <Skeleton className="h-4 w-28" />
                    <PersonCardGrid count={9} />
                </div>
            </PageShell>
        </div>
    )
}
