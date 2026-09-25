"use client"

import { errorMessage } from "@/lib/error-message"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/app/components/ui/button"
import { Textarea } from "@/app/components/ui/textarea"
import { EXTENSION_DAYS, type LifecycleEntity } from "@/lib/lifecycle"

/** Which item the request targets. Exactly one column is set on the row. */
export type ExtensionTarget = {
    entity: LifecycleEntity
    id: string
}

type Props = {
    target: ExtensionTarget | null
    currentUserId: string
    onClose: () => void
}

/**
 * Modal for filing an `extension_requests` row against a post or opportunity.
 * Admins approve it from the dashboard, which bumps the item's `expires_at`.
 */
export function ExtensionRequestDialog({ target, currentUserId, onClose }: Props) {
    const router = useRouter()
    const [reason, setReason] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (!target) return null

    async function handleSubmit() {
        if (!target || !reason.trim()) return
        setLoading(true)
        setError(null)
        const supabase = getSupaBrowserClient()
        try {
            const { error: insertError } = await supabase
                .from("extension_requests")
                .insert({
                    post_id: target.entity === "post" ? target.id : null,
                    opportunity_id: target.entity === "opportunity" ? target.id : null,
                    user_id: currentUserId,
                    reason: reason.trim(),
                    status: "Pending",
                })
            if (insertError) throw insertError
            setReason("")
            onClose()
            router.refresh()
        } catch (err) {
            setError(errorMessage(err, "Could not submit your request."))
        } finally {
            setLoading(false)
        }
    }

    function handleCancel() {
        setReason("")
        setError(null)
        onClose()
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-background border rounded-xl shadow-xl w-full max-w-md flex flex-col gap-4 p-6">
                <div className="flex flex-col gap-1">
                    <p className="font-semibold">Request Extension</p>
                    <p className="text-sm text-muted-foreground">
                        Explain to the admins why this {target.entity === "post" ? "post" : "opportunity"}{" "}
                        should be extended for another {EXTENSION_DAYS} days.
                    </p>
                </div>
                <Textarea
                    placeholder="e.g. The deadline for this opportunity was extended and students still need more time to apply..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex gap-2">
                    <Button
                        className="flex-1"
                        disabled={!reason.trim() || loading}
                        onClick={handleSubmit}
                    >
                        {loading ? "Submitting..." : "Submit Request"}
                    </Button>
                    <Button variant="outline" onClick={handleCancel}>
                        Cancel
                    </Button>
                </div>
            </div>
        </div>
    )
}
