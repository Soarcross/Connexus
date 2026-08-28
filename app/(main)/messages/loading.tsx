import { PageHeading, ConversationRowSkeleton } from "@/app/components/loading/skeletons"
import { Card } from "@/app/components/ui/card"

export default function Loading() {
    return (
        <div className="flex flex-col gap-6 max-w-2xl mx-auto">
            <PageHeading title="Messages" description="Your conversations with other members." />
            <Card className="py-0 overflow-hidden">
                {Array.from({ length: 3 }).map((_, i) => (
                    <ConversationRowSkeleton key={i} />
                ))}
            </Card>
        </div>
    )
}
