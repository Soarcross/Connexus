"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getSupaBrowserClient } from "@/lib/supabase/client"
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
    PieChart, Pie, Cell, ResponsiveContainer
} from "recharts"
import {
    Users, Briefcase, MessageCircle, BarChart3,
    Plus, Pencil, Trash2, Check, X, Star, StarOff, CheckCircle2
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
    is_admin: boolean
    created_at: string
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

type Props = {
    opportunities: Opportunity[]
    users: User[]
    submissions: Submission[]
    messagesPerDay: DayCount[]
    usersPerDay: DayCount[]
    stats: Stats
}

const CATEGORIES = ["Internships", "Jobs", "Research", "Scholarships", "Competitions", "Volunteering"]
const FIELDS = [
    "Computer Science", "Law", "Medicine", "Finance",
    "Engineering", "Research", "Business", "Design",
    "Journalism", "Education", "Biology", "Mathematics",
    "Cybersecurity", "Architecture", "Consulting", "Other"
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

const PIE_COLORS = ["#A78BFA", "#818CF8", "#C4B5FD", "#7C3AED", "#6D28D9"]

const lineChartConfig = {
    count: { label: "Count", color: "#A78BFA" },
} satisfies ChartConfig

const barChartConfig = {
    count: { label: "Opportunities", color: "#A78BFA" },
} satisfies ChartConfig

export function AdminDashboard({
    opportunities: initialOpportunities,
    users: initialUsers,
    submissions: initialSubmissions,
    messagesPerDay,
    usersPerDay,
    stats
}: Props) {
    const router = useRouter()
    const [opportunities, setOpportunities] = useState<Opportunity[]>(initialOpportunities)
    const [users, setUsers] = useState<User[]>(initialUsers)
    const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [form, setForm] = useState(EMPTY_FORM)

    // chart data
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

        setLoading(true)
        setError(null)
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
            }

            if (editingId) {
                const { data, error } = await supabase
                    .from("opportunities")
                    .update(payload as any)
                    .eq("id", editingId)
                    .select()
                    .single()
                if (error) throw error
                setOpportunities(prev => prev.map(o => o.id === editingId ? data : o))
                showSuccess("Opportunity updated successfully!")
            } else {
                const { data, error } = await supabase
                    .from("opportunities")
                    .insert(payload as any)
                    .select()
                    .single()
                if (error) throw error
                setOpportunities(prev => [data, ...prev])
                showSuccess("Opportunity added successfully!")
            }

            cancelForm()
            router.refresh()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.")
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
            const { error } = await supabase
                .from("opportunities")
                .update({ is_featured: !opp.is_featured } as any)
                .eq("id", opp.id)
            if (error) throw error
            setOpportunities(prev =>
                prev.map(o => o.id === opp.id ? { ...o, is_featured: !o.is_featured } : o)
            )
            showSuccess(`${opp.title} ${!opp.is_featured ? "featured" : "unfeatured"}.`)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update.")
        }
    }

    async function handleToggleAdmin(user: User) {
        if (!confirm(`${user.is_admin ? "Remove" : "Grant"} admin access for ${user.full_name}?`)) return
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase
                .from("profiles")
                .update({ is_admin: !user.is_admin } as any)
                .eq("id", user.id)
            if (error) throw error
            setUsers(prev =>
                prev.map(u => u.id === user.id ? { ...u, is_admin: !u.is_admin } : u)
            )
            showSuccess(`Admin access ${!user.is_admin ? "granted" : "removed"} for ${user.full_name}.`)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update.")
        }
    }

    async function handleMarkRead(id: string) {
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase
                .from("contact_submissions")
                .update({ read: true } as any)
                .eq("id", id)
            if (error) throw error
            setSubmissions(prev => prev.map(s => s.id === id ? { ...s, read: true } : s))
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to mark as read.")
        }
    }

    async function handleResolve(id: string) {
        const supabase = getSupaBrowserClient()
        try {
            const { error } = await supabase
                .from("contact_submissions")
                .update({ read: true, resolved: true } as any)
                .eq("id", id)
            if (error) throw error
            setSubmissions(prev => prev.map(s => s.id === id ? { ...s, read: true, resolved: true } : s))
            showSuccess("Submission marked as resolved.")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to resolve.")
        }
    }

    return (
        <div className="flex flex-col gap-4">
            {error && (
                <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-3">{error}</div>
            )}
            {success && (
                <div className="bg-primary/10 text-primary text-sm rounded-lg px-4 py-3">{success}</div>
            )}

            <Tabs defaultValue="stats">
                <TabsList className="grid grid-cols-5 w-full">
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
                </TabsList>

                {/* Statistics Tab */}
                <TabsContent value="stats" className="mt-6 flex flex-col gap-6">
                    {/* Stat Cards */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardContent className="pt-6 flex flex-col gap-2">
                                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                    <Users className="size-5" />
                                </div>
                                <p className="text-3xl font-bold">{stats.totalUsers}</p>
                                <p className="text-sm text-muted-foreground">Total Users</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6 flex flex-col gap-2">
                                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                    <Briefcase className="size-5" />
                                </div>
                                <p className="text-3xl font-bold">{stats.totalOpportunities}</p>
                                <p className="text-sm text-muted-foreground">Opportunities</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6 flex flex-col gap-2">
                                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                    <MessageCircle className="size-5" />
                                </div>
                                <p className="text-3xl font-bold">{stats.totalConversations}</p>
                                <p className="text-sm text-muted-foreground">Conversations</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6 flex flex-col gap-2">
                                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                    <BarChart3 className="size-5" />
                                </div>
                                <p className="text-3xl font-bold">{stats.totalMessages}</p>
                                <p className="text-sm text-muted-foreground">Messages Sent</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Charts */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        {/* Users over time */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">New Users (Last 30 Days)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {formattedUsers.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
                                ) : (
                                    <ChartContainer config={lineChartConfig} className="h-48 w-full">
                                        <LineChart data={formattedUsers}>
                                            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                                            <YAxis tick={{ fontSize: 10 }} />
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                            <Line
                                                type="monotone"
                                                dataKey="count"
                                                stroke="#A78BFA"
                                                strokeWidth={2}
                                                dot={false}
                                            />
                                        </LineChart>
                                    </ChartContainer>
                                )}
                            </CardContent>
                        </Card>

                        {/* Messages over time */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Messages Sent (Last 30 Days)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {formattedMessages.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
                                ) : (
                                    <ChartContainer config={lineChartConfig} className="h-48 w-full">
                                        <LineChart data={formattedMessages}>
                                            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                                            <YAxis tick={{ fontSize: 10 }} />
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                            <Line
                                                type="monotone"
                                                dataKey="count"
                                                stroke="#A78BFA"
                                                strokeWidth={2}
                                                dot={false}
                                            />
                                        </LineChart>
                                    </ChartContainer>
                                )}
                            </CardContent>
                        </Card>

                        {/* Opportunities by category */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Opportunities by Category</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={barChartConfig} className="h-48 w-full">
                                    <BarChart data={opportunitiesByCategory}>
                                        <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Bar dataKey="count" fill="#A78BFA" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>

                        {/* Submissions by type */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Contact Submissions by Type</CardTitle>
                            </CardHeader>
                            <CardContent className="flex items-center justify-center">
                                {submissionsByType.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-8">No submissions yet</p>
                                ) : (
                                    <div className="flex flex-col items-center gap-4 w-full">
                                        <ResponsiveContainer width="100%" height={160}>
                                            <PieChart>
                                                <Pie
                                                    data={submissionsByType}
                                                    dataKey="value"
                                                    nameKey="name"
                                                    cx="50%"
                                                    cy="50%"
                                                    outerRadius={70}
                                                >
                                                    {submissionsByType.map((_, index) => (
                                                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <ChartTooltip content={<ChartTooltipContent />} />
                                            </PieChart>
                                        </ResponsiveContainer>
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
                        <Button onClick={startAdd} className="gap-2">
                            <Plus className="size-4" />
                            Add Opportunity
                        </Button>
                    </div>

                    {showForm && (
                        <Card className="border-primary/30">
                            <CardHeader>
                                <CardTitle className="text-base">
                                    {editingId ? "Edit Opportunity" : "Add New Opportunity"}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Title *</label>
                                        <Input
                                            placeholder="e.g. Summer Research Internship"
                                            value={form.title}
                                            onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Organization</label>
                                        <Input
                                            placeholder="e.g. Columbia University"
                                            value={form.organization}
                                            onChange={(e) => setForm(f => ({ ...f, organization: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium">Description *</label>
                                    <Textarea
                                        placeholder="Describe the opportunity..."
                                        value={form.description}
                                        onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                                        rows={3}
                                    />
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Type *</label>
                                        <select
                                            value={form.category}
                                            onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        >
                                            {CATEGORIES.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Field</label>
                                        <select
                                            value={form.field}
                                            onChange={(e) => setForm(f => ({ ...f, field: e.target.value }))}
                                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        >
                                            <option value="">Select a field</option>
                                            {FIELDS.map(field => (
                                                <option key={field} value={field}>{field}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Location</label>
                                        <Input
                                            placeholder="e.g. New York, NY"
                                            value={form.location}
                                            onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">Deadline</label>
                                        <Input
                                            type="date"
                                            value={form.deadline}
                                            onChange={(e) => setForm(f => ({ ...f, deadline: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium">URL</label>
                                    <Input
                                        placeholder="https://..."
                                        value={form.url}
                                        onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))}
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setForm(f => ({ ...f, is_featured: !f.is_featured }))}
                                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${form.is_featured ? "bg-primary" : "bg-muted"}`}
                                    >
                                        <span className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-lg transition-transform ${form.is_featured ? "translate-x-4" : "translate-x-0"}`} />
                                    </button>
                                    <span className="text-sm text-muted-foreground">Feature this opportunity</span>
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <Button onClick={handleSaveOpportunity} disabled={loading} className="gap-2">
                                        <Check className="size-4" />
                                        {editingId ? "Save Changes" : "Add Opportunity"}
                                    </Button>
                                    <Button variant="outline" onClick={cancelForm}>
                                        <X className="size-4 mr-2" />
                                        Cancel
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <div className="flex flex-col gap-3">
                        {opportunities.map(opp => (
                            <Card key={opp.id} className={opp.is_featured ? "border-primary/30 bg-primary/5" : ""}>
                                <CardContent className="py-4 flex items-start justify-between gap-4">
                                    <div className="flex flex-col gap-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-semibold text-sm">{opp.title}</p>
                                            {opp.is_featured && <Badge className="text-xs">Featured</Badge>}
                                            <Badge variant="outline" className="text-xs">{opp.category}</Badge>
                                            {opp.field && <Badge variant="secondary" className="text-xs">{opp.field}</Badge>}
                                        </div>
                                        {opp.organization && (
                                            <p className="text-xs text-muted-foreground">{opp.organization}</p>
                                        )}
                                        <p className="text-xs text-muted-foreground line-clamp-1">{opp.description}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Button size="icon" variant="ghost" onClick={() => handleToggleFeatured(opp)}>
                                            {opp.is_featured
                                                ? <StarOff className="size-4 text-primary" />
                                                : <Star className="size-4" />
                                            }
                                        </Button>
                                        <Button size="icon" variant="ghost" onClick={() => startEdit(opp)}>
                                            <Pencil className="size-4" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => handleDeleteOpportunity(opp.id)}
                                            className="text-destructive hover:text-destructive"
                                        >
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
                                <CardContent className="py-4 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Avatar className="size-10 shrink-0">
                                            <AvatarImage src={user.avatar_url ?? ""} />
                                            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                                                {user.full_name?.[0] ?? "?"}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-semibold truncate">{user.full_name ?? "No name"}</p>
                                                {user.is_admin && <Badge className="text-xs">Admin</Badge>}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {user.grad_year ? `Class of ${user.grad_year}` : "No grad year"}
                                                {" · "}Joined {new Date(user.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Button
                                            size="sm"
                                            variant={user.is_admin ? "destructive" : "outline"}
                                            onClick={() => handleToggleAdmin(user)}
                                        >
                                            {user.is_admin ? "Remove Admin" : "Make Admin"}
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => router.push(`/profile/${user.id}`)}>
                                            View
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
                                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                                                {user.full_name?.[0] ?? "?"}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col">
                                            <p className="text-sm font-medium">{user.full_name ?? "No name"}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {new Date(user.created_at).toLocaleDateString()}
                                            </p>
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
                                            <p className="text-xs text-muted-foreground">
                                                {new Date(opp.created_at).toLocaleDateString()}
                                            </p>
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
                        <Card>
                            <CardContent className="py-12 text-center text-muted-foreground text-sm">
                                No contact submissions yet.
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {submissions.map(sub => (
                                <Card
                                    key={sub.id}
                                    className={
                                        sub.resolved
                                            ? "opacity-60"
                                            : !sub.read
                                                ? "border-primary/30 bg-primary/5"
                                                : ""
                                    }
                                >
                                    <CardContent className="py-4 flex flex-col gap-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-semibold">{sub.name}</p>
                                                    <Badge variant="outline" className="text-xs">{sub.category}</Badge>
                                                    {!sub.read && !sub.resolved && <Badge className="text-xs">New</Badge>}
                                                    {sub.resolved && (
                                                        <Badge variant="secondary" className="text-xs">Resolved</Badge>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    {sub.email} · {new Date(sub.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                            {!sub.resolved && (
                                                <div className="flex gap-2 shrink-0">
                                                    {!sub.read && (
                                                        <Button size="sm" variant="outline" onClick={() => handleMarkRead(sub.id)}>
                                                            Mark Read
                                                        </Button>
                                                    )}
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="gap-1 text-primary border-primary/30 hover:bg-primary/10"
                                                        onClick={() => handleResolve(sub.id)}
                                                    >
                                                        <CheckCircle2 className="size-3.5" />
                                                        Resolve
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
            </Tabs>
        </div>
    )
}