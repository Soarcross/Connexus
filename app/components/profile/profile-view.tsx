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
import { MessageCircle, Mail, Sparkles } from "lucide-react"
import { Camera, Pencil, X, Check, ArrowRight, Plus } from "lucide-react"

type Profile = {
    id: string
    full_name: string | null
    avatar_url: string | null
    bio: string | null
    grad_year: number | null
    interests: string[] | null
    looking_for: string[] | null
    club_roles: string[] | null
    email?: string | null
    chapter_id?: string | null
    chapters?: { name: string; school_name: string } | null
}

type ChapterOption = {
    id: string
    name: string
    school_name: string
}

type Props = {
    profile: Profile
    isOwnProfile: boolean
    userId: string | null
    currentUserInterests?: string[]
    availableChapters?: ChapterOption[]
}

const INTEREST_OPTIONS = [
    "Software Engineering", "Finance", "Medicine", "Law",
    "Research", "Design", "Entrepreneurship", "Data Science",
    "Cybersecurity", "Journalism", "Education", "Consulting",
    "Architecture", "Biology", "Physics", "Mathematics"
]

const LOOKING_FOR_OPTIONS = [
    "Internships", "Jobs", "Mentorship", "Networking", "Collaborators", "Leadership"
]

export function ProfileView({ profile, isOwnProfile, userId, currentUserInterests = [], availableChapters = [] }: Props) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [editingSection, setEditingSection] = useState<string | null>(null)

    const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "")
    const [fullName, setFullName] = useState(profile.full_name ?? "")
    const [bio, setBio] = useState(profile.bio ?? "")
    const [gradYear, setGradYear] = useState(profile.grad_year?.toString() ?? "")
    const [chapterId, setChapterId] = useState(profile.chapter_id ?? "")
    const [interests, setInterests] = useState<string[]>(profile.interests ?? [])
    const [customInterest, setCustomInterest] = useState("")
    const [lookingFor, setLookingFor] = useState<string[]>(profile.looking_for ?? [])
    const [clubRoles, setClubRoles] = useState<string[]>(profile.club_roles ?? [])
    const [clubRoleInput, setClubRoleInput] = useState("")

    const [snapshot, setSnapshot] = useState<Record<string, unknown>>({})

    async function handleStartConversation() {
        if (!userId) return  // guard against null

        const supabase = getSupaBrowserClient()

        // check if conversation already exists
        const { data: existing } = await supabase
            .from("conversations")
            .select("id")
            .or(`and(participant_1.eq.${userId},participant_2.eq.${profile.id}),and(participant_1.eq.${profile.id},participant_2.eq.${userId})`)
            .maybeSingle()  // use maybeSingle instead of single so it doesn't error if not found

        if (existing) {
            router.push(`/messages/${existing.id}`)
            return
        }

        // create new conversation
        const { data: newConv, error } = await supabase
            .from("conversations")
            .insert({
                participant_1: userId,
                participant_2: profile.id,
            })
            .select("id")
            .single()

        if (error) {
            setError("Failed to start conversation. Please try again.")
            return
        }

        router.push(`/messages/${newConv.id}`)
    }

    function startEditing(section: string) {
        setSnapshot({
            fullName,
            bio,
            gradYear,
            interests: [...interests],
            lookingFor: [...lookingFor],
            clubRoles: [...clubRoles],
        })
        setEditingSection(section)
    }

    function cancelEditing() {
        setFullName(snapshot.fullName as string)
        setBio(snapshot.bio as string)
        setGradYear(snapshot.gradYear as string)
        setInterests(snapshot.interests as string[])
        setLookingFor(snapshot.lookingFor as string[])
        setClubRoles(snapshot.clubRoles as string[])
        setEditingSection(null)
    }

    // auto saves avatar immediately on file select
    async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        setAvatarUrl(URL.createObjectURL(file))
        setLoading(true)
        const supabase = getSupaBrowserClient()

        try {
            const fileExt = file.name.split(".").pop()
            const filePath = `${profile.id}/avatar-${Date.now()}.${fileExt}`

            // delete old avatar files to free up storage
            const { data: existingFiles } = await supabase.storage
                .from("avatars")
                .list(profile.id)

            if (existingFiles && existingFiles.length > 0) {
                const filesToDelete = existingFiles.map(f => `${profile.id}/${f.name}`)
                await supabase.storage.from("avatars").remove(filesToDelete)
            }

            // upload new avatar
            const { error: uploadError } = await supabase.storage
                .from("avatars")
                .upload(filePath, file)

            if (uploadError) throw uploadError

            const { data: { publicUrl } } = supabase.storage
                .from("avatars")
                .getPublicUrl(filePath)

            const { error: updateError } = await supabase
                .from("profiles")
                .update({ avatar_url: publicUrl } as any)
                .eq("id", profile.id)

            if (updateError) throw updateError

            setAvatarUrl(publicUrl)
            setSuccess(true)
            setTimeout(() => setSuccess(false), 3000)
            router.refresh()

        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to upload photo.")
        } finally {
            setLoading(false)
        }
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

    function addClubRole() {
        const trimmed = clubRoleInput.trim()
        if (trimmed && !clubRoles.includes(trimmed)) {
            setClubRoles(prev => [...prev, trimmed])
            setClubRoleInput("")
        }
    }

    function handleClubRoleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") {
            e.preventDefault()
            addClubRole()
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
            const { error: updateError } = await supabase
                .from("profiles")
                .update({
                    full_name: fullName,
                    bio,
                    grad_year: parseInt(gradYear),
                    interests,
                    looking_for: lookingFor,
                    club_roles: clubRoles,
                    ...(chapterId && !profile.chapter_id ? { chapter_id: chapterId } : {}),
                })
                .eq("id", profile.id)

            if (updateError) throw updateError

            setEditingSection(null)
            setSnapshot({})
            setSuccess(true)
            setTimeout(() => setSuccess(false), 3000)
            router.refresh()

        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.")
        } finally {
            setLoading(false)
        }
    }

    function EditButtons({ section }: { section: string }) {
        return (
            <div className="flex gap-2 shrink-0">
                {editingSection === section ? (
                    <>
                        <Button size="sm" onClick={handleSave} disabled={loading}>
                            <Check className="size-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEditing}>
                            <X className="size-4" />
                        </Button>
                    </>
                ) : (
                    <Button size="sm" variant="outline" onClick={() => startEditing(section)}>
                        <Pencil className="size-4" />
                    </Button>
                )}
            </div>
        )
    }

    const commonInterests = currentUserInterests.filter(i => profile.interests?.includes(i))

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

            {/* Common Interests Banner */}
            {!isOwnProfile && commonInterests.length > 0 && (
                <Card className="border-primary/40 bg-primary/5">
                    <CardContent className="py-4 flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-primary">
                            <Sparkles className="size-4 shrink-0" />
                            <span className="text-sm font-semibold">
                                {commonInterests.length} interest{commonInterests.length > 1 ? "s" : ""} in common
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {commonInterests.map(interest => (
                                <Badge key={interest} className="bg-primary/15 text-primary border border-primary/30 hover:bg-primary/20">
                                    {interest}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Header Card */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-start gap-5">
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

                        <div className="flex-1 flex flex-col gap-2">
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
                                        min={1970}
                                        max={2035}
                                        className="max-w-[140px]"
                                    />
                                    {!profile.chapter_id && availableChapters.length > 0 && (
                                        <select
                                            value={chapterId}
                                            onChange={(e) => setChapterId(e.target.value)}
                                            className="max-w-[280px] h-9 rounded-md border border-input bg-background px-3 text-sm"
                                        >
                                            <option value="">Select your chapter&hellip;</option>
                                            {availableChapters.map(c => (
                                                <option key={c.id} value={c.id}>{c.school_name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <h1 className="text-2xl font-bold">{fullName || "No name set"}</h1>
                                    <p className="text-sm text-muted-foreground">
                                        {profile.chapters?.school_name ?? "No chapter yet"}
                                        {gradYear ? ` · Class of ${gradYear}` : ""}
                                    </p>
                                    {!isOwnProfile && userId && (
                                        <div className="flex gap-2 mt-1">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="gap-2"
                                                onClick={handleStartConversation}
                                            >
                                                <MessageCircle className="size-4" />
                                                Message {fullName?.split(" ")[0]}
                                            </Button>

                                            {profile.email && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-2"
                                                    asChild
                                                >
                                                    <a
                                                        href={`https://mail.google.com/mail/?view=cm&to=${profile.email}&su=Hey ${fullName?.split(" ")[0]}!`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        <Mail className="size-4" />
                                                        Email
                                                    </a>
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {isOwnProfile && <EditButtons section="header" />}
                    </div>
                </CardContent>
            </Card>

            {/* Bio */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base">About</CardTitle>
                    {isOwnProfile && <EditButtons section="bio" />}
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
                    {isOwnProfile && <EditButtons section="interests" />}
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
                    {isOwnProfile && <EditButtons section="lookingFor" />}
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
                    <CardTitle className="text-base">Extracurricular Roles & Titles</CardTitle>
                    {isOwnProfile && <EditButtons section="clubRoles" />}
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {clubRoles.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {clubRoles.map(role => (
                                <Badge
                                    key={role}
                                    variant="secondary"
                                    className={editingSection === "clubRoles" ? "cursor-pointer" : ""}
                                    onClick={() => editingSection === "clubRoles" && removeClubRole(role)}
                                >
                                    {role} {editingSection === "clubRoles" && "×"}
                                </Badge>
                            ))}
                        </div>
                    )}
                    {editingSection === "clubRoles" ? (
                        <div className="flex gap-2">
                            <Input
                                placeholder="e.g. President of Math Team"
                                value={clubRoleInput}
                                onChange={(e) => setClubRoleInput(e.target.value)}
                                onKeyDown={handleClubRoleKeyDown}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addClubRole}
                                className="shrink-0 px-3"
                            >
                                <Plus className="size-4" />
                                Add
                            </Button>
                        </div>
                    ) : (
                        clubRoles.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                                {isOwnProfile ? "Add your club roles and titles." : "No club roles listed."}
                            </p>
                        )
                    )}
                </CardContent>
            </Card>

            {/* Next button */}
            {isOwnProfile && (
                <div className="pb-10">
                    <Button
                        className="w-full"
                        onClick={() => router.push("/home")}
                    >
                        Next: Go to Home
                        <ArrowRight className="size-4 ml-2" />
                    </Button>
                </div>
            )}

        </div>
    )
}

