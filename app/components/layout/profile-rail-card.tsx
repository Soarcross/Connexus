import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Card } from "@/app/components/ui/card"
import { Separator } from "@/app/components/ui/separator"
import { FileText, MessageCircle } from "lucide-react"

type Props = {
    userId: string
    fullName: string | null
    avatarUrl: string | null
    chapterName?: string | null
    gradYear?: number | null
}

// LinkedIn-style identity card for the left rail: violet cover strip,
// overlapping avatar, identity lines, quick links.
export function ProfileRailCard({ userId, fullName, avatarUrl, chapterName, gradYear }: Props) {
    return (
        <Card className="py-0 gap-0">
            <div className="h-14 bg-primary/80" />
            <div className="px-4 pb-4 flex flex-col items-center text-center">
                <Link href={`/profile/${userId}`} className="-mt-8">
                    <Avatar className="size-16 ring-4 ring-card">
                        <AvatarImage src={avatarUrl ?? ""} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                            {fullName?.[0] ?? "?"}
                        </AvatarFallback>
                    </Avatar>
                </Link>
                <Link href={`/profile/${userId}`} className="mt-2 font-semibold text-sm hover:underline">
                    {fullName ?? "Your profile"}
                </Link>
                {(chapterName || gradYear) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {[chapterName, gradYear ? `Class of ${gradYear}` : null].filter(Boolean).join(" · ")}
                    </p>
                )}
                <Link
                    href={`/profile/${userId}`}
                    className="mt-2 text-xs font-medium text-primary hover:underline"
                >
                    View profile
                </Link>
            </div>
            <Separator />
            <nav className="p-2 flex flex-col">
                <Link
                    href="/community"
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                    <FileText className="size-3.5" />
                    My submissions
                </Link>
                <Link
                    href="/messages"
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                    <MessageCircle className="size-3.5" />
                    Messages
                </Link>
            </nav>
        </Card>
    )
}
