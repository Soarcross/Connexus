"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs"
import { Card, CardContent } from "@/app/components/ui/card"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Check, X, Plus, Pencil, Trash2, Star, StarOff, Camera, Loader2 } from "lucide-react"

type CommunityPost = {
    id: string
    title: string
    description: string
    category: string
    field: string | null
    qualification: string
    status: string
    rejection_reason: string | null
    created_at: string | null
    image_url: string | null
    profiles: { id: string; full_name: string | null; avatar_url: string | null } | null
}

type ExtensionRequest = {
    id: string
    post_id: string | null
    reason: string
    status: string | null
    rejection_reason: string | null
    created_at: string | null
    community_posts: { title: string } | null
    profiles: { full_name: string | null; avatar_url: string | null } | null
}

type Member = {
    id: string
    full_name: string | null
    avatar_url: string | null
    grad_year: number | null
    chapter_role: string
    is_admin: boolean
    created_at: string | null
}

type Opportunity = {
    id: string
    title: string
    description: string
    category: string
    field: string | null
    organization: string | null
    location: string | null
    url: string | null
    deadline: string | null
    is_featured: boolean
    created_at: string
}

type Props = {
    chapterId: string
    chapterName: string | null
    chapterLogoUrl: string | null
    communityPosts: CommunityPost[]
    extensionRequests: ExtensionRequest[]
    members: Member[]
    opportunities: Opportunity[]
    currentUserId: string
}

// Chapter admins also get the chapter-life categories (meetings, trips, …)
// shown on the /chapters page. Those stay out of the national opportunities
// and home lists on purpose — every category list in this codebase is
// hand-maintained (see CLAUDE.md).
const CATEGORIES = [
    "Announcements", "Meetings", "Events", "Trips", "Fundraisers", "Clubs",
    "Internships", "Jobs", "Research", "Scholarships", "Competitions", "Volunteering", "Programs",
]

const EMPTY_FORM = {
    title: "",
    description: "",
    category: "Internships",
    field: "",
    organization: "",
    location: "",
    url: "",
    deadline: "",
    is_featured: false,
}

const LOGO_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const LOGO_MAX_BYTES = 2 * 1024 * 1024

export function ChapterAdminDashboard({ chapterId, chapterName, chapterLogoUrl, communityPosts: initialCommunityPosts, extensionRequests: initialExtensionRequests, members: initialMembers, opportunities: initialOpportunities, currentUserId }: Props) {
    const router = useRouter()
    const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>(initialCommunityPosts)
    const [extensionRequests, setExtensionRequests] = useState<ExtensionRequest[]>(initialExtensionRequests)
    const [opportunities, setOpportunities] = useState<Opportunity[]>(initialOpportunities)
    const [members, setMembers] = useState<Member[]>(initialMembers)
    const [roleBusyId, setRoleBusyId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({})
    const [extensionRejectionReason, setExtensionRejectionReason] = useState<Record<string, string>>({})

    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [form, setForm] = useState(EMPTY_FORM)

    const [logoUrl, setLogoUrl] = useState<string | null>(chapterLogoUrl)
    const [logoBusy, setLogoBusy] = useState(false)
    // Tracks the blob: URL of the optimistic preview so it can be revoked once
    // the real public URL lands -- otherwise every upload leaks one.
    const previewUrlRef = useRef<string | null>(null)

    function showSuccess(msg: string) {
        setSuccess(msg)
        setTimeout(() => setSuccess(null), 3000)
    }

    // chapter_role is not writable from the browser client -- the column is
    // revoked from `authenticated` (002_security_hardening.sql), so this goes
    // through the service-role route, which re-checks that the caller admins
    // this member's chapter.
    async function handleSetMemberRole(member: Member, role: "member" | "chapter_admin") {
        if (role === "member" && !confirm(`Remove ${member.full_name ?? "this member"} as a chapter admin? They stay a member of the chapter.`)) return
        setRoleBusyId(member.id)
        setError(null)
        try {
            const res = await fetch("/api/chapter-admin/set-role", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: member.id, role }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error ?? "Failed to update role.")
            setMembers(prev => prev.map(m => m.id === member.id ? { ...m, chapter_role: role } : m))
            showSuccess(
                role === "chapter_admin"
                    ? `${member.full_name ?? "Member"} is now a chapter admin.`
                    : `${member.full_name ?? "Member"} is no longer a chapter admin.`
            )
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update role.")
        } finally {
            setRoleBusyId(null)
        }
    }

    function releasePreview() {
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current)
            previewUrlRef.current = null
        }
    }

    async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        // Always clear the input: without this, re-picking the same file after a
        // rejection never re-fires onChange.
        e.target.value = ""
        if (!file) return

        // Mirrors the checks in app/api/chapter-admin/logo/route.ts so an
        // obviously-bad file fails instantly instead of after an upload.
        if (!LOGO_MIME.includes(file.type)) {
            setError("Logo must be a PNG, JPG, WebP or GIF.")
            return
        }
        if (file.size > LOGO_MAX_BYTES) {
            setError("Logo must be under 2MB.")
            return
        }

        setError(null)
        setLogoBusy(true)
        releasePreview()
        previewUrlRef.current = URL.createObjectURL(file)
        setLogoUrl(previewUrlRef.current)

        try {
            const body = new FormData()
            body.append("file", file)
            const res = await fetch("/api/chapter-admin/logo", { method: "POST", body })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error ?? "Failed to upload the logo.")

            setLogoUrl(json.logoUrl)
            releasePreview()
            showSuccess("Chapter picture updated!")
            router.refresh()
        } catch (err) {
            setLogoUrl(chapterLogoUrl)
            releasePreview()
            setError(err instanceof Error ? err.message : "Failed to upload the logo.")
        } finally {
            setLogoBusy(false)
        }
    }

    async function handleRemoveLogo() {
        setError(null)
        setLogoBusy(true)
        try {
            const res = await fetch("/api/chapter-admin/logo", { method: "DELETE" })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error ?? "Failed to remove the logo.")

            releasePreview()
            setLogoUrl(null)
            showSuccess("Chapter picture removed.")
            router.refresh()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to remove the logo.")
        } finally {
            setLogoBusy(false)
        }
    }

    async function handleApprovePost(id: string) {
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase.from("community_posts").update({ status: "Approved" }).eq("id", id)
            if (error) throw error
            setCommunityPosts(prev => prev.map(p => p.id === id ? { ...p, status: "Approved" } : p))
            showSuccess("Post approved!")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to approve.")
        }
    }

    async function handleRejectPost(id: string) {
        const reason = rejectionReason[id]?.trim()
        if (!reason) {
            setError("Please provide a rejection reason.")
            return
        }
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase.from("community_posts").update({ status: "Rejected", rejection_reason: reason }).eq("id", id)
            if (error) throw error
            setCommunityPosts(prev => prev.map(p => p.id === id ? { ...p, status: "Rejected", rejection_reason: reason } : p))
            showSuccess("Post rejected.")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to reject.")
        }
    }

    async function handleApproveExtension(req: ExtensionRequest) {
        if (!req.post_id) {
            setError("This extension request isn't linked to a post and can't be approved.")
            return
        }
        const supabase = getSupaBrowserClient()
        try {
            const { error: postError, count } = await supabase
                .from("community_posts")
                .update({ expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }, { count: "exact" })
                .eq("id", req.post_id)
            if (postError) throw postError
            if (!count) throw new Error("No matching post was found to extend.")

            const { error: reqError } = await supabase.from("extension_requests").update({ status: "Approved" }).eq("id", req.id)
            if (reqError) throw reqError

            setExtensionRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: "Approved" } : r))
            showSuccess("Extension approved — post extended by 1 month!")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to approve extension.")
        }
    }

    async function handleRejectExtension(req: ExtensionRequest) {
        const reason = extensionRejectionReason[req.id]?.trim()
        if (!reason) {
            setError("Please provide a rejection reason.")
            return
        }
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase.from("extension_requests").update({ status: "Rejected", rejection_reason: reason }).eq("id", req.id)
            if (error) throw error
            setExtensionRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: "Rejected", rejection_reason: reason } : r))
            showSuccess("Extension rejected.")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to reject extension.")
        }
    }

    function startAdd() {
        setForm(EMPTY_FORM)
        setEditingId(null)
        setShowForm(true)
    }

    function startEdit(opp: Opportunity) {
        setForm({
            title: opp.title,
            description: opp.description,
            category: opp.category,
            field: opp.field ?? "",
            organization: opp.organization ?? "",
            location: opp.location ?? "",
            url: opp.url ?? "",
            deadline: opp.deadline ?? "",
            is_featured: opp.is_featured,
        })
        setEditingId(opp.id)
        setShowForm(true)
    }

    function cancelForm() {
        setShowForm(false)
        setEditingId(null)
        setForm(EMPTY_FORM)
        setError(null)
    }

    async function handleSaveOpportunity() {
        if (!form.title || !form.description || !form.category) {
            setError("Title, description and category are required.")
            return
        }
        const supabase = getSupaBrowserClient()
        try {
            const payload = {
                title: form.title,
                description: form.description,
                category: form.category,
                field: form.field || null,
                organization: form.organization || null,
                location: form.location || null,
                url: form.url || null,
                deadline: form.deadline || null,
                is_featured: form.is_featured,
                chapter_id: chapterId,
            }
            if (editingId) {
                const { data, error } = await supabase.from("opportunities").update(payload).eq("id", editingId).select().single()
                if (error) throw error
                setOpportunities(prev => prev.map(o => o.id === editingId ? data : o))
                showSuccess("Opportunity updated!")
            } else {
                const { data, error } = await supabase.from("opportunities").insert(payload).select().single()
                if (error) throw error
                setOpportunities(prev => [data, ...prev])
                showSuccess("Opportunity added!")
            }
            cancelForm()
            router.refresh()
        } catch (err) {
            // Supabase errors are plain objects, not Error instances — an
            // instanceof check here masked a constraint violation for weeks.
            const message = (err as { message?: string })?.message
            setError(message || "Something went wrong.")
        }
    }

    async function handleDeleteOpportunity(id: string) {
        if (!confirm("Delete this opportunity?")) return
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase.from("opportunities").delete().eq("id", id)
            if (error) throw error
            setOpportunities(prev => prev.filter(o => o.id !== id))
            showSuccess("Opportunity deleted.")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete.")
        }
    }

    async function handleToggleFeatured(opp: Opportunity) {
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase.from("opportunities").update({ is_featured: !opp.is_featured }).eq("id", opp.id)
            if (error) throw error
            setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, is_featured: !o.is_featured } : o))
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update.")
        }
    }

    const pendingPosts = communityPosts.filter(p => p.status === "Pending")
    const pendingExtensions = extensionRequests.filter(r => r.status === "Pending")
    const totalPostsBadge = pendingPosts.length + pendingExtensions.length

    return (
        <div className="flex flex-col gap-4">
            {error && <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-3">{error}</div>}
            {success && <div className="bg-primary/10 text-primary text-sm rounded-lg px-4 py-3">{success}</div>}

            <Tabs defaultValue="posts">
                <TabsList className="w-full justify-start sm:grid sm:grid-cols-4">
                    <TabsTrigger value="posts">
                        Posts
                        {totalPostsBadge > 0 && (
                            <span className="ml-1.5 size-4 rounded-none bg-primary text-primary-foreground text-[10px] font-bold inline-flex items-center justify-center">
                                {totalPostsBadge}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
                    <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
                    <TabsTrigger value="chapter">Chapter</TabsTrigger>
                </TabsList>

                {/* Posts + Extension Requests */}
                <TabsContent value="posts" className="mt-6 flex flex-col gap-8">
                    <div className="flex flex-col gap-3">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Extension Requests</h2>
                        {pendingExtensions.length === 0 ? (
                            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No pending extension requests.</CardContent></Card>
                        ) : (
                            pendingExtensions.map(req => (
                                <Card key={req.id} className="border-primary/30 bg-primary/5">
                                    <CardContent className="py-4 flex flex-col gap-3">
                                        <div className="flex items-center gap-2">
                                            <Avatar className="size-6">
                                                <AvatarImage src={req.profiles?.avatar_url ?? ""} />
                                                <AvatarFallback className="text-xs bg-secondary text-foreground">{req.profiles?.full_name?.[0] ?? "?"}</AvatarFallback>
                                            </Avatar>
                                            <p className="text-xs text-muted-foreground">
                                                {req.profiles?.full_name ?? "Unknown"} requesting extension for &quot;{req.community_posts?.title}&quot;
                                            </p>
                                        </div>
                                        <div className="bg-muted rounded-md px-3 py-2">
                                            <p className="text-xs font-medium mb-1">Reason for extension:</p>
                                            <p className="text-xs text-muted-foreground">{req.reason}</p>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <Input
                                                placeholder="Rejection reason (required to reject)"
                                                value={extensionRejectionReason[req.id] ?? ""}
                                                onChange={(e) => setExtensionRejectionReason(prev => ({ ...prev, [req.id]: e.target.value }))}
                                                className="text-xs"
                                            />
                                            <div className="flex gap-2">
                                                <Button size="sm" className="gap-1 flex-1" onClick={() => handleApproveExtension(req)}>
                                                    <Check className="size-3.5" />Approve Extension
                                                </Button>
                                                <Button size="sm" variant="destructive" className="gap-1 flex-1" onClick={() => handleRejectExtension(req)}>
                                                    <X className="size-3.5" />Reject
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>

                    <div className="flex flex-col gap-3">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Community Posts</h2>
                        <p className="text-xs text-muted-foreground">
                            {pendingPosts.length} pending &middot;{" "}
                            {communityPosts.filter(p => p.status === "Approved").length} approved &middot;{" "}
                            {communityPosts.filter(p => p.status === "Rejected").length} rejected
                        </p>
                        {communityPosts.length === 0 ? (
                            <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">No community posts yet.</CardContent></Card>
                        ) : (
                            communityPosts.map(post => (
                                <Card
                                    key={post.id}
                                    className={
                                        post.status === "Pending"
                                            ? "border-primary/30 bg-primary/5"
                                            : post.status === "Rejected"
                                            ? "opacity-60"
                                            : ""
                                    }
                                >
                                    <CardContent className="py-4 flex flex-col gap-3">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-sm font-semibold">{post.title}</p>
                                            <Badge variant={post.status === "Approved" ? "default" : post.status === "Rejected" ? "destructive" : "outline"} className="text-xs">
                                                {post.status}
                                            </Badge>
                                            <Badge variant="outline" className="text-xs">{post.category}</Badge>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Avatar className="size-5">
                                                <AvatarImage src={post.profiles?.avatar_url ?? ""} />
                                                <AvatarFallback className="text-xs bg-secondary text-foreground">{post.profiles?.full_name?.[0] ?? "?"}</AvatarFallback>
                                            </Avatar>
                                            <p className="text-xs text-muted-foreground">
                                                {post.profiles?.full_name ?? "Unknown"} &middot; {post.created_at ? new Date(post.created_at).toLocaleDateString() : ""}
                                            </p>
                                        </div>
                                        <p className="text-xs text-muted-foreground line-clamp-2">{post.description}</p>
                                        <div className="bg-muted rounded-md px-3 py-2">
                                            <p className="text-xs font-medium mb-1">Why they think it qualifies:</p>
                                            <p className="text-xs text-muted-foreground">{post.qualification}</p>
                                        </div>
                                        {post.status === "Rejected" && post.rejection_reason && (
                                            <p className="text-xs text-destructive">Rejection reason: {post.rejection_reason}</p>
                                        )}
                                        {post.status === "Pending" && (
                                            <div className="flex flex-col gap-2">
                                                <Input
                                                    placeholder="Rejection reason (required to reject)"
                                                    value={rejectionReason[post.id] ?? ""}
                                                    onChange={(e) => setRejectionReason(prev => ({ ...prev, [post.id]: e.target.value }))}
                                                    className="text-xs"
                                                />
                                                <div className="flex gap-2">
                                                    <Button size="sm" className="gap-1 flex-1" onClick={() => handleApprovePost(post.id)}>
                                                        <Check className="size-3.5" />Approve
                                                    </Button>
                                                    <Button size="sm" variant="destructive" className="gap-1 flex-1" onClick={() => handleRejectPost(post.id)}>
                                                        <X className="size-3.5" />Reject
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>

                {/* Members */}
                <TabsContent value="members" className="mt-6 flex flex-col gap-3">
                    {members.length === 0 ? (
                        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">No members yet.</CardContent></Card>
                    ) : (
                        members.map((member, i) => (
                            <Card key={member.id} className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out" style={{ animationDelay: `${Math.min(i, 8) * 40}ms`, animationFillMode: "both" }}>
                                <CardContent className="py-3 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Avatar className="size-9">
                                            <AvatarImage src={member.avatar_url ?? ""} />
                                            <AvatarFallback className="bg-secondary text-foreground font-semibold">{member.full_name?.[0] ?? "?"}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col min-w-0">
                                            <p className="text-sm font-semibold truncate">{member.full_name ?? "Unnamed"}</p>
                                            <p className="text-xs text-muted-foreground">{member.grad_year ? `Class of ${member.grad_year}` : ""}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {member.is_admin && <Badge>Site Admin</Badge>}
                                        {member.chapter_role === "chapter_admin" && (
                                            <Badge variant="secondary">Chapter Admin</Badge>
                                        )}
                                        {/* You cannot change your own role -- the route refuses it,
                                            so the chapter is never left with no admin by accident.
                                            Platform admins are off-limits here too: the route rejects
                                            a chapter admin touching one, so no button is offered. */}
                                        {member.id !== currentUserId && !member.is_admin && (
                                            member.chapter_role === "chapter_admin" ? (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-destructive hover:text-destructive"
                                                    disabled={roleBusyId === member.id}
                                                    onClick={() => handleSetMemberRole(member, "member")}
                                                >
                                                    {roleBusyId === member.id ? "Removing…" : "Remove Admin"}
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={roleBusyId === member.id}
                                                    onClick={() => handleSetMemberRole(member, "chapter_admin")}
                                                >
                                                    {roleBusyId === member.id ? "Promoting…" : "Make Admin"}
                                                </Button>
                                            )
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </TabsContent>

                {/* Opportunities */}
                <TabsContent value="opportunities" className="mt-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <p className="font-semibold">Opportunities ({opportunities.length})</p>
                        <Button size="sm" className="gap-2" onClick={startAdd}>
                            <Plus className="size-4" />Add Opportunity
                        </Button>
                    </div>

                    {showForm && (
                        <Card className="border-primary/30">
                            <CardContent className="pt-4 flex flex-col gap-4">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Title *</label>
                                        <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Category *</label>
                                        <select
                                            value={form.category}
                                            onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                                            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                        >
                                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium">Description *</label>
                                    <Input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Organization</label>
                                        <Input value={form.organization} onChange={(e) => setForm(f => ({ ...f, organization: e.target.value }))} />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Location</label>
                                        <Input value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} />
                                    </div>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">URL</label>
                                        <Input value={form.url} onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Deadline</label>
                                        <Input type="date" value={form.deadline} onChange={(e) => setForm(f => ({ ...f, deadline: e.target.value }))} />
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={handleSaveOpportunity} className="gap-2">
                                        <Check className="size-4" />{editingId ? "Save Changes" : "Add Opportunity"}
                                    </Button>
                                    <Button variant="outline" onClick={cancelForm}><X className="size-4 mr-2" />Cancel</Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {opportunities.length === 0 ? (
                        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No opportunities yet.</CardContent></Card>
                    ) : (
                        opportunities.map((opp, i) => (
                            <Card key={opp.id} className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out" style={{ animationDelay: `${Math.min(i, 8) * 40}ms`, animationFillMode: "both" }}>
                                <CardContent className="py-4 flex items-center justify-between gap-4">
                                    <div className="flex flex-col min-w-0">
                                        <p className="text-sm font-semibold truncate">{opp.title}</p>
                                        <p className="text-xs text-muted-foreground">{opp.category}{opp.organization ? ` · ${opp.organization}` : ""}</p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <Button size="icon" variant="ghost" onClick={() => handleToggleFeatured(opp)}>
                                            {opp.is_featured ? <Star className="size-4 fill-primary text-primary" /> : <StarOff className="size-4" />}
                                        </Button>
                                        <Button size="icon" variant="ghost" onClick={() => startEdit(opp)}><Pencil className="size-4" /></Button>
                                        <Button size="icon" variant="ghost" onClick={() => handleDeleteOpportunity(opp.id)} className="text-destructive hover:text-destructive">
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </TabsContent>

                {/* Chapter settings — currently just the profile picture */}
                <TabsContent value="chapter" className="mt-6">
                    <Card>
                        <CardContent className="py-6 flex flex-col sm:flex-row sm:items-center gap-6">
                            <div className="relative shrink-0 self-center sm:self-start">
                                <Avatar className="size-24 ring-4 ring-card">
                                    <AvatarImage src={logoUrl ?? ""} alt={chapterName ?? "Chapter"} />
                                    <AvatarFallback className="text-2xl bg-secondary text-foreground">
                                        {chapterName?.[0] ?? "?"}
                                    </AvatarFallback>
                                </Avatar>
                                <label
                                    htmlFor="chapter-logo"
                                    className={`absolute -bottom-1 -right-1 size-7 rounded-none bg-primary text-primary-foreground flex items-center justify-center ring-2 ring-card has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${logoBusy ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
                                >
                                    {logoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
                                    {/* sr-only, not `hidden`: a hidden input is not focusable, which
                                        would make this the only entry point and leave it unreachable
                                        by keyboard. The label supplies the accessible name. */}
                                    <input
                                        id="chapter-logo"
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp,image/gif"
                                        className="sr-only"
                                        disabled={logoBusy}
                                        onChange={handleLogoChange}
                                    />
                                    <span className="sr-only">Upload chapter picture</span>
                                </label>
                            </div>

                            <div className="flex flex-col gap-2 min-w-0">
                                <p className="font-semibold">Chapter picture</p>
                                <p className="text-sm text-muted-foreground">
                                    Shown on the chapters directory and on your chapter&apos;s page.
                                    PNG, JPG, WebP or GIF, up to 2MB.
                                </p>
                                {logoUrl && (
                                    <div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-2 text-destructive hover:text-destructive"
                                            disabled={logoBusy}
                                            onClick={handleRemoveLogo}
                                        >
                                            <Trash2 className="size-3.5" />Remove picture
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
