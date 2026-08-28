import { PageHeading, CardSkeleton } from "@/app/components/loading/skeletons"

export default function Loading() {
    return (
        <div className="flex flex-col gap-6">
            <PageHeading
                title="Community"
                description="Opportunities shared by students and alumni in your chapter."
            />
            <div className="flex flex-col gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <CardSkeleton key={i} lines={3} />
                ))}
            </div>
        </div>
    )
}
