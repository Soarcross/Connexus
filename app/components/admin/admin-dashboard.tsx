"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import {
    EXTENSION_DAYS,
    extendedExpiry,
    getLifecycleState,
    initialExpiry,
    type LifecycleEntity,
} from "@/lib/lifecycle"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Textarea } from "@/app/components/ui/textarea"
import {
    ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from "@/app/components/ui/chart"
import {
    BarChart, Bar, XAxis, YAxis, LineChart, Line,
    PieChart, Pie, Cell,
} from "recharts"
import {
    Users, Briefcase, MessageCircle, BarChart3,
    Plus, Pencil, Trash2, Check, X, Star, StarOff, CheckCircle2, RefreshCw
} from "lucide-react"

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

type User = {
    id: string
    full_name: string | null
    avatar_url: string | null
    grad_year: number | null
    is_admin: boolean | null
    created_at: string
    chapter_id: string | null
    chapter_role: string | null
}

type Submission = {
    id: string
    name: string
    email: string
    category: string
    message: string
    created_at: string
    read: boolean
    resolved?: boolean
}

type DayCount = {
    day: string
    count: number
}

type Stats = {
    totalUsers: number
    totalOpportunities: number
    totalMessages: number
    totalConversations: number
}

type TeamMember = {
    id: string
    name: string
    role: string
    image_url: string | null
    bio: string | null
}

type Partner = {
    id: string
    name: string
    description: string | null
    logo_url: string | null
    website_url: string | null
}

type AboutContent = {
    id: string
    mission: string | null
    contact_email: string | null
    contact_phone: string | null
}

type CommunityPost = {
    id: string
    title: string
    description: string
    category: string
    field: string | null
    organization: string | null
    url: string | null
    deadline: string | null
    qualification: string
    status: string
    rejection_reason: string | null
    created_at: string
    expires_at: string | null
    image_url: string | null
    profiles: {
        id: string
        full_name: string | null
        avatar_url: string | null
    } | null
}

type ExtensionRequest = {
    id: string
    /** Exactly one of post_id / opportunity_id is set. */
    post_id: string | null
    opportunity_id: string | null
    user_id: string
    reason: string
    status: string
    rejection_reason: string | null
    created_at: string
    community_posts: {
        title: string
        expires_at: string | null
    } | null
    opportunities: {
        title: string
        expires_at: string | null
    } | null
    profiles: {
        full_name: string | null
        avatar_url: string | null
    } | null
}

type Chapter = {
    id: string
    slug: string
    name: string
    school_name: string
    city: string | null
    state: string | null
    status: string
    created_at: string
}

type ChapterApplication = {
    id: string
    applicant_name: string
    applicant_email: string
    applicant_role: string
    school_name: string
    city: string | null
    state: string | null
    motivation: string
    status: string
    rejection_reason: string | null
    created_at: string
}

/** Resolves which table an extension request points at, plus its current expiry. */
function getExtensionTarget(req: ExtensionRequest):
    | { entity: LifecycleEntity; id: string; title: string; expiresAt: string | null }
    | null {
    if (req.post_id) {
        return {
            entity: "post",
            id: req.post_id,
            title: req.community_posts?.title ?? "Untitled post",
            expiresAt: req.community_posts?.expires_at ?? null,
        }
    }
    if (req.opportunity_id) {
        return {
            entity: "opportunity",
            id: req.opportunity_id,
            title: req.opportunities?.title ?? "Untitled opportunity",
            expiresAt: req.opportunities?.expires_at ?? null,
        }
    }
    return null
}

type Props = {
    opportunities: Opportunity[]
    users: User[]
    submissions: Submission[]
    messagesPerDay: DayCount[]
    usersPerDay: DayCount[]
    stats: Stats
    teamMembers: TeamMember[]
    partners: Partner[]
    aboutContent: AboutContent | null
    communityPosts: CommunityPost[]
    extensionRequests: ExtensionRequest[]
    chapters: Chapter[]
    chapterApplications: ChapterApplication[]
    /** The signed-in admin — recorded as created_by on new opportunities. */
    currentUserId: string
}

const CATEGORIES = ["Internships", "Jobs", "Research", "Scholarships", "Competitions", "Volunteering", "Programs"]
const FIELDS = [
    "Computer Science", "Law", "Medicine", "Finance",
    "Engineering", "Research", "Business", "Design",
    "Journalism", "Education", "Biology", "Mathematics",
    "Cybersecurity", "Architecture", "Consulting", "STEM", "Other"
]

const EMPTY_FORM = {
    title: "",
    description: "",
    category: "Internships",
    field: "",
    // Free text shown when field is "Other"; persisted into `field` itself.
    custom_field: "",
    organization: "",
    location: "",
    url: "",
    deadline: "",
    is_featured: false,
}

const PIE_COLORS = [
    "var(--chart-cat-1)",
    "var(--chart-cat-2)",
    "var(--chart-cat-3)",
    "var(--chart-cat-4)",
    "var(--chart-cat-5)",
]

const lineChartConfig = {
    count: { label: "Count", color: "var(--chart-1)" },
} satisfies ChartConfig

const barChartConfig = {
    count: { label: "Opportunities", color: "var(--chart-1)" },
} satisfies ChartConfig

export function AdminDashboard({
    opportunities: initialOpportunities,
    users: initialUsers,
    submissions: initialSubmissions,
    messagesPerDay,
    usersPerDay,
    stats,
    teamMembers: initialTeamMembers,
    partners: initialPartners,
    aboutContent: initialAboutContent,
    communityPosts: initialCommunityPosts,
    extensionRequests: initialExtensionRequests,
    chapters: initialChapters,
    chapterApplications: initialChapterApplications,
    currentUserId,
}: Props) {
    const router = useRouter()
    const [opportunities, setOpportunities] = useState<Opportunity[]>(initialOpportunities)
    const [users, setUsers] = useState<User[]>(initialUsers)
    const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions)
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>(initialTeamMembers)
    const [partners, setPartners] = useState<Partner[]>(initialPartners)
    const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>(
        (initialCommunityPosts ?? []) as CommunityPost[])
    const [extensionRequests, setExtensionRequests] = useState<ExtensionRequest[]>(
        (initialExtensionRequests ?? []) as ExtensionRequest[])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [form, setForm] = useState(EMPTY_FORM)

    const [missionEdit, setMissionEdit] = useState(initialAboutContent?.mission ?? "")
    const [contactEmailEdit, setContactEmailEdit] = useState(initialAboutContent?.contact_email ?? "")
    const [contactPhoneEdit, setContactPhoneEdit] = useState(initialAboutContent?.contact_phone ?? "")

    const [showTeamForm, setShowTeamForm] = useState(false)
    const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
    const [teamForm, setTeamForm] = useState({ name: "", role: "", bio: "", image_url: "" })
    const [profileSearch, setProfileSearch] = useState("")
    const [selectedProfileForTeam, setSelectedProfileForTeam] = useState<User | null>(null)

    const [showPartnerForm, setShowPartnerForm] = useState(false)
    const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null)
    const [partnerForm, setPartnerForm] = useState({ name: "", description: "", logo_url: "", website_url: "" })

    const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({})
    const [extensionRejectionReason, setExtensionRejectionReason] = useState<Record<string, string>>({})

    const [chapters, setChapters] = useState<Chapter[]>(initialChapters)
    const [chapterApplications, setChapterApplications] = useState<ChapterApplication[]>(initialChapterApplications)
    const [applicationRejectionReason, setApplicationRejectionReason] = useState<Record<string, string>>({})
    const [applicationSlug, setApplicationSlug] = useState<Record<string, string>>({})
    const [approvingApplicationId, setApprovingApplicationId] = useState<string | null>(null)
    const [rejectingApplicationId, setRejectingApplicationId] = useState<string | null>(null)
    const [chapterAdminSelection, setChapterAdminSelection] = useState<Record<string, string>>({})
    const [assigningChapterAdminId, setAssigningChapterAdminId] = useState<string | null>(null)
    const [chapterAdminError, setChapterAdminError] = useState<Record<string, string>>({})

    const opportunitiesByCategory = CATEGORIES.map(cat => ({
        category: cat.slice(0, 4),
        count: opportunities.filter(o => o.category === cat).length,
    }))

    const submissionsByType = [
        { name: "General Inquiry", value: submissions.filter(s => s.category === "General Inquiry").length },
        { name: "Report a Bug", value: submissions.filter(s => s.category === "Report a Bug").length },
        { name: "Request a Feature", value: submissions.filter(s => s.category === "Request a Feature").length },
    ].filter(s => s.value > 0)

    const formattedMessages = messagesPerDay.map(d => ({
        day: new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        count: Number(d.count),
    }))

    const formattedUsers = usersPerDay.map(d => ({
        day: new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        count: Number(d.count),
    }))

    function showSuccess(msg: string) {
        setSuccess(msg)
        setTimeout(() => setSuccess(null), 3000)
    }

    function startAdd() {
        setForm(EMPTY_FORM)
        setEditingId(null)
        setShowForm(true)
    }

    function startEdit(opp: Opportunity) {
        // A stored field outside the picker list is a custom "Other" value.
        const isCustomField = Boolean(opp.field) && !FIELDS.includes(opp.field ?? "")
        setForm({
            title: opp.title,
            description: opp.description,
            category: opp.category,
            field: isCustomField ? "Other" : (opp.field ?? ""),
            custom_field: isCustomField ? (opp.field ?? "") : "",
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
        setLoading(true)
        setError(null)
        const supabase = getSupaBrowserClient()
        try {
            const payload = {
                title: form.title,
                description: form.description,
                category: form.category,
                field: form.field === "Other" && form.custom_field.trim()
                    ? form.custom_field.trim()
                    : (form.field || null),
                organization: form.organization || null,
                location: form.location || null,
                url: form.url || null,
                deadline: form.deadline || null,
                is_featured: form.is_featured,
            }
            if (editingId) {
                // expires_at is deliberately left alone on edit so an already
                // approved extension is not silently revoked.
                const { data, error } = await supabase.from("opportunities").update(payload as any).eq("id", editingId).select().single()
                if (error) throw error
                setOpportunities(prev => prev.map(o => o.id === editingId ? data : o))
                showSuccess("Opportunity updated successfully!")
            } else {
                const insertPayload = {
                    ...payload,
                    created_by: currentUserId || null,
                    expires_at: initialExpiry(form.deadline || null),
                }
                const { data, error } = await supabase.from("opportunities").insert(insertPayload as any).select().single()
                if (error) throw error
                setOpportunities(prev => [data, ...prev])
                showSuccess("Opportunity added successfully!")
            }
            cancelForm()
            router.refresh()
        } catch (err) {
            // Supabase errors are plain objects, not Error instances — an
            // instanceof check here masked a constraint violation for weeks.
            const message = (err as { message?: string })?.message
            setError(message || "Something went wrong.")
        } finally {
            setLoading(false)
        }
    }

    async function handleDeleteOpportunity(id: string) {
        if (!confirm("Are you sure you want to delete this opportunity?")) return
        setLoading(true)
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase.from("opportunities").delete().eq("id", id)
            if (error) throw error
            setOpportunities(prev => prev.filter(o => o.id !== id))
            showSuccess("Opportunity deleted.")
            router.refresh()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete.")
        } finally {
            setLoading(false)
        }
    }

    async function handleToggleFeatured(opp: Opportunity) {
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase.from("opportunities").update({ is_featured: !opp.is_featured } as any).eq("id", opp.id)
            if (error) throw error
            setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, is_featured: !o.is_featured } : o))
            showSuccess(`${opp.title} ${!opp.is_featured ? "featured" : "unfeatured"}.`)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update.")
        }
    }

    async function handleToggleAdmin(user: User) {
        if (!confirm(`${user.is_admin ? "Remove" : "Grant"} admin access for ${user.full_name}?`)) return
        try {
            const res = await fetch("/api/admin/set-admin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, isAdmin: !user.is_admin }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error ?? "Failed to update.")
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_admin: !u.is_admin } : u))
            showSuccess(`Admin access ${!user.is_admin ? "granted" : "removed"} for ${user.full_name}.`)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update.")
        }
    }

    async function handleRemoveUser(user: User) {
        if (!confirm(`Permanently remove ${user.full_name ?? "this user"}? This cannot be undone.`)) return
        try {
            const res = await fetch("/api/admin/remove-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error ?? "Failed to remove user.")
            setUsers(prev => prev.filter(u => u.id !== user.id))
            showSuccess(`${user.full_name ?? "User"} has been removed.`)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to remove user.")
        }
    }

    async function handleMarkRead(id: string) {
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase.from("contact_submissions").update({ read: true } as any).eq("id", id)
            if (error) throw error
            setSubmissions(prev => prev.map(s => s.id === id ? { ...s, read: true } : s))
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to mark as read.")
        }
    }

    async function handleResolve(id: string) {
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase.from("contact_submissions").update({ read: true, resolved: true } as any).eq("id", id)
            if (error) throw error
            setSubmissions(prev => prev.map(s => s.id === id ? { ...s, read: true, resolved: true } : s))
            showSuccess("Submission marked as resolved.")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to resolve.")
        }
    }

    async function handleSaveAboutContent() {
        const supabase = getSupaBrowserClient()
        setError(null)
        try {
            if (initialAboutContent?.id) {
                const { error } = await supabase
                    .from("about_content")
                    .update({
                        mission: missionEdit,
                        contact_email: contactEmailEdit,
                        contact_phone: contactPhoneEdit,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", initialAboutContent.id)
                if (error) throw error
            } else {
                const { error } = await supabase
                    .from("about_content")
                    .insert({
                        mission: missionEdit,
                        contact_email: contactEmailEdit,
                        contact_phone: contactPhoneEdit,
                    })
                if (error) throw error
            }
            showSuccess("About content updated!")
            router.refresh()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update.")
        }
    }

    async function handleSaveTeamMember() {
        if (!teamForm.role) {
            setError("Role is required.")
            return
        }
        if (!editingTeamId && !selectedProfileForTeam) {
            setError("Please select a profile.")
            return
        }
        const supabase = getSupaBrowserClient()
        try {
            if (editingTeamId) {
                const updatePayload: Record<string, unknown> = { role: teamForm.role }
                if (selectedProfileForTeam) {
                    updatePayload.name = selectedProfileForTeam.full_name ?? teamForm.name
                    updatePayload.image_url = selectedProfileForTeam.avatar_url ?? null
                }
                const { data, error } = await supabase.from("team_members").update(updatePayload as any).eq("id", editingTeamId).select().single()
                if (error) throw error
                setTeamMembers(prev => prev.map(t => t.id === editingTeamId ? data : t))
            } else {
                const payload = {
                    name: selectedProfileForTeam!.full_name ?? "",
                    role: teamForm.role,
                    bio: null,
                    image_url: selectedProfileForTeam!.avatar_url ?? null,
                }
                const { data, error } = await supabase.from("team_members").insert(payload as any).select().single()
                if (error) throw error
                setTeamMembers(prev => [...prev, data])
            }
            setShowTeamForm(false)
            setEditingTeamId(null)
            setTeamForm({ name: "", role: "", bio: "", image_url: "" })
            setSelectedProfileForTeam(null)
            setProfileSearch("")
            showSuccess("Team member saved!")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save.")
        }
    }

    async function handleDeleteTeamMember(id: string) {
        if (!confirm("Delete this team member?")) return
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase.from("team_members").delete().eq("id", id)
            if (error) throw error
            setTeamMembers(prev => prev.filter(t => t.id !== id))
            showSuccess("Team member deleted.")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete.")
        }
    }

    async function handleSavePartner() {
        if (!partnerForm.name) {
            setError("Partner name is required.")
            return
        }
        const supabase = getSupaBrowserClient()
        try {
            if (editingPartnerId) {
                const { data, error } = await supabase.from("partners").update(partnerForm as any).eq("id", editingPartnerId).select().single()
                if (error) throw error
                setPartners(prev => prev.map(p => p.id === editingPartnerId ? data : p))
            } else {
                const { data, error } = await supabase.from("partners").insert(partnerForm as any).select().single()
                if (error) throw error
                setPartners(prev => [...prev, data])
            }
            setShowPartnerForm(false)
            setEditingPartnerId(null)
            setPartnerForm({ name: "", description: "", logo_url: "", website_url: "" })
            showSuccess("Partner saved!")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save.")
        }
    }

    async function handleDeletePartner(id: string) {
        if (!confirm("Delete this partner?")) return
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase.from("partners").delete().eq("id", id)
            if (error) throw error
            setPartners(prev => prev.filter(p => p.id !== id))
            showSuccess("Partner deleted.")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete.")
        }
    }

    async function handleApprovePost(id: string) {
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase
                .from("community_posts")
                .update({ status: "Approved" } as any)
                .eq("id", id)
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
            const { error } = await supabase
                .from("community_posts")
                .update({ status: "Rejected", rejection_reason: reason } as any)
                .eq("id", id)
            if (error) throw error
            setCommunityPosts(prev => prev.map(p => p.id === id ? { ...p, status: "Rejected", rejection_reason: reason } : p))
            showSuccess("Post rejected.")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to reject.")
        }
    }

    async function handleApproveExtension(req: ExtensionRequest) {
        const supabase = getSupaBrowserClient()
        const target = getExtensionTarget(req)
        if (!target) {
            setError("This request is not attached to a post or opportunity.")
            return
        }

        try {
            // extendedExpiry() counts from whichever is later — now or the current
            // expiry — so this revives an archived item and never shortens an
            // active one.
            const nextExpiry = extendedExpiry(target.expiresAt)

            // count: "exact" so a row that vanished (purged, or RLS-invisible)
            // surfaces as an error instead of silently reporting success.
            const { error: targetError, count } = target.entity === "post"
                ? await supabase
                    .from("community_posts")
                    .update({ expires_at: nextExpiry }, { count: "exact" })
                    .eq("id", target.id)
                : await supabase
                    .from("opportunities")
                    .update({ expires_at: nextExpiry }, { count: "exact" })
                    .eq("id", target.id)
            if (targetError) throw targetError
            if (!count) throw new Error(`No matching ${target.entity} was found to extend.`)

            // Mark request as approved
            const { error: reqError } = await supabase
                .from("extension_requests")
                .update({ status: "Approved" })
                .eq("id", req.id)
            if (reqError) throw reqError

            setExtensionRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: "Approved" } : r))
            showSuccess(`Extension approved — ${target.entity} extended by ${EXTENSION_DAYS} days!`)
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
            const { error } = await supabase
                .from("extension_requests")
                .update({ status: "Rejected", rejection_reason: reason } as any)
                .eq("id", req.id)
            if (error) throw error
            setExtensionRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: "Rejected", rejection_reason: reason } : r))
            showSuccess("Extension rejected.")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to reject extension.")
        }
    }

    function slugify(value: string) {
        // truncate before trimming hyphens, so a cut that lands right after a
        // hyphen doesn't leave one dangling at the end
        const slug = value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 30)
            .replace(/^-+|-+$/g, "")
        // the DB's slug_format constraint requires at least 2 characters
        // total -- a single surviving alnum char (e.g. "A" -> "a") would
        // otherwise pass this function but be rejected at approve time
        return slug.length >= 2 ? slug : "chapter"
    }

    async function handleApproveApplication(application: ChapterApplication) {
        // always re-normalize before submit -- the admin may have hand-edited
        // the auto-suggested slug into something with spaces/uppercase/etc.
        const slug = slugify(applicationSlug[application.id] ?? application.school_name)
        if (!slug) {
            setError("Please provide a chapter slug.")
            return
        }
        setApprovingApplicationId(application.id)
        setError(null)
        try {
            const res = await fetch("/api/admin/approve-chapter", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ applicationId: application.id, slug }),
            })
            const json = await res.json()
            if (!res.ok || !json.chapter) throw new Error(json.error ?? "Failed to approve application.")

            setChapterApplications(prev => prev.map(a => a.id === application.id ? { ...a, status: "Approved" } : a))
            setChapters(prev => [json.chapter, ...prev])

            if (json.error) {
                // chapter was created, but the invite email failed — surface as a warning, not a hard error
                setError(json.error)
            } else {
                showSuccess(`${json.chapter.name} chapter created — invite sent to ${application.applicant_email}.`)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to approve application.")
        } finally {
            setApprovingApplicationId(null)
        }
    }

    async function handleRejectApplication(application: ChapterApplication) {
        const reason = applicationRejectionReason[application.id]?.trim()
        if (!reason) {
            setError("Please provide a rejection reason.")
            return
        }
        setRejectingApplicationId(application.id)
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase
                .from("chapter_applications")
                .update({ status: "Rejected", rejection_reason: reason })
                .eq("id", application.id)
            if (error) throw error
            setChapterApplications(prev => prev.map(a => a.id === application.id ? { ...a, status: "Rejected", rejection_reason: reason } : a))
            showSuccess("Application rejected.")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to reject application.")
        } finally {
            setRejectingApplicationId(null)
        }
    }

    async function handleToggleChapterStatus(chapter: Chapter) {
        const nextStatus = chapter.status === "Active" ? "Inactive" : "Active"
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase.from("chapters").update({ status: nextStatus }).eq("id", chapter.id)
            if (error) throw error
            setChapters(prev => prev.map(c => c.id === chapter.id ? { ...c, status: nextStatus } : c))
            showSuccess(`${chapter.name} is now ${nextStatus.toLowerCase()}.`)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update chapter.")
        }
    }

    async function handleAssignChapterAdmin(chapter: Chapter) {
        const userId = chapterAdminSelection[chapter.id]
        if (!userId) {
            setChapterAdminError(prev => ({ ...prev, [chapter.id]: "Select a member first." }))
            return
        }
        setAssigningChapterAdminId(chapter.id)
        setChapterAdminError(prev => ({ ...prev, [chapter.id]: "" }))
        try {
            const res = await fetch("/api/admin/assign-chapter-admin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chapterId: chapter.id, userId }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error ?? "Failed to assign chapter admin.")

            setUsers(prev => prev.map(u => u.id === userId ? { ...u, chapter_role: "chapter_admin" } : u))
            const assignedUser = users.find(u => u.id === userId)
            showSuccess(`${assignedUser?.full_name ?? "User"} is now the admin for ${chapter.name}.`)
        } catch (err) {
            setChapterAdminError(prev => ({ ...prev, [chapter.id]: err instanceof Error ? err.message : "Failed to assign chapter admin." }))
        } finally {
            setAssigningChapterAdminId(null)
        }
    }

    const pendingApplications = chapterApplications.filter(a => a.status === "Pending")
    const pendingExtensions = extensionRequests.filter(r => r.status === "Pending")
    const pendingPosts = communityPosts.filter(p => p.status === "Pending")
    const totalPostsBadge = pendingPosts.length + pendingExtensions.length

    return (
        <div className="flex flex-col gap-4">
            {error && <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-3">{error}</div>}
            {success && <div className="bg-primary/10 text-primary text-sm rounded-lg px-4 py-3">{success}</div>}

            <Tabs defaultValue="stats">
                {/* Scrollable strip below lg (TabsList is overflow-x-auto);
                    the equal-width grid is restored at lg+. */}
                <TabsList className="w-full justify-start lg:grid lg:grid-cols-8">
                    <TabsTrigger value="stats">Statistics</TabsTrigger>
                    <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
                    <TabsTrigger value="users">Users</TabsTrigger>
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                    <TabsTrigger value="contact">
                        Contact
                        {submissions.filter(s => !s.read && !s.resolved).length > 0 && (
                            <span className="ml-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold inline-flex items-center justify-center">
                                {submissions.filter(s => !s.read && !s.resolved).length}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="posts">
                        Posts
                        {totalPostsBadge > 0 && (
                            <span className="ml-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold inline-flex items-center justify-center">
                                {totalPostsBadge}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="chapters">
                        Chapters
                        {pendingApplications.length > 0 && (
                            <span className="ml-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold inline-flex items-center justify-center">
                                {pendingApplications.length}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="about">About</TabsTrigger>
                </TabsList>

                {/* Statistics Tab */}
                <TabsContent value="stats" className="mt-6 flex flex-col gap-6">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardContent className="pt-6 flex flex-col gap-2">
                                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Users className="size-5" /></div>
                                <p className="text-3xl font-bold">{stats.totalUsers}</p>
                                <p className="text-sm text-muted-foreground">Total Users</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6 flex flex-col gap-2">
                                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Briefcase className="size-5" /></div>
                                <p className="text-3xl font-bold">{stats.totalOpportunities}</p>
                                <p className="text-sm text-muted-foreground">Opportunities</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6 flex flex-col gap-2">
                                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><MessageCircle className="size-5" /></div>
                                <p className="text-3xl font-bold">{stats.totalConversations}</p>
                                <p className="text-sm text-muted-foreground">Conversations</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6 flex flex-col gap-2">
                                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><BarChart3 className="size-5" /></div>
                                <p className="text-3xl font-bold">{stats.totalMessages}</p>
                                <p className="text-sm text-muted-foreground">Messages Sent</p>
                            </CardContent>
                        </Card>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Card>
                            <CardHeader><CardTitle className="text-base">New Users (Last 30 Days)</CardTitle></CardHeader>
                            <CardContent>
                                {formattedUsers.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
                                ) : (
                                    <ChartContainer config={lineChartConfig} className="h-48 w-full">
                                        <LineChart data={formattedUsers}>
                                            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                                            <YAxis tick={{ fontSize: 10 }} />
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                            <Line type="monotone" dataKey="count" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                                        </LineChart>
                                    </ChartContainer>
                                )}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle className="text-base">Messages Sent (Last 30 Days)</CardTitle></CardHeader>
                            <CardContent>
                                {formattedMessages.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
                                ) : (
                                    <ChartContainer config={lineChartConfig} className="h-48 w-full">
                                        <LineChart data={formattedMessages}>
                                            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                                            <YAxis tick={{ fontSize: 10 }} />
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                            <Line type="monotone" dataKey="count" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                                        </LineChart>
                                    </ChartContainer>
                                )}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle className="text-base">Opportunities by Category</CardTitle></CardHeader>
                            <CardContent>
                                <ChartContainer config={barChartConfig} className="h-48 w-full">
                                    <BarChart data={opportunitiesByCategory}>
                                        <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle className="text-base">Contact Submissions by Type</CardTitle></CardHeader>
                            <CardContent>
                                {submissionsByType.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-8">No submissions yet</p>
                                ) : (
                                    <div className="flex flex-col items-center gap-4">
                                        <ChartContainer config={barChartConfig} className="h-40 w-full">
                                            <PieChart>
                                                <Pie data={submissionsByType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} stroke="var(--card)" strokeWidth={2}>
                                                    {submissionsByType.map((_, index) => (
                                                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <ChartTooltip content={<ChartTooltipContent />} />
                                            </PieChart>
                                        </ChartContainer>
                                        <div className="flex flex-wrap gap-3 justify-center">
                                            {submissionsByType.map((s, i) => (
                                                <div key={s.name} className="flex items-center gap-1.5">
                                                    <div className="size-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                                    <span className="text-xs text-muted-foreground">{s.name} ({s.value})</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Opportunities Tab */}
                <TabsContent value="opportunities" className="mt-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">{opportunities.length} total opportunities</p>
                        <Button onClick={startAdd} className="gap-2"><Plus className="size-4" />Add Opportunity</Button>
                    </div>
                    {showForm && (
                        <Card className="border-primary/30">
                            <CardHeader>
                                <CardTitle className="text-base">{editingId ? "Edit Opportunity" : "Add New Opportunity"}</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Title *</label>
                                        <Input placeholder="e.g. Summer Research Internship" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Organization</label>
                                        <Input placeholder="e.g. Columbia University" value={form.organization} onChange={(e) => setForm(f => ({ ...f, organization: e.target.value }))} />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium">Description *</label>
                                    <Textarea placeholder="Describe the opportunity..." value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Type *</label>
                                        <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                                            {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Field</label>
                                        <select value={form.field} onChange={(e) => setForm(f => ({ ...f, field: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                                            <option value="">Select a field</option>
                                            {FIELDS.map(field => <option key={field} value={field}>{field}</option>)}
                                        </select>
                                        {form.field === "Other" && (
                                            <Input
                                                placeholder="Specify the field (e.g. Marine Robotics)"
                                                value={form.custom_field}
                                                maxLength={60}
                                                onChange={(e) => setForm(f => ({ ...f, custom_field: e.target.value }))}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Location</label>
                                        <Input placeholder="e.g. New York, NY" value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Deadline</label>
                                        <Input type="date" value={form.deadline} onChange={(e) => setForm(f => ({ ...f, deadline: e.target.value }))} />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium">URL</label>
                                    <Input placeholder="https://..." value={form.url} onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setForm(f => ({ ...f, is_featured: !f.is_featured }))} className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${form.is_featured ? "bg-primary" : "bg-muted"}`}>
                                        <span className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-lg transition-transform ${form.is_featured ? "translate-x-4" : "translate-x-0"}`} />
                                    </button>
                                    <span className="text-sm text-muted-foreground">Feature this opportunity</span>
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <Button onClick={handleSaveOpportunity} disabled={loading} className="gap-2">
                                        <Check className="size-4" />{editingId ? "Save Changes" : "Add Opportunity"}
                                    </Button>
                                    <Button variant="outline" onClick={cancelForm}><X className="size-4 mr-2" />Cancel</Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                    <div className="flex flex-col gap-3">
                        {opportunities.map(opp => (
                            <Card key={opp.id} className={opp.is_featured ? "border-primary/30 bg-primary/5" : ""}>
                                <CardContent className="py-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                    <div className="flex flex-col gap-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-semibold text-sm">{opp.title}</p>
                                            {opp.is_featured && <Badge className="text-xs">Featured</Badge>}
                                            <Badge variant="outline" className="text-xs">{opp.category}</Badge>
                                            {opp.field && <Badge variant="secondary" className="text-xs">{opp.field}</Badge>}
                                        </div>
                                        {opp.organization && <p className="text-xs text-muted-foreground">{opp.organization}</p>}
                                        <p className="text-xs text-muted-foreground line-clamp-1">{opp.description}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Button size="icon" variant="ghost" onClick={() => handleToggleFeatured(opp)}>
                                            {opp.is_featured ? <StarOff className="size-4 text-primary" /> : <Star className="size-4" />}
                                        </Button>
                                        <Button size="icon" variant="ghost" onClick={() => startEdit(opp)}><Pencil className="size-4" /></Button>
                                        <Button size="icon" variant="ghost" onClick={() => handleDeleteOpportunity(opp.id)} className="text-destructive hover:text-destructive">
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                {/* Users Tab */}
                <TabsContent value="users" className="mt-6 flex flex-col gap-4">
                    <p className="text-sm text-muted-foreground">{users.length} total users</p>
                    <div className="flex flex-col gap-3">
                        {users.map(user => (
                            <Card key={user.id}>
                                <CardContent className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Avatar className="size-10 shrink-0">
                                            <AvatarImage src={user.avatar_url ?? ""} />
                                            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">{user.full_name?.[0] ?? "?"}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-semibold truncate">{user.full_name ?? "No name"}</p>
                                                {user.is_admin && <Badge className="text-xs">Admin</Badge>}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {user.grad_year ? `Class of ${user.grad_year}` : "No grad year"}{" · "}Joined {new Date(user.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Button size="sm" variant={user.is_admin ? "destructive" : "outline"} onClick={() => handleToggleAdmin(user)}>
                                            {user.is_admin ? "Remove Admin" : "Make Admin"}
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => router.push(`/profile/${user.id}`)}>View</Button>
                                        <Button size="sm" variant="destructive" onClick={() => handleRemoveUser(user)}>
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                {/* Activity Tab */}
                <TabsContent value="activity" className="mt-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Recent Signups</CardTitle>
                                <CardDescription>Last 5 users to join</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-3">
                                {users.slice(0, 5).map(user => (
                                    <div key={user.id} className="flex items-center gap-3">
                                        <Avatar className="size-8">
                                            <AvatarImage src={user.avatar_url ?? ""} />
                                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{user.full_name?.[0] ?? "?"}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col">
                                            <p className="text-sm font-medium">{user.full_name ?? "No name"}</p>
                                            <p className="text-xs text-muted-foreground">{new Date(user.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Recent Opportunities</CardTitle>
                                <CardDescription>Last 5 opportunities added</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-3">
                                {opportunities.slice(0, 5).map(opp => (
                                    <div key={opp.id} className="flex items-center justify-between gap-2">
                                        <div className="flex flex-col min-w-0">
                                            <p className="text-sm font-medium truncate">{opp.title}</p>
                                            <p className="text-xs text-muted-foreground">{new Date(opp.created_at).toLocaleDateString()}</p>
                                        </div>
                                        <Badge variant="outline" className="text-xs shrink-0">{opp.category}</Badge>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Contact Tab */}
                <TabsContent value="contact" className="mt-6 flex flex-col gap-4">
                    <p className="text-sm text-muted-foreground">
                        {submissions.filter(s => !s.resolved).length} open · {submissions.filter(s => s.resolved).length} resolved · {submissions.length} total
                    </p>
                    {submissions.length === 0 ? (
                        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">No contact submissions yet.</CardContent></Card>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {submissions.map(sub => (
                                <Card key={sub.id} className={sub.resolved ? "opacity-60" : !sub.read ? "border-primary/30 bg-primary/5" : ""}>
                                    <CardContent className="py-4 flex flex-col gap-2">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-semibold">{sub.name}</p>
                                                    <Badge variant="outline" className="text-xs">{sub.category}</Badge>
                                                    {!sub.read && !sub.resolved && <Badge className="text-xs">New</Badge>}
                                                    {sub.resolved && <Badge variant="secondary" className="text-xs">Resolved</Badge>}
                                                </div>
                                                <p className="text-xs text-muted-foreground">{sub.email} · {new Date(sub.created_at).toLocaleDateString()}</p>
                                            </div>
                                            {!sub.resolved && (
                                                <div className="flex gap-2 shrink-0">
                                                    {!sub.read && (
                                                        <Button size="sm" variant="outline" onClick={() => handleMarkRead(sub.id)}>Mark Read</Button>
                                                    )}
                                                    <Button size="sm" variant="outline" className="gap-1 text-primary border-primary/30 hover:bg-primary/10" onClick={() => handleResolve(sub.id)}>
                                                        <CheckCircle2 className="size-3.5" />Resolve
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground">{sub.message}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* Posts Tab */}
                <TabsContent value="posts" className="mt-6 flex flex-col gap-6">

                    {/* Extension Requests Section */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Extension Requests</h2>
                            {pendingExtensions.length > 0 && (
                                <span className="size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold inline-flex items-center justify-center">
                                    {pendingExtensions.length}
                                </span>
                            )}
                        </div>
                        {extensionRequests.length === 0 ? (
                            <Card>
                                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                                    No extension requests yet.
                                </CardContent>
                            </Card>
                        ) : (
                            extensionRequests.map(req => {
                                const target = getExtensionTarget(req)
                                const targetArchived =
                                    target !== null && getLifecycleState(target.expiresAt) === "archived"
                                return (
                                <Card
                                    key={req.id}
                                    className={
                                        req.status === "Pending"
                                            ? "border-primary/30 bg-primary/5"
                                            : req.status === "Rejected"
                                            ? "opacity-60"
                                            : ""
                                    }
                                >
                                    <CardContent className="py-4 flex flex-col gap-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-semibold">
                                                        {target?.title ?? "Unknown item"}
                                                    </p>
                                                    <Badge
                                                        variant={req.status === "Approved" ? "default" : req.status === "Rejected" ? "destructive" : "outline"}
                                                        className="text-xs"
                                                    >
                                                        {req.status}
                                                    </Badge>
                                                    <Badge variant="secondary" className="text-xs gap-1">
                                                        <RefreshCw className="size-3" />
                                                        {target?.entity === "opportunity" ? "Opportunity" : "Post"} Extension
                                                    </Badge>
                                                    {targetArchived && (
                                                        <Badge variant="outline" className="text-xs text-destructive border-destructive/50">
                                                            Archived — pending deletion
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="size-5">
                                                        <AvatarImage src={req.profiles?.avatar_url ?? ""} />
                                                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                                            {req.profiles?.full_name?.[0] ?? "?"}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <p className="text-xs text-muted-foreground">
                                                        {req.profiles?.full_name ?? "Unknown"} · {new Date(req.created_at).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-muted rounded-md px-3 py-2">
                                            <p className="text-xs font-medium mb-1">Reason for extension:</p>
                                            <p className="text-xs text-muted-foreground">{req.reason}</p>
                                        </div>

                                        {req.status === "Rejected" && req.rejection_reason && (
                                            <p className="text-xs text-destructive">Rejection reason: {req.rejection_reason}</p>
                                        )}

                                        {req.status === "Pending" && (
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
                                        )}
                                    </CardContent>
                                </Card>
                                )
                            })
                        )}
                    </div>

                    {/* Community Posts Section */}
                    <div className="flex flex-col gap-3">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            Community Posts
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            {pendingPosts.length} pending ·{" "}
                            {communityPosts.filter(p => p.status === "Approved").length} approved ·{" "}
                            {communityPosts.filter(p => p.status === "Rejected").length} rejected
                        </p>
                        {communityPosts.length === 0 ? (
                            <Card>
                                <CardContent className="py-12 text-center text-muted-foreground text-sm">
                                    No community posts yet.
                                </CardContent>
                            </Card>
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
                                        {post.image_url && (
                                            <div className="w-full max-h-48 overflow-hidden rounded-md bg-muted">
                                                <img src={post.image_url} alt={post.title} className="w-full object-cover" />
                                            </div>
                                        )}
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex flex-col gap-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-semibold">{post.title}</p>
                                                    <Badge
                                                        variant={post.status === "Approved" ? "default" : post.status === "Rejected" ? "destructive" : "outline"}
                                                        className="text-xs"
                                                    >
                                                        {post.status}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-xs">{post.category}</Badge>
                                                    {post.field && <Badge variant="secondary" className="text-xs">{post.field}</Badge>}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="size-5">
                                                        <AvatarImage src={post.profiles?.avatar_url ?? ""} />
                                                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                                            {post.profiles?.full_name?.[0] ?? "?"}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <p className="text-xs text-muted-foreground">
                                                        {post.profiles?.full_name ?? "Unknown"} · {new Date(post.created_at).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
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

                {/* About Tab */}
                <TabsContent value="about" className="mt-6 flex flex-col gap-8">
                    <Card>
                        <CardHeader><CardTitle className="text-base">Mission & Contact Info</CardTitle></CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Mission Statement</label>
                                <Textarea value={missionEdit} onChange={(e) => setMissionEdit(e.target.value)} placeholder="Describe the mission of Connexus..." rows={4} />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium">Contact Email</label>
                                    <Input value={contactEmailEdit} onChange={(e) => setContactEmailEdit(e.target.value)} placeholder="contact@hsconnexus.com" type="email" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium">Contact Phone</label>
                                    <Input value={contactPhoneEdit} onChange={(e) => setContactPhoneEdit(e.target.value)} placeholder="+1 (212) 555-0000" />
                                </div>
                            </div>
                            <Button onClick={handleSaveAboutContent} className="w-fit">Save Changes</Button>
                        </CardContent>
                    </Card>

                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <p className="font-semibold">Team Members ({teamMembers.length})</p>
                            <Button size="sm" className="gap-2" onClick={() => {
                                setTeamForm({ name: "", role: "", bio: "", image_url: "" })
                                setEditingTeamId(null)
                                setSelectedProfileForTeam(null)
                                setProfileSearch("")
                                setShowTeamForm(true)
                            }}>
                                <Plus className="size-4" />Add Member
                            </Button>
                        </div>
                        {showTeamForm && (
                            <Card className="border-primary/30">
                                <CardContent className="pt-4 flex flex-col gap-4">
                                    {editingTeamId ? (
                                        <div className="flex flex-col gap-4">
                                            <div className="flex flex-col gap-2">
                                                <label className="text-sm font-medium">Role *</label>
                                                <Input value={teamForm.role} onChange={(e) => setTeamForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Co-Founder & CEO" />
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <label className="text-sm font-medium text-muted-foreground">Sync profile picture from account</label>
                                                {!selectedProfileForTeam ? (
                                                    <>
                                                        <Input value={profileSearch} onChange={(e) => setProfileSearch(e.target.value)} placeholder="Search by name to link account..." />
                                                        {profileSearch && (
                                                            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto border rounded-md p-1">
                                                                {initialUsers.filter(u => u.full_name && u.full_name.toLowerCase().includes(profileSearch.toLowerCase())).slice(0, 10).map(u => (
                                                                    <button key={u.id} type="button" className="flex items-center gap-3 px-3 py-2 rounded hover:bg-accent text-left transition-colors" onClick={() => setSelectedProfileForTeam(u)}>
                                                                        <Avatar className="size-7 shrink-0">
                                                                            <AvatarImage src={u.avatar_url ?? ""} />
                                                                            <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">{u.full_name?.[0]}</AvatarFallback>
                                                                        </Avatar>
                                                                        <span className="text-sm truncate">{u.full_name}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="flex items-center gap-3 p-2 border rounded-md bg-accent/30">
                                                        <Avatar className="size-8 shrink-0">
                                                            <AvatarImage src={selectedProfileForTeam.avatar_url ?? ""} />
                                                            <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">{selectedProfileForTeam.full_name?.[0]}</AvatarFallback>
                                                        </Avatar>
                                                        <span className="text-sm flex-1">{selectedProfileForTeam.full_name}</span>
                                                        <Button size="sm" variant="ghost" onClick={() => { setSelectedProfileForTeam(null); setProfileSearch("") }}><X className="size-4" /></Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {!selectedProfileForTeam ? (
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-sm font-medium">Select Account *</label>
                                                    <Input value={profileSearch} onChange={(e) => setProfileSearch(e.target.value)} placeholder="Search by name..." />
                                                    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto border rounded-md p-1">
                                                        {initialUsers.filter(u => u.full_name && u.full_name.toLowerCase().includes(profileSearch.toLowerCase())).slice(0, 20).map(u => (
                                                            <button key={u.id} type="button" className="flex items-center gap-3 px-3 py-2 rounded hover:bg-accent text-left transition-colors" onClick={() => setSelectedProfileForTeam(u)}>
                                                                <Avatar className="size-8 shrink-0">
                                                                    <AvatarImage src={u.avatar_url ?? ""} />
                                                                    <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">{u.full_name?.[0]}</AvatarFallback>
                                                                </Avatar>
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="text-sm font-medium truncate">{u.full_name}</span>
                                                                    {u.grad_year && <span className="text-xs text-muted-foreground">Class of {u.grad_year}</span>}
                                                                </div>
                                                            </button>
                                                        ))}
                                                        {initialUsers.filter(u => u.full_name && u.full_name.toLowerCase().includes(profileSearch.toLowerCase())).length === 0 && (
                                                            <p className="text-xs text-muted-foreground text-center py-3">No accounts found</p>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-3 p-3 border rounded-md bg-accent/30">
                                                        <Avatar className="size-10 shrink-0">
                                                            <AvatarImage src={selectedProfileForTeam.avatar_url ?? ""} />
                                                            <AvatarFallback className="text-sm bg-primary/10 text-primary font-semibold">{selectedProfileForTeam.full_name?.[0]}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="flex flex-col min-w-0 flex-1">
                                                            <span className="text-sm font-semibold">{selectedProfileForTeam.full_name}</span>
                                                            {selectedProfileForTeam.grad_year && <span className="text-xs text-muted-foreground">Class of {selectedProfileForTeam.grad_year}</span>}
                                                        </div>
                                                        <Button size="sm" variant="ghost" onClick={() => { setSelectedProfileForTeam(null); setProfileSearch("") }}><X className="size-4" /></Button>
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-sm font-medium">Role *</label>
                                                        <Input value={teamForm.role} onChange={(e) => setTeamForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Co-Founder & CEO" />
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    )}
                                    <div className="flex gap-2">
                                        <Button onClick={handleSaveTeamMember} className="gap-2" disabled={!editingTeamId && !selectedProfileForTeam}>
                                            <Check className="size-4" />{editingTeamId ? "Save Changes" : "Add Member"}
                                        </Button>
                                        <Button variant="outline" onClick={() => { setShowTeamForm(false); setSelectedProfileForTeam(null); setProfileSearch("") }}>
                                            <X className="size-4 mr-2" />Cancel
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                        <div className="flex flex-col gap-3">
                            {teamMembers.length === 0 ? (
                                <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No team members added yet.</CardContent></Card>
                            ) : (
                                teamMembers.map(member => (
                                    <Card key={member.id}>
                                        <CardContent className="py-4 flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <Avatar className="size-10 shrink-0">
                                                    <AvatarImage src={member.image_url ?? ""} />
                                                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">{member.name?.[0]}</AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col min-w-0">
                                                    <p className="text-sm font-semibold">{member.name}</p>
                                                    <p className="text-xs text-primary">{member.role}</p>
                                                    {member.bio && <p className="text-xs text-muted-foreground truncate">{member.bio}</p>}
                                                </div>
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <Button size="icon" variant="ghost" onClick={() => {
                                                    setTeamForm({ name: member.name, role: member.role, bio: member.bio ?? "", image_url: member.image_url ?? "" })
                                                    setEditingTeamId(member.id)
                                                    setSelectedProfileForTeam(null)
                                                    setProfileSearch("")
                                                    setShowTeamForm(true)
                                                }}><Pencil className="size-4" /></Button>
                                                <Button size="icon" variant="ghost" onClick={() => handleDeleteTeamMember(member.id)} className="text-destructive hover:text-destructive">
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <p className="font-semibold">Partners ({partners.length})</p>
                            <Button size="sm" className="gap-2" onClick={() => {
                                setPartnerForm({ name: "", description: "", logo_url: "", website_url: "" })
                                setEditingPartnerId(null)
                                setShowPartnerForm(true)
                            }}>
                                <Plus className="size-4" />Add Partner
                            </Button>
                        </div>
                        {showPartnerForm && (
                            <Card className="border-primary/30">
                                <CardContent className="pt-4 flex flex-col gap-4">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="flex flex-col gap-2">
                                            <label className="text-sm font-medium">Name *</label>
                                            <Input value={partnerForm.name} onChange={(e) => setPartnerForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. NYC Department of Education" />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <label className="text-sm font-medium">Website URL</label>
                                            <Input value={partnerForm.website_url} onChange={(e) => setPartnerForm(f => ({ ...f, website_url: e.target.value }))} placeholder="https://..." />
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Description</label>
                                        <Textarea value={partnerForm.description} onChange={(e) => setPartnerForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description..." rows={2} />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Logo URL</label>
                                        <Input value={partnerForm.logo_url} onChange={(e) => setPartnerForm(f => ({ ...f, logo_url: e.target.value }))} placeholder="https://..." />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleSavePartner} className="gap-2">
                                            <Check className="size-4" />{editingPartnerId ? "Save Changes" : "Add Partner"}
                                        </Button>
                                        <Button variant="outline" onClick={() => setShowPartnerForm(false)}><X className="size-4 mr-2" />Cancel</Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                        <div className="flex flex-col gap-3">
                            {partners.length === 0 ? (
                                <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No partners added yet.</CardContent></Card>
                            ) : (
                                partners.map(partner => (
                                    <Card key={partner.id}>
                                        <CardContent className="py-4 flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-3 min-w-0">
                                                {partner.logo_url ? (
                                                    <img src={partner.logo_url} alt={partner.name} className="size-10 object-contain shrink-0" />
                                                ) : (
                                                    <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">{partner.name?.[0]}</div>
                                                )}
                                                <div className="flex flex-col min-w-0">
                                                    <p className="text-sm font-semibold">{partner.name}</p>
                                                    {partner.description && <p className="text-xs text-muted-foreground truncate">{partner.description}</p>}
                                                    {partner.website_url && <a href={partner.website_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">{partner.website_url}</a>}
                                                </div>
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <Button size="icon" variant="ghost" onClick={() => {
                                                    setPartnerForm({ name: partner.name, description: partner.description ?? "", logo_url: partner.logo_url ?? "", website_url: partner.website_url ?? "" })
                                                    setEditingPartnerId(partner.id)
                                                    setShowPartnerForm(true)
                                                }}><Pencil className="size-4" /></Button>
                                                <Button size="icon" variant="ghost" onClick={() => handleDeletePartner(partner.id)} className="text-destructive hover:text-destructive">
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                    </div>
                </TabsContent>

                {/* Chapters Tab */}
                <TabsContent value="chapters" className="mt-6 flex flex-col gap-8">
                    <div className="flex flex-col gap-4">
                        <p className="font-semibold">Pending Applications ({pendingApplications.length})</p>
                        {pendingApplications.length === 0 ? (
                            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No pending chapter applications.</CardContent></Card>
                        ) : (
                            pendingApplications.map(application => (
                                <Card key={application.id}>
                                    <CardContent className="pt-6 flex flex-col gap-3">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex flex-col">
                                                <p className="font-semibold">{application.school_name}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {[application.city, application.state].filter(Boolean).join(", ")}
                                                </p>
                                            </div>
                                            <Badge variant="secondary">{application.applicant_role}</Badge>
                                        </div>
                                        <p className="text-sm">
                                            <span className="text-muted-foreground">From </span>
                                            {application.applicant_name} &middot; {application.applicant_email}
                                        </p>
                                        <p className="text-sm text-muted-foreground leading-relaxed">{application.motivation}</p>

                                        <div className="flex flex-col gap-2 pt-2">
                                            <label className="text-sm font-medium">Chapter slug (subdomain)</label>
                                            <Input
                                                value={applicationSlug[application.id] ?? slugify(application.school_name)}
                                                onChange={(e) => setApplicationSlug(prev => ({ ...prev, [application.id]: e.target.value }))}
                                                className="max-w-[240px]"
                                            />
                                        </div>

                                        <div className="flex gap-2 pt-2">
                                            <Button
                                                size="sm"
                                                className="gap-1 flex-1"
                                                disabled={approvingApplicationId === application.id || rejectingApplicationId === application.id}
                                                onClick={() => handleApproveApplication(application)}
                                            >
                                                <Check className="size-4" />
                                                {approvingApplicationId === application.id ? "Approving..." : "Approve & Create Chapter"}
                                            </Button>
                                        </div>
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="Rejection reason..."
                                                value={applicationRejectionReason[application.id] ?? ""}
                                                onChange={(e) => setApplicationRejectionReason(prev => ({ ...prev, [application.id]: e.target.value }))}
                                                className="flex-1"
                                            />
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                className="gap-1"
                                                disabled={approvingApplicationId === application.id || rejectingApplicationId === application.id}
                                                onClick={() => handleRejectApplication(application)}
                                            >
                                                <X className="size-4" />
                                                Reject
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>

                    <div className="flex flex-col gap-4">
                        <p className="font-semibold">Chapters ({chapters.length})</p>
                        {chapters.length === 0 ? (
                            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No chapters yet.</CardContent></Card>
                        ) : (
                            chapters.map(chapter => {
                                const chapterMembers = users.filter(u => u.chapter_id === chapter.id)
                                const chapterAdmins = chapterMembers.filter(u => u.chapter_role === "chapter_admin")
                                return (
                                    <Card key={chapter.id}>
                                        <CardContent className="py-4 flex flex-col gap-3">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex flex-col min-w-0">
                                                    <p className="text-sm font-semibold">{chapter.name} <span className="text-muted-foreground font-normal">({chapter.slug})</span></p>
                                                    <p className="text-xs text-muted-foreground truncate">{chapter.school_name}</p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <Badge variant={chapter.status === "Active" ? "default" : "secondary"}>{chapter.status}</Badge>
                                                    <Button size="sm" variant="outline" onClick={() => handleToggleChapterStatus(chapter)}>
                                                        {chapter.status === "Active" ? "Deactivate" : "Activate"}
                                                    </Button>
                                                </div>
                                            </div>

                                            {chapterAdmins.length > 0 ? (
                                                <p className="text-xs text-muted-foreground">
                                                    Admin{chapterAdmins.length > 1 ? "s" : ""}: {chapterAdmins.map(a => a.full_name ?? "Unnamed").join(", ")}
                                                </p>
                                            ) : (
                                                <div className="flex flex-col gap-2 pt-1 border-t">
                                                    <p className="text-xs text-amber-600 dark:text-amber-500 pt-2">No admin assigned yet.</p>
                                                    <div className="flex items-center gap-2">
                                                        <select
                                                            value={chapterAdminSelection[chapter.id] ?? ""}
                                                            onChange={(e) => setChapterAdminSelection(prev => ({ ...prev, [chapter.id]: e.target.value }))}
                                                            className="h-9 flex-1 max-w-[280px] rounded-md border border-input bg-background px-3 text-sm"
                                                            disabled={chapterMembers.length === 0}
                                                        >
                                                            <option value="">
                                                                {chapterMembers.length === 0 ? "No members yet" : "Select a member…"}
                                                            </option>
                                                            {chapterMembers.map(m => (
                                                                <option key={m.id} value={m.id}>{m.full_name ?? "Unnamed"}</option>
                                                            ))}
                                                        </select>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={chapterMembers.length === 0 || assigningChapterAdminId === chapter.id}
                                                            onClick={() => handleAssignChapterAdmin(chapter)}
                                                        >
                                                            {assigningChapterAdminId === chapter.id ? "Assigning…" : "Assign Admin"}
                                                        </Button>
                                                    </div>
                                                    {chapterAdminError[chapter.id] && (
                                                        <p className="text-xs text-destructive">{chapterAdminError[chapter.id]}</p>
                                                    )}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                )
                            })
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}