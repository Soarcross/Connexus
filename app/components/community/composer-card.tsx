"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Card, CardContent } from "@/app/components/ui/card"
import { CreatePostButton } from "@/app/components/community/create-post-button"

type Props = {
    userId: string
    chapterId: string
    avatarUrl: string | null
    fullName: string | null
}

// LinkedIn-style inline composer: an avatar next to a pill-shaped prompt
// that opens the existing create-post dialog.
export function ComposerCard({ userId, chapterId, avatarUrl, fullName }: Props) {
    return (
        <CreatePostButton
            userId={userId}
            chapterId={chapterId}
            trigger={
                <Card className="py-3 cursor-pointer transition-colors hover:bg-secondary">
                    <CardContent className="px-4 flex items-center gap-3">
                        <Avatar className="size-10 shrink-0">
                            <AvatarImage src={avatarUrl ?? ""} />
                            <AvatarFallback className="bg-secondary text-foreground font-semibold">
                                {fullName?.[0] ?? "?"}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 h-11 rounded-none border border-border bg-secondary hover:bg-muted transition-colors flex items-center px-4 text-sm font-medium text-muted-foreground">
                            Share an opportunity...
                        </div>
                    </CardContent>
                </Card>
            }
        />
    )
}
