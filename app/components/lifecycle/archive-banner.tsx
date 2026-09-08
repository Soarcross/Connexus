"use client"

import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/app/components/ui/button"
import {
    ARCHIVE_WINDOW_DAYS,
    EXTENSION_DAYS,
    getDaysUntilPurge,
    getPurgeDate,
} from "@/lib/lifecycle"

type Props = {
    expiresAt: string | null
    /** Shows the extend CTA. False once a request is already pending. */
    canExtend?: boolean
    /** Opens the extension request dialog. */
    onExtend?: () => void
    /** Set when the author already has a Pending request for this item. */
    extensionPending?: boolean
}

/**
 * Warning shown on an archived post or opportunity. Archived items are hidden
 * from the public feed and visible only to their author (and admins) during the
 * {@link ARCHIVE_WINDOW_DAYS}-day window before permanent deletion.
 */
export function ArchiveBanner({ expiresAt, canExtend = true, onExtend, extensionPending }: Props) {
    const daysLeft = getDaysUntilPurge(expiresAt)
    const purgeDate = getPurgeDate(expiresAt)
    if (daysLeft === null || purgeDate === null) return null

    const deadline = purgeDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    })

    return (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 animate-in fade-in-0 slide-in-from-top-1 duration-200 ease-out">
            <div className="flex items-start gap-2">
                <AlertTriangle className="size-4 shrink-0 text-destructive mt-0.5" />
                <div className="flex flex-col gap-0.5 text-xs">
                    <p className="font-semibold text-destructive">
                        Archived — only you can see this
                    </p>
                    <p className="text-muted-foreground">
                        It passed its deadline and is no longer public. It will be{" "}
                        <span className="font-medium text-destructive">permanently deleted</span>{" "}
                        {daysLeft === 0 ? "today" : `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}{" "}
                        (on {deadline}). Extend the deadline by up to {EXTENSION_DAYS} days to
                        restore it.
                    </p>
                </div>
            </div>
            {canExtend && onExtend && (
                <div className="flex justify-end">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={onExtend}
                        disabled={extensionPending}
                        className="text-xs h-7 gap-1"
                    >
                        <RefreshCw className="size-3" />
                        {extensionPending ? "Extension requested" : "Request extension"}
                    </Button>
                </div>
            )}
        </div>
    )
}
