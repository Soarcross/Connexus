"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Input } from "@/app/components/ui/input"
import { Badge } from "@/app/components/ui/badge"
import { Card, CardContent } from "@/app/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Button } from "@/app/components/ui/button"
import { Search, X, SlidersHorizontal } from "lucide-react"
import { PageShell } from "@/app/components/layout/page-shell"

type Profile = {
    id: string
    full_name: string | null
    avatar_url: string | null
    grad_year: number | null
    interests: string[] | null
    looking_for: string[] | null
    club_roles: string[] | null
    bio: string | null
    chapter_id: string | null
    chapters: { name: string } | null
}

type Props = {
    profiles: Profile[]
    initialSearch: string
    viewerChapterId: string | null
    // Guests receive only the anon-granted columns (no looking_for/bio), so
    // hide the filter that would silently match nothing for them.
    isGuest?: boolean
}

const INTEREST_OPTIONS = [
    "Software Engineering", "Finance", "Medicine", "Law",
    "Research", "Design", "Entrepreneurship", "Data Science",
    "Cybersecurity", "Journalism", "Education", "Consulting",
    "Architecture", "Biology", "Physics", "Mathematics"
]

const LOOKING_FOR_OPTIONS = [
    "Internships", "Jobs", "Mentorship", "Networking", "Collaborators"
]

export function PeopleClient({ profiles, initialSearch, viewerChapterId, isGuest = false }: Props) {
    const router = useRouter()
    const [search, setSearch] = useState(initialSearch)
    const [selectedInterests, setSelectedInterests] = useState<string[]>([])
    const [selectedLookingFor, setSelectedLookingFor] = useState<string[]>([])
    const [gradYearFilter, setGradYearFilter] = useState("")
    const [clubRoleFilter, setClubRoleFilter] = useState("")
    const [showFilters, setShowFilters] = useState(false)
    const [showAllChapters, setShowAllChapters] = useState(false)
    const [allChaptersProfiles, setAllChaptersProfiles] = useState<Profile[] | null>(null)
    const [loadingAllChapters, setLoadingAllChapters] = useState(false)

    // The server only sends the viewer's own chapter by default (sending
    // every school's users on every page load regardless of the toggle
    // would leak the whole platform's PII) -- fetch the full cross-chapter
    // roster lazily, only the first time "All chapters" is actually toggled.
    async function handleToggleAllChapters() {
        if (showAllChapters) {
            setShowAllChapters(false)
            return
        }
        if (allChaptersProfiles === null) {
            setLoadingAllChapters(true)
            const supabase = getSupaBrowserClient()
            const { data } = await supabase
                .from("profiles")
                .select("id, full_name, avatar_url, grad_year, interests, looking_for, club_roles, bio, chapter_id, chapters(name)")
                .order("created_at", { ascending: false })
            setAllChaptersProfiles(data ?? [])
            setLoadingAllChapters(false)
        }
        setShowAllChapters(true)
    }

    const baseProfiles = showAllChapters && allChaptersProfiles ? allChaptersProfiles : profiles

    function toggleInterest(interest: string) {
        setSelectedInterests(prev =>
            prev.includes(interest)
                ? prev.filter(i => i !== interest)
                : [...prev, interest]
        )
    }

    function toggleLookingFor(option: string) {
        setSelectedLookingFor(prev =>
            prev.includes(option)
                ? prev.filter(i => i !== option)
                : [...prev, option]
        )
    }

    function clearFilters() {
        setSearch("")
        setSelectedInterests([])
        setSelectedLookingFor([])
        setGradYearFilter("")
        setClubRoleFilter("")
    }

    const hasActiveFilters =
        search ||
        selectedInterests.length > 0 ||
        selectedLookingFor.length > 0 ||
        gradYearFilter ||
        clubRoleFilter

    const filtered = useMemo(() => {
        return baseProfiles.filter(profile => {
            // search by name, interests, club roles
            if (search) {
                const q = search.toLowerCase()
                const matchesName = profile.full_name?.toLowerCase().includes(q)
                const matchesInterests = profile.interests?.some(i => i.toLowerCase().includes(q))
                const matchesRoles = profile.club_roles?.some(r => r.toLowerCase().includes(q))
                const matchesBio = profile.bio?.toLowerCase().includes(q)
                if (!matchesName && !matchesInterests && !matchesRoles && !matchesBio) return false
            }

            // filter by selected interests
            if (selectedInterests.length > 0) {
                const hasInterest = selectedInterests.some(i =>
                    profile.interests?.includes(i)
                )
                if (!hasInterest) return false
            }

            // filter by looking for
            if (selectedLookingFor.length > 0) {
                const hasLookingFor = selectedLookingFor.some(l =>
                    profile.looking_for?.includes(l)
                )
                if (!hasLookingFor) return false
            }

            // filter by grad year
            if (gradYearFilter) {
                if (profile.grad_year?.toString() !== gradYearFilter) return false
            }

            // filter by club role
            if (clubRoleFilter) {
                const q = clubRoleFilter.toLowerCase()
                const hasRole = profile.club_roles?.some(r =>
                    r.toLowerCase().includes(q)
                )
                if (!hasRole) return false
            }

            return true
        })
    }, [baseProfiles, search, selectedInterests, selectedLookingFor, gradYearFilter, clubRoleFilter])

    const filtersCard = (
        <Card size="sm">
            <CardContent className="flex flex-col gap-5">

                {/* Grad Year */}
                <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">Graduation Year</p>
                    <Input
                        placeholder="e.g. 2025"
                        value={gradYearFilter}
                        onChange={(e) => setGradYearFilter(e.target.value)}
                        type="number"
                        min={1970}
                        max={2035}
                    />
                </div>

                {/* Club Role */}
                <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">Club Role</p>
                    <Input
                        placeholder="e.g. Math Team"
                        value={clubRoleFilter}
                        onChange={(e) => setClubRoleFilter(e.target.value)}
                    />
                </div>

                {/* Interests */}
                <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">Career Interests</p>
                    <div className="flex flex-wrap gap-1.5">
                        {INTEREST_OPTIONS.map(interest => (
                            <Badge
                                key={interest}
                                variant={selectedInterests.includes(interest) ? "default" : "outline"}
                                className="cursor-pointer transition-colors"
                                onClick={() => toggleInterest(interest)}
                            >
                                {interest}
                            </Badge>
                        ))}
                    </div>
                </div>

                {/* Looking For */}
                {!isGuest && (
                    <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium">Looking For</p>
                        <div className="flex flex-wrap gap-1.5">
                            {LOOKING_FOR_OPTIONS.map(option => (
                                <Badge
                                    key={option}
                                    variant={selectedLookingFor.includes(option) ? "default" : "outline"}
                                    className="cursor-pointer transition-colors"
                                    onClick={() => toggleLookingFor(option)}
                                >
                                    {option}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}

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

            {/* Search + toggles */}
            <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[12rem]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name, interests, or club roles..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8 bg-card"
                    />
                </div>
                <Button
                    variant={showFilters ? "default" : "outline"}
                    onClick={() => setShowFilters(!showFilters)}
                    className="shrink-0 gap-1.5 lg:hidden"
                >
                    <SlidersHorizontal className="size-4" />
                    Filters
                    {hasActiveFilters && (
                        <span className="size-4 rounded-full bg-primary-foreground text-primary text-xs flex items-center justify-center font-bold">
                            !
                        </span>
                    )}
                </Button>
                {hasActiveFilters && (
                    <Button variant="ghost" size="icon" onClick={clearFilters} className="shrink-0 lg:hidden">
                        <X className="size-4" />
                    </Button>
                )}
                {viewerChapterId && (
                    <Button
                        variant={showAllChapters ? "default" : "outline"}
                        onClick={handleToggleAllChapters}
                        disabled={loadingAllChapters}
                        className="shrink-0"
                    >
                        {loadingAllChapters ? "Loading..." : showAllChapters ? "All chapters" : "My chapter"}
                    </Button>
                )}
            </div>

            {/* Filters inline on smaller screens (left rail hidden below lg) */}
            {showFilters && <div className="lg:hidden">{filtersCard}</div>}

            {/* Results Count */}
            <p className="text-sm text-muted-foreground">
                {filtered.length} {filtered.length === 1 ? "person" : "people"} found
            </p>

            {/* Grid */}
            {filtered.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground text-sm">
                        No people found matching your search.
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map(profile => (
                        <Card
                            key={profile.id}
                            className="cursor-pointer transition-shadow hover:shadow-md"
                            onClick={() => router.push(`/profile/${profile.id}`)}
                        >
                            <CardContent className="pt-6 flex flex-col gap-4">
                                <div className="flex items-center gap-3">
                                    <Avatar className="size-12">
                                        <AvatarImage src={profile.avatar_url ?? ""} />
                                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                            {profile.full_name?.[0] ?? "?"}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-col min-w-0">
                                        <p className="font-semibold text-sm truncate">
                                            {profile.full_name ?? "Anonymous"}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {profile.grad_year ? `Class of ${profile.grad_year}` : (profile.chapters?.name ?? "")}
                                        </p>
                                    </div>
                                </div>

                                {showAllChapters && profile.chapters?.name && (
                                    <Badge variant="outline" className="w-fit text-xs">{profile.chapters.name}</Badge>
                                )}

                                {profile.bio && (
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                        {profile.bio}
                                    </p>
                                )}

                                {profile.interests && profile.interests.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {profile.interests.slice(0, 3).map(interest => (
                                            <Badge key={interest} variant="secondary" className="text-xs">
                                                {interest}
                                            </Badge>
                                        ))}
                                        {profile.interests.length > 3 && (
                                            <Badge variant="outline" className="text-xs">
                                                +{profile.interests.length - 3}
                                            </Badge>
                                        )}
                                    </div>
                                )}

                                {profile.looking_for && profile.looking_for.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {profile.looking_for.map(option => (
                                            <Badge key={option} variant="outline" className="text-xs text-primary border-primary/30">
                                                {option}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
        </PageShell>
    )
}