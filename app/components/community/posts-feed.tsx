"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card"
import { ExternalLink, Trash2, Clock, XCircle } from "lucide-react"

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
    Internships: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    Jobs: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    Research: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    Scholarships: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    Competitions: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    Volunteering: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
}

export function PostsFeed({ posts, myPosts, currentUserId }: Props) {
    const router = useRouter()
    const [deletingId, setDeletingId] = useState<string | null>(null)

    async function handleDelete(id: string) {
        if (!confirm("Delete this post?")) return
        setDeletingId(id)
        const supabase = getSupaBrowserClient()
        try {
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

    return (
        <div className="flex flex-col gap-8">

            {/* User's own pending/rejected posts */}
            {myPosts.length > 0 && (
                <div className="flex flex-col gap-3">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Your Submissions
                    </h2>
                    {myPosts.map(post => (
                        <Card key={post.id} className={`border-dashed ${post.status === "Rejected" ? "border-destructive/50" : "border-primary/30"}`}>
                            <CardContent className="py-4 flex items-start justify-between gap-4">
                                <div className="flex flex-col gap-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-semibold">{post.title}</p>
                                        {post.status === "Pending" && (
                                            <Badge variant="outline" className="text-xs gap-1 text-yellow-600 border-yellow-400">
                                                <Clock className="size-3" />
                                                Pending Review
                                            </Badge>
                                        )}
                                        {post.status === "Rejected" && (
                                            <Badge variant="outline" className="text-xs gap-1 text-destructive border-destructive/50">
                                                <XCircle className="size-3" />
                                                Rejected
                                            </Badge>
                                        )}
                                    </div>
                                    {post.status === "Rejected" && post.rejection_reason && (
                                        <p className="text-xs text-destructive">
                                            Reason: {post.rejection_reason}
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground line-clamp-1">
                                        {post.description}
                                    </p>
                                </div>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleDelete(post.id)}
                                    disabled={deletingId === post.id}
                                    className="text-destructive hover:text-destructive shrink-0"
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Approved posts feed */}
            <div className="flex flex-col gap-3">
                {posts.length === 0 ? (
                    <Card>
                        <CardContent className="py-16 text-center text-muted-foreground text-sm">
                            No community posts yet. Be the first to share an opportunity!
                        </CardContent>
                    </Card>
                ) : (
                    posts.map(post => (
                        <Card key={post.id} className="hover:border-primary/50 transition-colors">
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
                                            onClick={() => handleDelete(post.id)}
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
                                    {post.url && (
                                        <a href={post.url} target="_blank" rel="noopener noreferrer">
                                            <Button size="sm" variant="outline" className="text-xs h-7 gap-1">
                                                Apply
                                                <ExternalLink className="size-3" />
                                            </Button>
                                        </a>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    )
}