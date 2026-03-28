"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Input } from "@/app/components/ui/input"
import { Textarea } from "@/app/components/ui/textarea"
import { Camera, Pencil, X, Check } from "lucide-react"

type Profile = {
    id: string
    full_name: string | null
    avatar_url: string | null
    bio: string | null
    grad_year: number | null
    interests: string[] | null
    looking_for: string[] | null
    club_roles: string[] | null
}

type Props = {
    profile: Profile
    isOwnProfile: boolean
    userId: string | null
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

export function ProfileView({ profile, isOwnProfile }: Props) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    // track which section is being edited
    const [editingSection, setEditingSection] = useState<string | null>(null)

    // editable state - prefilled from profile
    const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "")
    const [avatarFile, setAvatarFile] = useState<File | null>(null)
    const [fullName, setFullName] = useState(profile.full_name ?? "")
    const [bio, setBio] = useState(profile.bio ?? "")
    const [gradYear, setGradYear] = useState(profile.grad_year?.toString() ?? "")
    const [interests, setInterests] = useState<string[]>(profile.interests ?? [])
    const [customInterest, setCustomInterest] = useState("")
    const [lookingFor, setLookingFor] = useState<string[]>(profile.looking_for ?? [])
    const [clubRoles, setClubRoles] = useState<string[]>(profile.club_roles ?? [])
    const [clubRoleInput, setClubRoleInput] = useState("")

    function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setAvatarFile(file)
        setAvatarUrl(URL.createObjectURL(file))
    }

    function toggleInterest(interest: string) {
        setInterests(prev =>
            prev.includes(interest)
                ? prev.filter(i => i !== interest)
                : [...prev, interest]
        )
    }

    function handleCustomInterestKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") {
            e.preventDefault()
            const trimmed = customInterest.trim()
            if (trimmed && !interests.includes(trimmed)) {
                setInterests(prev => [...prev, trimmed])
            }
            setCustomInterest("")
        }
    }

    function toggleLookingFor(option: string) {
        setLookingFor(prev =>
            prev.includes(option)
                ? prev.filter(i => i !== option)
                : [...prev, option]
        )
    }

    function handleClubRoleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") {
            e.preventDefault()
            const trimmed = clubRoleInput.trim()
            if (trimmed && !clubRoles.includes(trimmed)) {
                setClubRoles(prev => [...prev, trimmed])
            }
            setClubRoleInput("")
        }
    }

    function removeClubRole(role: string) {
        setClubRoles(prev => prev.filter(r => r !== role))
    }

    async function handleSave() {
        setError(null)
        setLoading(true)

        const supabase = getSupaBrowserClient()

        try {
            let finalAvatarUrl = avatarUrl

            if (avatarFile) {
                const fileExt = avatarFile.name.split(".").pop()
                const filePath = `${profile.id}/avatar.${fileExt}`

                const { error: uploadError } = await supabase.storage
                    .from("avatars")
                    .upload(filePath, avatarFile, { upsert: true })

                if (uploadError) throw uploadError

                const { data: { publicUrl } } = supabase.storage
                    .from("avatars")
                    .getPublicUrl(filePath)

                finalAvatarUrl = publicUrl
            }

            const { error: updateError } = await supabase
                .from("profiles")
                .update({
                    full_name: fullName,
                    avatar_url: finalAvatarUrl,
                    bio,
                    grad_year: parseInt(gradYear),
                    interests,
                    looking_for: lookingFor,
                    club_roles: clubRoles,
                } as any)
                .eq("id", profile.id)

            if (updateError) throw updateError

            setEditingSection(null)
            setSuccess(true)
            setTimeout(() => setSuccess(false), 3000)
            router.refresh()

        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col gap-6">

            {error && (
                <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-3 text-center">
                    {error}
                </div>
            )}

            {success && (
                <div className="bg-primary/10 text-primary text-sm rounded-lg px-4 py-3 text-center">
                    Profile updated successfully!
                </div>
            )}

            {/* Header Card — Avatar, Name, Grad Year */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-start gap-5">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                            <Avatar className="size-24">
                                <AvatarImage src={avatarUrl} />
                                <AvatarFallback className="text-2xl bg-primary/10 text-primary font-semibold">
                                    {fullName?.[0] ?? "?"}
                                </AvatarFallback>
                            </Avatar>
                            {isOwnProfile && (
                                <>
                                    <label
                                        htmlFor="avatar"
                                        className="absolute -bottom-1 -right-1 size-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors"
                                    >
                                        <Camera className="size-3.5" />
                                    </label>
                                    <input
                                        id="avatar"
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleAvatarChange}
                                    />
                                </>
                            )}
                        </div>

                        {/* Name and Grad Year */}
                        <div className="flex-1 flex flex-col gap-1">
                            {editingSection === "header" ? (
                                <div className="flex flex-col gap-2">
                                    <Input
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        placeholder="Full name"
                                        className="text-lg font-bold"
                                    />
                                    <Input
                                        type="number"
                                        value={gradYear}
                                        onChange={(e) => setGradYear(e.target.value)}
                                        placeholder="Graduation year"
                                        min={2000}
                                        max={2035}
                                        className="max-w-[140px]"
                                    />
                                </div>
                            ) : (
                                <>
                                    <h1 className="text-2xl font-bold">{fullName || "No name set"}</h1>
                                    <p className="text-sm text-muted-foreground">
                                        Stuyvesant High School
                                        {gradYear ? ` · Class of ${gradYear}` : ""}
                                    </p>
                                </>
                            )}
                        </div>

                        {/* Edit button */}
                        {isOwnProfile && (
                            <div className="flex gap-2 shrink-0">
                                {editingSection === "header" ? (
                                    <>
                                        <Button size="sm" onClick={handleSave} disabled={loading}>
                                            <Check className="size-4" />
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => setEditingSection(null)}>
                                            <X className="size-4" />
                                        </Button>
                                    </>
                                ) : (
                                    <Button size="sm" variant="outline" onClick={() => setEditingSection("header")}>
                                        <Pencil className="size-4" />
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Bio */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base">About</CardTitle>
                    {isOwnProfile && (
                        <div className="flex gap-2">
                            {editingSection === "bio" ? (
                                <>
                                    <Button size="sm" onClick={handleSave} disabled={loading}>
                                        <Check className="size-4" />
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setEditingSection(null)}>
                                        <X className="size-4" />
                                    </Button>
                                </>
                            ) : (
                                <Button size="sm" variant="outline" onClick={() => setEditingSection("bio")}>
                                    <Pencil className="size-4" />
                                </Button>
                            )}
                        </div>
                    )}
                </CardHeader>
                <CardContent>
                    {editingSection === "bio" ? (
                        <div className="flex flex-col gap-2">
                            <Textarea
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                placeholder="Tell others about yourself..."
                                rows={3}
                                maxLength={300}
                            />
                            <p className="text-xs text-muted-foreground text-right">{bio.length}/300</p>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            {bio || (isOwnProfile ? "Add a bio to tell others about yourself." : "No bio yet.")}
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Career Interests */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base">Career Interests</CardTitle>
                    {isOwnProfile && (
                        <div className="flex gap-2">
                            {editingSection === "interests" ? (
                                <>
                                    <Button size="sm" onClick={handleSave} disabled={loading}>
                                        <Check className="size-4" />
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setEditingSection(null)}>
                                        <X className="size-4" />
                                    </Button>
                                </>
                            ) : (
                                <Button size="sm" variant="outline" onClick={() => setEditingSection("interests")}>
                                    <Pencil className="size-4" />
                                </Button>
                            )}
                        </div>
                    )}
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {editingSection === "interests" ? (
                        <>
                            <div className="flex flex-wrap gap-2">
                                {INTEREST_OPTIONS.map(interest => (
                                    <Badge
                                        key={interest}
                                        variant={interests.includes(interest) ? "default" : "outline"}
                                        className="cursor-pointer transition-colors"
                                        onClick={() => toggleInterest(interest)}
                                    >
                                        {interest}
                                    </Badge>
                                ))}
                                {interests
                                    .filter(i => !INTEREST_OPTIONS.includes(i))
                                    .map(interest => (
                                        <Badge
                                            key={interest}
                                            variant="default"
                                            className="cursor-pointer"
                                            onClick={() => toggleInterest(interest)}
                                        >
                                            {interest} ×
                                        </Badge>
                                    ))
                                }
                            </div>
                            <Input
                                placeholder="Add a custom interest and press Enter"
                                value={customInterest}
                                onChange={(e) => setCustomInterest(e.target.value)}
                                onKeyDown={handleCustomInterestKeyDown}
                            />
                        </>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {interests.length > 0
                                ? interests.map(interest => (
                                    <Badge key={interest} variant="secondary">{interest}</Badge>
                                ))
                                : <p className="text-sm text-muted-foreground">
                                    {isOwnProfile ? "Add your career interests." : "No interests listed."}
                                </p>
                            }
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Looking For */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base">Looking For</CardTitle>
                    {isOwnProfile && (
                        <div className="flex gap-2">
                            {editingSection === "lookingFor" ? (
                                <>
                                    <Button size="sm" onClick={handleSave} disabled={loading}>
                                        <Check className="size-4" />
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setEditingSection(null)}>
                                        <X className="size-4" />
                                    </Button>
                                </>
                            ) : (
                                <Button size="sm" variant="outline" onClick={() => setEditingSection("lookingFor")}>
                                    <Pencil className="size-4" />
                                </Button>
                            )}
                        </div>
                    )}
                </CardHeader>
                <CardContent>
                    {editingSection === "lookingFor" ? (
                        <div className="flex flex-wrap gap-2">
                            {LOOKING_FOR_OPTIONS.map(option => (
                                <Badge
                                    key={option}
                                    variant={lookingFor.includes(option) ? "default" : "outline"}
                                    className="cursor-pointer transition-colors"
                                    onClick={() => toggleLookingFor(option)}
                                >
                                    {option}
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {lookingFor.length > 0
                                ? lookingFor.map(option => (
                                    <Badge key={option} variant="secondary">{option}</Badge>
                                ))
                                : <p className="text-sm text-muted-foreground">
                                    {isOwnProfile ? "Add what you're looking for." : "Nothing listed."}
                                </p>
                            }
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Club Roles */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base">Club Roles & Titles</CardTitle>
                    {isOwnProfile && (
                        <div className="flex gap-2">
                            {editingSection === "clubRoles" ? (
                                <>
                                    <Button size="sm" onClick={handleSave} disabled={loading}>
                                        <Check className="size-4" />
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setEditingSection(null)}>
                                        <X className="size-4" />
                                    </Button>
                                </>
                            ) : (
                                <Button size="sm" variant="outline" onClick={() => setEditingSection("clubRoles")}>
                                    <Pencil className="size-4" />
                                </Button>
                            )}
                        </div>
                    )}
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {editingSection === "clubRoles" ? (
                        <>
                            <div className="flex flex-wrap gap-2">
                                {clubRoles.map(role => (
                                    <Badge
                                        key={role}
                                        variant="secondary"
                                        className="cursor-pointer"
                                        onClick={() => removeClubRole(role)}
                                    >
                                        {role} ×
                                    </Badge>
                                ))}
                            </div>
                            <Input
                                placeholder="e.g. President of Math Team — press Enter to add"
                                value={clubRoleInput}
                                onChange={(e) => setClubRoleInput(e.target.value)}
                                onKeyDown={handleClubRoleKeyDown}
                            />
                        </>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {clubRoles.length > 0
                                ? clubRoles.map(role => (
                                    <Badge key={role} variant="secondary">{role}</Badge>
                                ))
                                : <p className="text-sm text-muted-foreground">
                                    {isOwnProfile ? "Add your club roles and titles." : "No club roles listed."}
                                </p>
                            }
                        </div>
                    )}
                </CardContent>
            </Card>

        </div>
    )
}