"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Textarea } from "@/app/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card"
import { ExternalLink, Trash2, Clock, XCircle, RefreshCw, Check } from "lucide-react"

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

export function PostsFeed({ posts, myPosts, currentUserId }: Props) {
    const router = useRouter()
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [extendingId, setExtendingId] = useState<string | null>(null)
    const [expandedImage, setExpandedImage] = useState<string | null>(null)

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

    const [extendingPostId, setExtendingPostId] = useState<string | null>(null)
    const [extendReason, setExtendReason] = useState("")
    const [extendLoading, setExtendLoading] = useState(false)

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

            {/* User's own posts — all statuses */}
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
                                            <p className="text-xs text-destructive">
                                                Reason: {post.rejection_reason}
                                            </p>
                                        )}
                                        {isApproved && daysLeft !== null && (
                                            <p className="text-xs text-muted-foreground">
                                                Expires {daysLeft > 0 ? `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "today"}
                                            </p>
                                        )}

                                        <p className="text-xs text-muted-foreground line-clamp-1">
                                            {post.description}
                                        </p>
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
                                {post.image_url && (
                                    <div
                                        className="w-full max-h-72 overflow-hidden cursor-pointer bg-muted"
                                        onClick={() => setExpandedImage(post.image_url!)}
                                    >
                                        <img
                                            src={post.image_url}
                                            alt={post.title}
                                            className="w-full object-cover hover:opacity-95 transition-opacity"
                                        />
                                    </div>
                                )}

                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex flex-col gap-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <CardTitle className="text-sm font-semibold leading-snug">
                                                    {post.title}
                                                </CardTitle>
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
                                            {post.organization && (
                                                <CardDescription className="text-xs">
                                                    {post.organization}
                                                    {post.location ? ` · ${post.location}` : ""}
                                                </CardDescription>
                                            )}
                                        </div>
                                        {post.user_id === currentUserId && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => handleDelete(post.id, post.image_url)}
                                                disabled={deletingId === post.id}
                                                className="text-destructive hover:text-destructive shrink-0"
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>

                                <CardContent className="flex flex-col gap-3">
                                    <p className="text-xs text-muted-foreground line-clamp-3">
                                        {post.description}
                                    </p>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <Avatar className="size-6">
                                                <AvatarImage src={post.profiles?.avatar_url ?? ""} />
                                                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                                    {post.profiles?.full_name?.[0] ?? "?"}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col">
                                                <p
                                                    className="text-xs font-medium cursor-pointer hover:underline"
                                                    onClick={() => router.push(`/profile/${post.profiles?.id}`)}
                                                >
                                                    {post.profiles?.full_name ?? "Anonymous"}
                                                </p>
                                                {post.deadline && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Due {new Date(post.deadline).toLocaleDateString()}
                                                    </p>
                                                )}
                                            </div>
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
                                                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1">
                                                        Apply
                                                        <ExternalLink className="size-3" />
                                                    </Button>
                                                </a>
                                            )}
                                        </div>
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