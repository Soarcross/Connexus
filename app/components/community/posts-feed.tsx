"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Textarea } from "@/app/components/ui/textarea"
import { Card, CardContent } from "@/app/components/ui/card"
import { ExternalLink, Trash2, Clock, XCircle, RefreshCw, Check, MapPin, Calendar } from "lucide-react"

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

type Props = {
    posts: Post[]
    myPosts: Post[]
    currentUserId: string
}

const CATEGORY_COLORS: Record<string, string> = {
    Clubs: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
    Events: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
    Internships: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    Jobs: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    Research: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    Scholarships: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    Competitions: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    Volunteering: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
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

export function PostsFeed({ posts, myPosts, currentUserId }: Props) {
    const router = useRouter()
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [extendingId, setExtendingId] = useState<string | null>(null)
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
            console.error(err)
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
            console.error(err)
        } finally {
            setExtendLoading(false)
        }
    }

    return (
        <div className="flex flex-col gap-8">

            {/* Lightbox */}
            {expandedImage && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setExpandedImage(null)}
                >
                    <img
                        src={expandedImage}
                        alt="Full size"
                        className="max-w-full max-h-full rounded-lg object-contain"
                    />
                </div>
            )}

            {/* Extension Request Modal */}
            {extendingPostId && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                    <div className="bg-background border rounded-xl shadow-xl w-full max-w-md flex flex-col gap-4 p-6">
                        <div className="flex flex-col gap-1">
                            <p className="font-semibold">Request Extension</p>
                            <p className="text-sm text-muted-foreground">
                                Explain to the admins why this post should be extended for another month.
                            </p>
                        </div>
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
                    </div>
                </div>
            )}

            {/* User's own posts */}
            {myPosts.length > 0 && (
                <div className="flex flex-col gap-3">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Your Submissions
                    </h2>
                    {myPosts.map(post => {
                        const daysLeft = getDaysLeft(post.expires_at)
                        const isRejected = post.status === "Rejected"
                        const isApproved = post.status === "Approved"
                        const isPending = post.status === "Pending"

                        return (
                            <Card
                                key={post.id}
                                className={`border-dashed ${
                                    isRejected
                                        ? "border-destructive/50"
                                        : isApproved
                                        ? "border-green-500/40"
                                        : "border-primary/30"
                                }`}
                            >
                                <CardContent className="py-4 flex items-start justify-between gap-4">
                                    <div className="flex flex-col gap-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-sm font-semibold">{post.title}</p>
                                            {isPending && (
                                                <Badge variant="outline" className="text-xs gap-1 text-yellow-600 border-yellow-400">
                                                    <Clock className="size-3" />
                                                    Pending Review
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
                                            {isApproved && daysLeft !== null && daysLeft <= 7 && (
                                                <Badge variant="outline" className="text-xs gap-1 text-orange-600 border-orange-400">
                                                    <Clock className="size-3" />
                                                    Expires in {daysLeft}d
                                                </Badge>
                                            )}
                                        </div>
                                        {isRejected && post.rejection_reason && (
                                            <p className="text-xs text-destructive">Reason: {post.rejection_reason}</p>
                                        )}
                                        {isApproved && daysLeft !== null && (
                                            <p className="text-xs text-muted-foreground">
                                                Expires {daysLeft > 0 ? `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "today"}
                                            </p>
                                        )}
                                        <p className="text-xs text-muted-foreground line-clamp-1">{post.description}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {isApproved && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setExtendingPostId(post.id)}
                                                disabled={extendingId === post.id}
                                                className="text-xs h-7 gap-1"
                                            >
                                                <RefreshCw className="size-3" />
                                                {extendingId === post.id ? "Extending..." : "Extend 1mo"}
                                            </Button>
                                        )}
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => handleDelete(post.id, post.image_url)}
                                            disabled={deletingId === post.id}
                                            className="text-destructive hover:text-destructive"
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}

            {/* Approved posts feed */}
            <div className="flex flex-col gap-4">
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
                            <Card key={post.id} className="hover:border-primary/50 transition-colors overflow-hidden">
                                <CardContent className="p-0">

                                    {/* Two-column layout: text left, image right */}
                                    <div className="flex">

                                        {/* Left: all text content */}
                                        <div className="flex flex-col justify-between flex-1 min-w-0 p-6 gap-4">

                                            {/* Poster row */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <Avatar
                                                        className="size-8 cursor-pointer shrink-0"
                                                        onClick={() => router.push(`/profile/${post.profiles?.id}`)}
                                                    >
                                                        <AvatarImage src={post.profiles?.avatar_url ?? ""} />
                                                        <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                                                            {post.profiles?.full_name?.[0] ?? "?"}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <p
                                                            className="text-xs font-semibold leading-tight cursor-pointer hover:underline"
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

                                            {/* Title */}
                                            <div className="flex flex-col gap-1">
                                                <p className="text-sm font-semibold leading-snug">{post.title}</p>
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

                                            {/* Badges */}
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[post.category] ?? ""}`}>
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

                                            {/* Footer: deadline + actions */}
                                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
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
                                                            disabled={extendingId === post.id}
                                                            className="text-xs h-7 gap-1"
                                                        >
                                                            <RefreshCw className="size-3" />
                                                            {extendingId === post.id ? "Extending..." : "Extend 1mo"}
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
                                        </div>

                                        {/* Right: image panel — 35% width, full height, no cropping */}
                                        {post.image_url && (
                                            <div
                                                className="shrink-0 border-l border-border cursor-pointer bg-muted overflow-hidden self-stretch flex items-center justify-center"
                                                style={{ width: "35%" }}
                                                onClick={() => setExpandedImage(post.image_url!)}
                                            >
                                                <img
                                                    src={post.image_url}
                                                    alt={post.title}
                                                    className="w-full h-full object-contain hover:opacity-90 transition-opacity"
                                                />
                                            </div>
                                        )}
                                    </div>

                                </CardContent>
                            </Card>
                        )
                    })
                )}
            </div>
        </div>
    )
}