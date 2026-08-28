import Link from "next/link"
import { PageHeading, FilterBarSkeleton, CardSkeleton } from "@/app/components/loading/skeletons"

export default function Loading() {
    return (
        <div className="flex flex-col gap-6">
            <PageHeading
                title="Opportunities"
                description={
                    <>
                        Browse internships, jobs, research positions and more, open to every chapter.
                        {" "}Looking for your school&apos;s events?{" "}
                        <Link href="/chapters" className="text-primary hover:underline">Visit your chapter page</Link>.
                    </>
                }
            />
            <div className="flex flex-col gap-4">
                <FilterBarSkeleton />
                <div className="flex flex-col gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <CardSkeleton key={i} lines={3} />
                    ))}
                </div>
            </div>
        </div>
    )
}
