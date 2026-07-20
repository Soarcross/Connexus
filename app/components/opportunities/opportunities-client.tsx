"use client"

import { useState, useMemo } from "react"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card"
import { Input } from "@/app/components/ui/input"
import { Briefcase, GraduationCap, FlaskConical, Trophy, Heart, BookOpen, Search, X, ExternalLink, ChevronDown, ChevronUp, Layers } from "lucide-react"

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
    chapter_id: string | null
}

type Props = {
    opportunities: Opportunity[]
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    Internships: <Briefcase className="size-4" />,
    Jobs: <GraduationCap className="size-4" />,
    Research: <FlaskConical className="size-4" />,
    Scholarships: <BookOpen className="size-4" />,
    Competitions: <Trophy className="size-4" />,
    Volunteering: <Heart className="size-4" />,
    Programs: <Layers className="size-4" />,
}

const CATEGORIES = ["Internships", "Jobs", "Research", "Scholarships", "Competitions", "Volunteering", "Programs"]

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
    Internships:  { bg: "#3b82f6", text: "#ffffff" },
    Jobs:         { bg: "#22c55e", text: "#ffffff" },
    Research:     { bg: "#a855f7", text: "#ffffff" },
    Scholarships: { bg: "#f59e0b", text: "#ffffff" },
    Competitions: { bg: "#ef4444", text: "#ffffff" },
    Volunteering: { bg: "#14b8a6", text: "#ffffff" },
    Programs:     { bg: "#f97316", text: "#ffffff" },
}

const FIELDS = [
    "Computer Science", "Law", "Medicine", "Finance",
    "Engineering", "Research", "Business", "Design",
    "Journalism", "Education", "Biology", "Mathematics",
    "Cybersecurity", "Architecture", "Consulting", "Other"
]

export function OpportunitiesClient({ opportunities }: Props) {
    const [search, setSearch] = useState("")
    const [selectedCategories, setSelectedCategories] = useState<string[]>([])
    const [selectedFields, setSelectedFields] = useState<string[]>([])
    const [showFeaturedOnly, setShowFeaturedOnly] = useState(false)
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

    function toggleExpanded(id: string) {
        setExpandedIds(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    function toggleCategory(category: string) {
        setSelectedCategories(prev =>
            prev.includes(category)
                ? prev.filter(c => c !== category)
                : [...prev, category]
        )
    }

    function toggleField(field: string) {
        setSelectedFields(prev =>
            prev.includes(field)
                ? prev.filter(f => f !== field)
                : [...prev, field]
        )
    }

    function clearFilters() {
        setSearch("")
        setSelectedCategories([])
        setSelectedFields([])
        setShowFeaturedOnly(false)
    }

    const hasActiveFilters =
        search ||
        selectedCategories.length > 0 ||
        selectedFields.length > 0 ||
        showFeaturedOnly

    const filtered = useMemo(() => {
        return opportunities.filter(opp => {
            if (search) {
                const q = search.toLowerCase()
                const matchesTitle = opp.title.toLowerCase().includes(q)
                const matchesOrg = opp.organization?.toLowerCase().includes(q)
                const matchesDesc = opp.description.toLowerCase().includes(q)
                if (!matchesTitle && !matchesOrg && !matchesDesc) return false
            }
            if (selectedCategories.length > 0) {
                if (!selectedCategories.includes(opp.category)) return false
            }
            if (selectedFields.length > 0) {
                if (!opp.field || !selectedFields.includes(opp.field)) return false
            }
            if (showFeaturedOnly && !opp.is_featured) return false
            return true
        })
    }, [opportunities, search, selectedCategories, selectedFields, showFeaturedOnly])

    const grouped = useMemo(() => {
        const groups: Record<string, Opportunity[]> = {}
        CATEGORIES.forEach(cat => {
            const catOpps = filtered.filter(o => o.category === cat)
            if (catOpps.length > 0) groups[cat] = catOpps
        })
        return groups
    }, [filtered])

    return (
        <div className="flex flex-col gap-6">
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                    placeholder="Search opportunities..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                />
            </div>

            <Card>
                <CardContent className="pt-4 flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium">Type</p>
                        <div className="flex flex-wrap gap-2">
                            {CATEGORIES.map(cat => (
                                <Badge
                                    key={cat}
                                    variant={selectedCategories.includes(cat) ? "default" : "outline"}
                                    className="cursor-pointer transition-colors"
                                    onClick={() => toggleCategory(cat)}
                                >
                                    {cat}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium">Field</p>
                        <div className="flex flex-wrap gap-2">
                            {FIELDS.map(field => (
                                <Badge
                                    key={field}
                                    variant={selectedFields.includes(field) ? "default" : "outline"}
                                    className="cursor-pointer transition-colors"
                                    onClick={() => toggleField(field)}
                                >
                                    {field}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowFeaturedOnly(!showFeaturedOnly)}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors
                                    ${showFeaturedOnly ? "bg-primary" : "bg-muted"}`}
                            >
                                <span
                                    className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-lg transition-transform
                                        ${showFeaturedOnly ? "translate-x-4" : "translate-x-0"}`}
                                />
                            </button>
                            <span className="text-sm text-muted-foreground">Featured only</span>
                        </div>
                        {hasActiveFilters && (
                            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
                                <X className="size-3" />
                                Clear filters
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <p className="text-sm text-muted-foreground">
                {filtered.length} {filtered.length === 1 ? "opportunity" : "opportunities"} found
            </p>

            {Object.keys(grouped).length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground text-sm">
                        No opportunities found matching your filters.
                    </CardContent>
                </Card>
            ) : (
                <div className="flex flex-col gap-10">
                    {CATEGORIES.map(category => {
                        const opps = grouped[category]
                        if (!opps) return null
                        return (
                            <div key={category} className="flex flex-col gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="size-7 rounded-md flex items-center justify-center" style={{ backgroundColor: CATEGORY_COLORS[category]?.bg + "22", color: CATEGORY_COLORS[category]?.bg }}>
                                        {CATEGORY_ICONS[category]}
                                    </div>
                                    <h2 className="font-semibold text-lg">{category}</h2>
                                    <span className="text-sm text-muted-foreground">({opps.length})</span>
                                </div>
                                <div className="grid gap-6 sm:grid-cols-2">
                                    {opps.map(opp => (
                                        <Card
                                            key={opp.id}
                                            className="transition-colors hover:border-primary/50"
                                            style={{ backgroundColor: "var(--opp-card-bg)", border: "2px solid black" }}
                                        >
                                            <CardHeader className="pb-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <CardTitle className="text-sm font-semibold leading-snug">
                                                        {opp.title}
                                                    </CardTitle>
                                                    <div className="flex flex-col gap-1 items-end shrink-0">
                                                        {opp.is_featured && (
                                                            <Badge className="text-xs">Featured</Badge>
                                                        )}
                                                        {!opp.chapter_id && (
                                                            <Badge variant="outline" className="text-xs">National</Badge>
                                                        )}
                                                        <Badge variant="secondary" className="text-xs" style={{ backgroundColor: CATEGORY_COLORS[opp.category]?.bg, color: CATEGORY_COLORS[opp.category]?.text }}>
                                                            {opp.category}
                                                        </Badge>
                                                    </div>
                                                </div>
                                                {opp.organization && (
                                                    <CardDescription className="text-xs">
                                                        {opp.organization}
                                                        {opp.location ? ` · ${opp.location}` : ""}
                                                    </CardDescription>
                                                )}
                                            </CardHeader>
                                            <CardContent className="flex flex-col gap-3">
                                                {opp.field && (
                                                    <Badge variant="outline" className="text-xs w-fit">{opp.field}</Badge>
                                                )}
                                                <div>
                                                    <p className={`text-xs text-muted-foreground ${expandedIds.has(opp.id) ? "" : "line-clamp-3"}`}>
                                                        {opp.description}
                                                    </p>
                                                    {opp.description.length > 180 && (
                                                        <button
                                                            onClick={() => toggleExpanded(opp.id)}
                                                            className="mt-1 text-xs text-primary flex items-center gap-0.5 hover:underline"
                                                        >
                                                            {expandedIds.has(opp.id) ? (
                                                                <><ChevronUp className="size-3" />Show less</>
                                                            ) : (
                                                                <><ChevronDown className="size-3" />View full description</>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    {opp.deadline ? (
                                                        <span className="text-xs text-muted-foreground">
                                                            Due {new Date(opp.deadline).toLocaleDateString()}
                                                        </span>
                                                    ) : (
                                                        <span />
                                                    )}
                                                    {opp.url && (
                                                        <a href={opp.url} target="_blank" rel="noopener noreferrer">
                                                            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 transition-all duration-300 border-black text-black hover:bg-black hover:text-white dark:border-white dark:text-white dark:hover:bg-white dark:hover:text-black">
                                                                Apply
                                                                <ExternalLink className="size-3" />
                                                            </Button>
                                                        </a>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}