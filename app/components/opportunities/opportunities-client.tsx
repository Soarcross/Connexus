"use client"

import { useState, useMemo } from "react"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card"
import { Input } from "@/app/components/ui/input"
import { Switch } from "@/app/components/ui/switch"
import { PageShell } from "@/app/components/layout/page-shell"
import { Search, X, ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react"
import { categoryChip, categoryIcon } from "@/lib/category-colors"
import { ArchiveBanner } from "@/app/components/lifecycle/archive-banner"
import { ExpiryBadge } from "@/app/components/lifecycle/expiry-badge"
import {
    ExtensionRequestDialog,
    type ExtensionTarget,
} from "@/app/components/lifecycle/extension-request-dialog"

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
    expires_at: string | null
    created_by: string | null
    is_featured: boolean
    created_at: string
    chapter_id: string | null
}

type Props = {
    opportunities: Opportunity[]
    /** Past their deadline, visible only to the author (or an admin). */
    archivedOpportunities?: Opportunity[]
    currentUserId?: string
    pendingExtensionOpportunityIds?: string[]
}

const CATEGORIES = ["Internships", "Jobs", "Research", "Scholarships", "Competitions", "Volunteering", "Programs"]

const FIELDS = [
    "Computer Science", "Law", "Medicine", "Finance",
    "Engineering", "Research", "Business", "Design",
    "Journalism", "Education", "Biology", "Mathematics",
    "Cybersecurity", "Architecture", "Consulting", "STEM", "Other"
]

export function OpportunitiesClient({
    opportunities,
    archivedOpportunities = [],
    currentUserId = "",
    pendingExtensionOpportunityIds = [],
}: Props) {
    const [extensionTarget, setExtensionTarget] = useState<ExtensionTarget | null>(null)
    const pendingExtensions = new Set(pendingExtensionOpportunityIds)
    const [search, setSearch] = useState("")
    const [selectedCategories, setSelectedCategories] = useState<string[]>([])
    const [selectedFields, setSelectedFields] = useState<string[]>([])
    const [showFeaturedOnly, setShowFeaturedOnly] = useState(false)
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

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

    const filtersCard = (
        <Card size="sm">
            <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">Type</p>
                    <div className="flex flex-wrap gap-1.5">
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
                    <div className="flex flex-wrap gap-1.5">
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

                <div className="flex items-center gap-2">
                    <Switch checked={showFeaturedOnly} onCheckedChange={setShowFeaturedOnly} />
                    <span className="text-sm text-muted-foreground">Featured only</span>
                </div>
                {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground w-fit">
                        <X className="size-3" />
                        Clear filters
                    </Button>
                )}
            </CardContent>
        </Card>
    )

    return (
        <PageShell left={filtersCard}>
        <div className="flex flex-col gap-4">
            <ExtensionRequestDialog
                target={extensionTarget}
                currentUserId={currentUserId}
                onClose={() => setExtensionTarget(null)}
            />

            {archivedOpportunities.length > 0 && (
                <div className="flex flex-col gap-3">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Archived — not visible to others
                    </h2>
                    {archivedOpportunities.map(opp => (
                        <Card key={opp.id} className="border-dashed border-destructive/50">
                            <CardContent className="py-4 flex flex-col gap-3">
                                <ArchiveBanner
                                    expiresAt={opp.expires_at}
                                    onExtend={() => setExtensionTarget({ entity: "opportunity", id: opp.id })}
                                    extensionPending={pendingExtensions.has(opp.id)}
                                />
                                <div className="flex flex-col gap-1 min-w-0">
                                    <p className="text-sm font-semibold">{opp.title}</p>
                                    {(opp.organization || opp.location) && (
                                        <p className="text-xs text-muted-foreground">
                                            {opp.organization}
                                            {opp.organization && opp.location ? " · " : ""}
                                            {opp.location}
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground line-clamp-2">{opp.description}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        placeholder="Search opportunities..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8 bg-card"
                    />
                </div>
                <Button
                    variant={mobileFiltersOpen ? "default" : "outline"}
                    size="sm"
                    className="lg:hidden gap-1.5"
                    onClick={() => setMobileFiltersOpen(o => !o)}
                >
                    <SlidersHorizontal className="size-4" />
                    Filters
                    {hasActiveFilters && (
                        <span className="size-4 rounded-none bg-primary-foreground text-primary text-xs flex items-center justify-center font-bold">
                            !
                        </span>
                    )}
                </Button>
                {hasActiveFilters && (
                    <Button variant="ghost" size="icon" onClick={clearFilters} className="lg:hidden shrink-0">
                        <X className="size-4" />
                    </Button>
                )}
            </div>

            {mobileFiltersOpen && <div className="lg:hidden">{filtersCard}</div>}

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
                                    <div className="size-7 rounded-none border border-border flex items-center justify-center text-foreground">
                                        {categoryIcon(category)}
                                    </div>
                                    <h2 className="font-semibold text-lg">{category}</h2>
                                    <span className="text-sm text-muted-foreground">({opps.length})</span>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {opps.map(opp => (
                                        <Card
                                            key={opp.id}
                                            size="sm"
                                            className="transition-colors hover:bg-secondary"
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
                                                        <span className={categoryChip(opp.category)}>
                                                            {opp.category}
                                                        </span>
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
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {opp.field && (
                                                        <Badge variant="outline" className="text-xs">{opp.field}</Badge>
                                                    )}
                                                    <ExpiryBadge expiresAt={opp.expires_at} />
                                                </div>
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
                                                            <Button size="sm" variant="outline" className="text-xs h-7">
                                                                Apply --&gt;
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
        </PageShell>
    )
}