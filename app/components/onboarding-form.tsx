"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Textarea } from "@/app/components/ui/textarea"
import { Badge } from "@/app/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card"
import { User } from "@supabase/supabase-js"
import { Camera } from "lucide-react"

const INTEREST_OPTIONS = [
    "Software Engineering", "Finance", "Medicine", "Law",
    "Research", "Design", "Entrepreneurship", "Data Science",
    "Cybersecurity", "Journalism", "Education", "Consulting",
    "Architecture", "Biology", "Physics", "Mathematics"
]

const LOOKING_FOR_OPTIONS = [
    "Internships", "Jobs", "Mentorship", "Networking", "Collaborators"
]

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
    user: User
    profile: Profile | null
}

export function OnboardingForm({ user, profile }: Props) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "")
    const [avatarFile, setAvatarFile] = useState<File | null>(null)
    const [bio, setBio] = useState(profile?.bio ?? "")
    const [gradYear, setGradYear] = useState(profile?.grad_year?.toString() ?? "")
    const [interests, setInterests] = useState<string[]>(profile?.interests ?? [])
    const [customInterest, setCustomInterest] = useState("")
    const [lookingFor, setLookingFor] = useState<string[]>(profile?.looking_for ?? [])
    const [clubRoles, setClubRoles] = useState<string[]>(profile?.club_roles ?? [])
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

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        if (!gradYear) {
            setError("Graduation year is required.")
            return
        }

        const gradYearNum = parseInt(gradYear)
        if (isNaN(gradYearNum) || gradYearNum < 2000 || gradYearNum > 2035) {
            setError("Please enter a valid graduation year between 2000 and 2035.")
            return
        }

        if (interests.length === 0) {
            setError("Please select at least one career interest.")
            return
        }

        setLoading(true)
        const supabase = getSupaBrowserClient()

        try {
            let finalAvatarUrl = avatarUrl

            if (avatarFile) {
                const fileExt = avatarFile.name.split(".").pop()
                const filePath = `${user.id}/avatar.${fileExt}`

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
                    avatar_url: finalAvatarUrl,
                    bio,
                    grad_year: gradYearNum,
                    interests,
                    looking_for: lookingFor,
                    club_roles: clubRoles,
                })
                .eq("id", user.id)

            if (updateError) throw updateError

            router.push("/")
            router.refresh()

        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">

            {error && (
                <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-3 text-center">
                    {error}
                </div>
            )}

            {/* Avatar Upload */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Profile Photo</CardTitle>
                    <CardDescription>Optional — add a photo so people can recognize you</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-6">
                    <div className="relative">
                        <Avatar className="size-20">
                            <AvatarImage src={avatarUrl} />
                            <AvatarFallback className="text-xl bg-primary/10 text-primary font-semibold">
                                {profile?.full_name?.[0] ?? user.email?.[0]?.toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
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
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium">
                            {profile?.full_name ?? user.email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Click the camera icon to upload a photo
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Grad Year */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Graduation Year <span className="text-destructive">*</span>
                    </CardTitle>
                    <CardDescription>What year did or will you graduate from Stuyvesant?</CardDescription>
                </CardHeader>
                <CardContent>
                    <Input
                        id="grad-year"
                        type="number"
                        placeholder="2025"
                        value={gradYear}
                        onChange={(e) => setGradYear(e.target.value)}
                        min={2000}
                        max={2035}
                        className="max-w-[160px]"
                    />
                </CardContent>
            </Card>

            {/* Bio */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Bio <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                    </CardTitle>
                    <CardDescription>Tell others a bit about yourself</CardDescription>
                </CardHeader>
                <CardContent>
                    <Textarea
                        id="bio"
                        placeholder="e.g. Stuyvesant '25, interested in software engineering and finance. Currently looking for summer internships."
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={3}
                        maxLength={300}
                    />
                    <p className="text-xs text-muted-foreground mt-2 text-right">
                        {bio.length}/300
                    </p>
                </CardContent>
            </Card>

            {/* Career Interests */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Career Interests <span className="text-destructive">*</span>
                    </CardTitle>
                    <CardDescription>Select all that apply or add your own</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
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
                </CardContent>
            </Card>

            {/* Looking For */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Looking For <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                    </CardTitle>
                    <CardDescription>What are you hoping to find on Stuy Connections?</CardDescription>
                </CardHeader>
                <CardContent>
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
                </CardContent>
            </Card>

            {/* Club Roles */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Club Roles & Titles <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                    </CardTitle>
                    <CardDescription>Add any clubs or leadership positions you hold or have held</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
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
                </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex flex-col gap-3 pb-10">
                <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Saving your profile..." : "Complete Profile"}
                </Button>
                <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="text-sm text-muted-foreground hover:text-foreground text-center underline underline-offset-4 transition-colors"
                >
                    Skip for now
                </button>
            </div>

        </form>
    )
}