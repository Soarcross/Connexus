"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/app/components/ui/input"
import { Badge } from "@/app/components/ui/badge"
import { Card, CardContent } from "@/app/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Button } from "@/app/components/ui/button"
import { Search, X } from "lucide-react"

type Profile = {
    id: string
    full_name: string | null
    avatar_url: string | null
    grad_year: number | null
    interests: string[] | null
    looking_for: string[] | null
    club_roles: string[] | null
    bio: string | null
}

type Props = {
    profiles: Profile[]
    initialSearch: string
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

export function PeopleClient({ profiles, initialSearch }: Props) {
    const router = useRouter()
    const [search, setSearch] = useState(initialSearch)
    const [selectedInterests, setSelectedInterests] = useState<string[]>([])
    const [selectedLookingFor, setSelectedLookingFor] = useState<string[]>([])
    const [gradYearFilter, setGradYearFilter] = useState("")
    const [clubRoleFilter, setClubRoleFilter] = useState("")
    const [showFilters, setShowFilters] = useState(false)

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
        return profiles.filter(profile => {
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
    }, [profiles, search, selectedInterests, selectedLookingFor, gradYearFilter, clubRoleFilter])

    return (
        <div className="flex flex-col gap-6">

            {/* Search + Filter Toggle */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name, interests, or club roles..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8"
                    />
                </div>
                <Button
                    variant={showFilters ? "default" : "outline"}
                    onClick={() => setShowFilters(!showFilters)}
                    className="shrink-0"
                >
                    Filters
                    {hasActiveFilters && (
                        <span className="ml-1.5 size-4 rounded-full bg-primary-foreground text-primary text-xs flex items-center justify-center font-bold">
                            !
                        </span>
                    )}
                </Button>
                {hasActiveFilters && (
                    <Button variant="ghost" size="icon" onClick={clearFilters} className="shrink-0">
                        <X className="size-4" />
                    </Button>
                )}
            </div>

            {/* Filters Panel */}
            {showFilters && (
                <Card>
                    <CardContent className="pt-4 flex flex-col gap-5">

                        {/* Grad Year */}
                        <div className="flex flex-col gap-2">
                            <p className="text-sm font-medium">Graduation Year</p>
                            <Input
                                placeholder="e.g. 2025"
                                value={gradYearFilter}
                                onChange={(e) => setGradYearFilter(e.target.value)}
                                className="max-w-[160px]"
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
                                className="max-w-[240px]"
                            />
                        </div>

                        {/* Interests */}
                        <div className="flex flex-col gap-2">
                            <p className="text-sm font-medium">Career Interests</p>
                            <div className="flex flex-wrap gap-2">
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
                        <div className="flex flex-col gap-2">
                            <p className="text-sm font-medium">Looking For</p>
                            <div className="flex flex-wrap gap-2">
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

                    </CardContent>
                </Card>
            )}

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
                            className="cursor-pointer transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_4px_10px_rgba(0,0,0,0.35)] hover:bg-accent dark:hover:border-primary/50 dark:hover:shadow-none dark:hover:bg-accent"
                            style={{ border: "2px solid black" }}
                            onClick={() => router.push(`/profile/${profile.id}`)}
                        >
                            <CardContent className="pt-6 flex flex-col gap-4">
                                <div className="flex items-center gap-3">
                                    <Avatar className="size-12 border border-black/30 dark:border-0">
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
                                            {profile.grad_year ? `Class of ${profile.grad_year}` : "Stuyvesant"}
                                        </p>
                                    </div>
                                </div>

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
    )
}