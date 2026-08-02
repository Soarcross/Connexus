"use client"

import { Clock } from "lucide-react"
import { Badge } from "@/app/components/ui/badge"
import { EXPIRING_SOON_DAYS, getDaysLeft, getLifecycleState } from "@/lib/lifecycle"

/**
 * "Expires in Nd" badge for an active item nearing its expiry. Renders nothing
 * for items that are not expiring soon, or that are already archived (those get
 * an ArchiveBanner instead).
 */
export function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
    if (getLifecycleState(expiresAt) !== "active") return null

    const daysLeft = getDaysLeft(expiresAt)
    if (daysLeft === null || daysLeft > EXPIRING_SOON_DAYS) return null

    return (
        <Badge variant="outline" className="text-xs gap-1 text-orange-600 border-orange-400">
            <Clock className="size-3" />
            {daysLeft === 0 ? "Expires today" : `Expires in ${daysLeft}d`}
        </Badge>
    )
}
