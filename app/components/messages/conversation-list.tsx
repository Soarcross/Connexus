"use client"

import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Card, CardContent } from "@/app/components/ui/card"
import { Badge } from "@/app/components/ui/badge"
import { MessageCircle } from "lucide-react"

type Conversation = {
    id: string
    last_message_at: string
    otherProfile: {
        id: string
        full_name: string | null
        avatar_url: string | null
    } | null
    lastMessage: {
        content: string
        created_at: string
        read: boolean
        sender_id: string
    } | null
    unreadCount: number
}

type Props = {
    conversations: Conversation[]
    currentUserId: string
}

export function ConversationList({ conversations, currentUserId }: Props) {
    const router = useRouter()

    if (conversations.length === 0) {
        return (
            <Card>
                <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
                    <MessageCircle className="size-10 text-muted-foreground/50" />
                    <p className="text-muted-foreground text-sm">
                        No conversations yet. Visit someone&apos;s profile to start a conversation!
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="py-0 gap-0 divide-y divide-border">
            {conversations.map((conv) => (
                <div
                    key={conv.id}
                    className={`cursor-pointer transition-colors hover:bg-secondary ${conv.unreadCount > 0 ? "bg-secondary" : ""}`}
                    onClick={() => router.push(`/messages/${conv.id}`)}
                >
                    <CardContent className="py-4 flex items-center gap-4">
                        <Avatar className="size-12 shrink-0">
                            <AvatarImage src={conv.otherProfile?.avatar_url ?? ""} />
                            <AvatarFallback className="bg-secondary text-foreground font-semibold">
                                {conv.otherProfile?.full_name?.[0] ?? "?"}
                            </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                                <p className={`text-sm font-semibold truncate ${conv.unreadCount > 0 ? "text-foreground" : ""}`}>
                                    {conv.otherProfile?.full_name ?? "Unknown"}
                                </p>
                                <span className="text-xs text-muted-foreground shrink-0">
                                    {conv.lastMessage
                                        ? new Date(conv.lastMessage.created_at).toLocaleDateString()
                                        : new Date(conv.last_message_at).toLocaleDateString()
                                    }
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                                <p className="text-xs text-muted-foreground truncate">
                                    {conv.lastMessage
                                        ? `${conv.lastMessage.sender_id === currentUserId ? "You: " : ""}${conv.lastMessage.content}`
                                        : "No messages yet"
                                    }
                                </p>
                                {conv.unreadCount > 0 && (
                                    <Badge className="shrink-0 size-5 rounded-none p-0 flex items-center justify-center text-[10px] bg-accent text-accent-foreground">
                                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </div>
            ))}
        </Card>
    )
}