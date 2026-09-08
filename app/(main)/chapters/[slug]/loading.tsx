import { Skeleton } from "@/app/components/ui/skeleton"
import { PersonCardGrid } from "@/app/components/loading/skeletons"

export default function Loading() {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
                <Skeleton className="size-14 rounded-none" />
                <div className="flex flex-col gap-2 min-w-0">
                    <Skeleton className="h-8 w-64 max-w-full" />
                    <Skeleton className="h-4 w-40" />
                </div>
            </div>
            <div className="flex gap-2">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-32" />
            </div>
            <PersonCardGrid count={6} />
        </div>
    )
}
