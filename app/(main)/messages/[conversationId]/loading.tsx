import { Skeleton } from "@/app/components/ui/skeleton"

export default function Loading() {
    return (
        <div className="max-w-2xl mx-auto">
            {/* Mirrors chat-window.tsx's column so the composer stays put. */}
            <div className="flex flex-col h-[calc(100dvh-6.5rem)]">
                <div className="flex items-center gap-3 pb-4 border-b mb-4">
                    <Skeleton className="size-9 rounded-none shrink-0" />
                    <Skeleton className="size-10 rounded-none shrink-0" />
                    <Skeleton className="h-5 w-40" />
                </div>
                <div className="flex-1 min-h-0 flex flex-col gap-3 pr-1">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                            <Skeleton className={`h-10 rounded-none ${i % 3 === 0 ? "w-56" : i % 3 === 1 ? "w-40" : "w-64"} max-w-[75%]`} />
                        </div>
                    ))}
                </div>
                <div className="flex gap-2 pt-4 border-t mt-4">
                    <Skeleton className="h-9 flex-1" />
                    <Skeleton className="size-9 shrink-0" />
                </div>
            </div>
        </div>
    )
}
