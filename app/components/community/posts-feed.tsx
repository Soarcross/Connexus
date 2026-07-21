"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Textarea } from "@/app/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/app/components/ui/dialog"
import { PageShell } from "@/app/components/layout/page-shell"
import { ProfileRailCard } from "@/app/components/layout/profile-rail-card"
import { ComposerCard } from "@/app/components/community/composer-card"
import { ExternalLink, Trash2, Clock, XCircle, RefreshCw, Check, MapPin, Calendar } from "lucide-react"
import { categoryChip } from "@/lib/category-colors"
import Link from "next/link"

type Post = {
    id: string
    title: string
    description: string
    category: string
    field: string | null
    organization: string | null
    location: string | null
    url: string | null
    deadline: string | null
    status: string
    rejection_reason: string | null
    created_at: string
    expires_at: string | null
    image_url: string | null
    user_id: string
    profiles: {
        id: string
        full_name: string | null
        avatar_url: string | null
        grad_year: number | null
    } | null
}

type Viewer = {
    fullName: string | null
    avatarUrl: string | null
    chapterName: string | null
    gradYear: number | null
}

type Props = {
    posts: Post[]
    myPosts: Post[]
    currentUserId: string
    chapterId: string | null
    viewer: Viewer
}

function getDaysLeft(expiresAt: string | null): number | null {
    if (!expiresAt) return null
    const diff = new Date(expiresAt).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

function getTimeAgo(createdAt: string): string {
    const diff = Date.now() - new Date(createdAt).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    const weeks = Math.floor(days / 7)
    if (weeks < 5) return `${weeks}w ago`
    return new Date(createdAt).toLocaleDateString()
}

function ExpandableDescription({ text }: { text: string }) {
    const [expanded, setExpanded] = useState(false)
    const isLong = text.length > 200

    return (
        <div>
            <p className="text-sm text-muted-foreground leading-relaxed">
                {isLong && !expanded ? text.slice(0, 200) + "…" : text}
            </p>
            {isLong && (
                <button
                    onClick={() => setExpanded(e => !e)}
                    className="text-xs font-medium text-primary mt-1 hover:underline"
                >
                    {expanded ? "See less" : "See more"}
                </button>
            )}
        </div>
    )
}

export function PostsFeed({ posts, myPosts, currentUserId, chapterId, viewer }: Props) {
    const router = useRouter()
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [expandedImage, setExpandedImage] = useState<string | null>(null)
    const [extendingPostId, setExtendingPostId] = useState<string | null>(null)
    const [extendReason, setExtendReason] = useState("")
    const [extendLoading, setExtendLoading] = useState(false)

    async function handleDelete(id: string, imageUrl: string | null) {
        if (!confirm("Delete this post?")) return
        setDeletingId(id)
        const supabase = getSupaBrowserClient()
        try {
            if (imageUrl) {
                const path = imageUrl.split("/post-images/")[1]
                if (path) await supabase.storage.from("post-images").remove([path])
            }
            const { error } = await supabase
                .from("community_posts")
                .delete()
                .eq("id", id)
            if (error) throw error
            router.refresh()
        } catch (err) {
            // Supabase error objects can carry message/details/hint/code;
            // only surface the full object to the console in development.
            if (process.env.NODE_ENV === "development") {
                console.error(err)
            } else {
                console.error("Failed to delete post.")
            }
        } finally {
            setDeletingId(null)
        }
    }

    async function handleSubmitExtension() {
        if (!extendReason.trim()) return
        setExtendLoading(true)
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase
                .from("extension_requests")
                .insert({
                    post_id: extendingPostId,
                    user_id: currentUserId,
                    reason: extendReason.trim(),
                    status: "Pending",
                } as any)
            if (error) throw error
            setExtendingPostId(null)
            setExtendReason("")
        } catch (err) {
            // Supabase error objects can carry message/details/hint/code;
            // only surface the full object to the console in development.
            if (process.env.NODE_ENV === "development") {
                console.error(err)
            } else {
                console.error("Failed to submit extension request.")
            }
        } finally {
            setExtendLoading(false)
        }
    }

    function submissionRow(post: Post) {
        const daysLeft = getDaysLeft(post.expires_at)
        const isRejected = post.status === "Rejected"
        const isApproved = post.status === "Approved"
        const isPending = post.status === "Pending"

        return (
            <div key={post.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{post.title}</p>
                    <div className="flex items-center shrink-0">
                        {isApproved && (
                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setExtendingPostId(post.id)}
                                className="size-7 text-muted-foreground hover:text-foreground"
                                title="Request 1-month extension"
                            >
                                <RefreshCw className="size-3.5" />
                            </Button>
                        )}
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDelete(post.id, post.image_url)}
                            disabled={deletingId === post.id}
                            className="size-7 text-destructive hover:text-destructive"
                            title="Delete post"
                        >
                            <Trash2 className="size-3.5" />
                        </Button>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    {isPending && (
                        <Badge variant="outline" className="text-xs gap-1 text-yellow-600 border-yellow-400">
                            <Clock className="size-3" />
                            Pending
                        </Badge>
                    )}
                    {isApproved && (
                        <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-500">
                            <Check className="size-3" />
                            Approved
                        </Badge>
                    )}
                    {isRejected && (
                        <Badge variant="outline" className="text-xs gap-1 text-destructive border-destructive/50">
                            <XCircle className="size-3" />
                            Rejected
                        </Badge>
                    )}
                    {isApproved && daysLeft !== null && (
                        <span className={`text-xs ${daysLeft <= 7 ? "text-orange-600" : "text-muted-foreground"}`}>
                            Expires {daysLeft > 0 ? `in ${daysLeft}d` : "today"}
                        </span>
                    )}
                </div>
                {isRejected && post.rejection_reason && (
                    <p className="text-xs text-destructive">Reason: {post.rejection_reason}</p>
                )}
            </div>
        )
    }

    const submissionsCard = myPosts.length > 0 && (
        <Card size="sm">
            <CardHeader>
                <CardTitle className="text-sm">Your Submissions</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border">
                {myPosts.map(submissionRow)}
            </CardContent>
        </Card>
    )

    return (
        <PageShell
            left={
                <ProfileRailCard
                    userId={currentUserId}
                    fullName={viewer.fullName}
                    avatarUrl={viewer.avatarUrl}
                    chapterName={viewer.chapterName}
                    gradYear={viewer.gradYear}
                />
            }
            right={
                submissionsCard || (
                    <Card size="sm">
                        <CardContent className="text-xs text-muted-foreground leading-relaxed">
                            Posts you share appear here with their review status. Approved posts stay
                            up for 30 days — you can request an extension before they expire.
                        </CardContent>
                    </Card>
                )
            }
            rightMobileInline
        >
            <div className="max-w-[560px] mx-auto w-full flex flex-col gap-4">

                {/* Image lightbox */}
                <Dialog open={!!expandedImage} onOpenChange={(open) => !open && setExpandedImage(null)}>
                    <DialogContent className="max-w-3xl p-2 sm:p-2">
                        <DialogTitle className="sr-only">Post image</DialogTitle>
                        {expandedImage && (
                            <img
                                src={expandedImage}
                                alt="Full size"
                                className="w-full max-h-[80vh] rounded-md object-contain"
                            />
                        )}
                    </DialogContent>
                </Dialog>

                {/* Extension request */}
                <Dialog
                    open={!!extendingPostId}
                    onOpenChange={(open) => {
                        if (!open) {
                            setExtendingPostId(null)
                            setExtendReason("")
                        }
                    }}
                >
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Request Extension</DialogTitle>
                            <DialogDescription>
                                Explain to the admins why this post should be extended for another month.
                            </DialogDescription>
                        </DialogHeader>
                        <Textarea
                            placeholder="e.g. The deadline for this opportunity was extended and students still need more time to apply..."
                            value={extendReason}
                            onChange={(e) => setExtendReason(e.target.value)}
                            rows={4}
                        />
                        <div className="flex gap-2">
                            <Button
                                className="flex-1"
                                disabled={!extendReason.trim() || extendLoading}
                                onClick={handleSubmitExtension}
                            >
                                {extendLoading ? "Submitting..." : "Submit Request"}
                            </Button>
                            <Button variant="outline" onClick={() => { setExtendingPostId(null); setExtendReason("") }}>
                                Cancel
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Composer */}
                {chapterId ? (
                    <ComposerCard
                        userId={currentUserId}
                        chapterId={chapterId}
                        avatarUrl={viewer.avatarUrl}
                        fullName={viewer.fullName}
                    />
                ) : (
                    <Card size="sm">
                        <CardContent className="text-sm text-muted-foreground">
                            <Link href={`/profile/${currentUserId}`} className="text-primary hover:underline">
                                Pick a chapter on your profile
                            </Link>{" "}
                            to post here.
                        </CardContent>
                    </Card>
                )}

                {/* Feed */}
                {posts.length === 0 ? (
                    <Card>
                        <CardContent className="py-16 text-center text-muted-foreground text-sm">
                            No community posts yet. Be the first to share an opportunity!
                        </CardContent>
                    </Card>
                ) : (
                    posts.map(post => {
                        const daysLeft = getDaysLeft(post.expires_at)
                        return (
                            <Card key={post.id} className="py-0 gap-0 overflow-hidden">
                                <div className="p-4 flex flex-col gap-3">

                                    {/* Poster row */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2.5">
                                            <Avatar
                                                className="size-10 cursor-pointer shrink-0"
                                                onClick={() => router.push(`/profile/${post.profiles?.id}`)}
                                            >
                                                <AvatarImage src={post.profiles?.avatar_url ?? ""} />
                                                <AvatarFallback className="text-sm bg-primary/10 text-primary font-semibold">
                                                    {post.profiles?.full_name?.[0] ?? "?"}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p
                                                    className="text-sm font-semibold leading-tight cursor-pointer hover:underline"
                                                    onClick={() => router.push(`/profile/${post.profiles?.id}`)}
                                                >
                                                    {post.profiles?.full_name ?? "Anonymous"}
                                                </p>
                                                <p className="text-xs text-muted-foreground">{getTimeAgo(post.created_at)}</p>
                                            </div>
                                        </div>
                                        {post.user_id === currentUserId && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => handleDelete(post.id, post.image_url)}
                                                disabled={deletingId === post.id}
                                                className="text-destructive hover:text-destructive shrink-0 size-7"
                                            >
                                                <Trash2 className="size-3.5" />
                                            </Button>
                                        )}
                                    </div>

                                    {/* Title + org/location */}
                                    <div className="flex flex-col gap-1">
                                        <p className="text-[15px] font-semibold leading-snug">{post.title}</p>
                                        {(post.organization || post.location) && (
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                                {post.organization && <span>{post.organization}</span>}
                                                {post.location && (
                                                    <span className="flex items-center gap-0.5">
                                                        <MapPin className="size-3" />
                                                        {post.location}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Chips */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryChip(post.category)}`}>
                                            {post.category}
                                        </span>
                                        {post.field && (
                                            <Badge variant="outline" className="text-xs">{post.field}</Badge>
                                        )}
                                        {daysLeft !== null && daysLeft <= 7 && (
                                            <Badge variant="outline" className="text-xs text-orange-600 border-orange-400">
                                                Expires in {daysLeft}d
                                            </Badge>
                                        )}
                                    </div>

                                    {/* Description */}
                                    <ExpandableDescription text={post.description} />
                                </div>

                                {/* Full-width image */}
                                {post.image_url && (
                                    <button
                                        type="button"
                                        className="block w-full cursor-pointer bg-muted"
                                        onClick={() => setExpandedImage(post.image_url!)}
                                    >
                                        <img
                                            src={post.image_url}
                                            alt={post.title}
                                            className="w-full max-h-[420px] object-cover hover:opacity-95 transition-opacity"
                                        />
                                    </button>
                                )}

                                {/* Footer */}
                                <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        {post.deadline && (
                                            <>
                                                <Calendar className="size-3.5" />
                                                <span>Due {new Date(post.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {post.user_id === currentUserId && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setExtendingPostId(post.id)}
                                                className="text-xs h-7 gap-1"
                                            >
                                                <RefreshCw className="size-3" />
                                                Extend 1mo
                                            </Button>
                                        )}
                                        {post.url && (
                                            <a href={post.url} target="_blank" rel="noopener noreferrer">
                                                <Button size="sm" className="text-xs h-7 gap-1">
                                                    Apply
                                                    <ExternalLink className="size-3" />
                                                </Button>
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        )
                    })
                )}
            </div>
        </PageShell>
    )
}
