import { PageHeading, CardSkeleton } from "@/app/components/loading/skeletons"

export default function Loading() {
    return (
        <div className="flex flex-col gap-6">
            <PageHeading
                title="Chapters"
                description="Browse every Connexus chapter and see who's in each one."
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <CardSkeleton key={i} lines={2} />
                ))}
            </div>
        </div>
    )
}
