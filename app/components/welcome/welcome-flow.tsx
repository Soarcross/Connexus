"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Camera, Check, Plus, Users } from "lucide-react"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { errorMessage } from "@/lib/error-message"
import { uploadAvatar, validateAvatarFile } from "@/lib/avatar-upload"
import { INTEREST_OPTIONS, currentClassYears, parseGradYear } from "@/lib/profile-options"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent } from "@/app/components/ui/card"
import { Input } from "@/app/components/ui/input"
import { Confetti } from "@/app/components/motion/Confetti"
import { cn } from "@/lib/utils"

type Step = "school" | "year" | "interests" | "photo"

type Props = {
    profile: {
        id: string
        fullName: string | null
        avatarUrl: string | null
        gradYear: number | null
        interests: string[]
        chapterId: string | null
    }
    chapters: { id: string; name: string; school_name: string }[]
}

const CLASS_LABELS = ["Senior", "Junior", "Sophomore", "Freshman"]

const STEP_COPY: Record<Step, { title: string; description: string }> = {
    school: {
        title: "Which school are you at?",
        description: "Connexus is organized by school chapter, so this decides who you'll see first.",
    },
    year: {
        title: "What's your class year?",
        description: "Classmates and people a year or two ahead are often the easiest first connections.",
    },
    interests: {
        title: "What are you into?",
        description: "Pick a few. We use them to suggest people who share them.",
    },
    photo: {
        title: "Add a profile photo",
        description: "People are far more likely to reply to someone with a face. You can skip this and add one later.",
    },
}

// Shared look for every selectable option in the flow: a real <button> with
// aria-pressed, so the whole flow works from a keyboard.
function optionClass(selected: boolean) {
    return cn(
        "inline-flex items-center gap-1.5 border px-3 py-2 text-sm text-left transition-colors",
        "outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring",
        selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background hover:bg-secondary"
    )
}

export function WelcomeFlow({ profile, chapters }: Props) {
    const router = useRouter()
    const firstName = profile.fullName?.trim().split(/\s+/)[0] || null

    // The school step only exists for chapterless members, and only when there
    // is a chapter to pick. Fixed at mount so the step count never jumps.
    const [steps] = useState<Step[]>(() => [
        ...(!profile.chapterId && chapters.length > 0 ? ["school" as const] : []),
        "year",
        "interests",
        "photo",
    ])
    const [stepIndex, setStepIndex] = useState(0)
    const [done, setDone] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [chapterId, setChapterId] = useState<string | null>(null)

    const classYears = currentClassYears()
    const savedYearIsListed = profile.gradYear !== null && classYears.includes(profile.gradYear)
    const [yearChoice, setYearChoice] = useState<number | "other" | null>(
        profile.gradYear === null ? null : savedYearIsListed ? profile.gradYear : "other"
    )
    const [otherYear, setOtherYear] = useState(
        profile.gradYear !== null && !savedYearIsListed ? String(profile.gradYear) : ""
    )

    const [interests, setInterests] = useState<string[]>(profile.interests)
    const [customInterest, setCustomInterest] = useState("")

    const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? "")
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Move focus to each new step's heading so keyboard and screen-reader
    // users land on the new question, not on a button that just vanished.
    const headingRef = useRef<HTMLHeadingElement>(null)
    const hasMoved = useRef(false)
    useEffect(() => {
        if (!hasMoved.current) return
        headingRef.current?.focus()
    }, [stepIndex, done])

    const step = steps[stepIndex]
    const copy = STEP_COPY[step]

    function goTo(index: number) {
        hasMoved.current = true
        setError(null)
        setStepIndex(index)
    }

    async function saveAndContinue() {
        // Enter in the "other year" box can fire while a save is in flight.
        if (saving || uploading) return
        setError(null)
        const supabase = getSupaBrowserClient()
        let update: { chapter_id?: string; grad_year?: number; interests?: string[] } | null = null

        if (step === "school") {
            // Skipping is allowed ("not listed"); only write when they picked one.
            if (chapterId) update = { chapter_id: chapterId }
        } else if (step === "year") {
            const year = yearChoice === "other" ? parseGradYear(otherYear) : yearChoice
            if (year === null) {
                setError(yearChoice === "other"
                    ? "Enter a four-digit year, like 2028."
                    : "Pick your class year to continue.")
                return
            }
            if (year !== profile.gradYear) update = { grad_year: year }
        } else if (step === "interests") {
            if (interests.length === 0) {
                setError("Pick at least one interest to continue.")
                return
            }
            update = { interests }
        }

        if (update) {
            setSaving(true)
            const { error: updateError } = await supabase
                .from("profiles")
                .update(update)
                .eq("id", profile.id)
            setSaving(false)
            if (updateError) {
                setError(errorMessage(updateError, "Couldn't save that. Please try again."))
                return
            }
        }

        if (stepIndex < steps.length - 1) {
            goTo(stepIndex + 1)
        } else {
            hasMoved.current = true
            setDone(true)
            // Re-render the server layout so the navbar picks up the new photo.
            router.refresh()
        }
    }

    function toggleInterest(interest: string) {
        setInterests(prev =>
            prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]
        )
    }

    function addCustomInterest() {
        const trimmed = customInterest.trim().replace(/\s+/g, " ")
        if (!trimmed) return
        const exists = interests.some(i => i.toLowerCase() === trimmed.toLowerCase())
        if (!exists) setInterests(prev => [...prev, trimmed.slice(0, 40)])
        setCustomInterest("")
    }

    async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
        const rawFile = e.target.files?.[0]
        e.target.value = ""
        if (!rawFile) return

        const invalid = validateAvatarFile(rawFile)
        if (invalid) {
            setError(invalid)
            return
        }
        setError(null)

        const previous = avatarUrl
        setAvatarUrl(URL.createObjectURL(rawFile))
        setUploading(true)
        try {
            setAvatarUrl(await uploadAvatar(getSupaBrowserClient(), profile.id, rawFile))
        } catch (err) {
            setAvatarUrl(previous)
            setError(errorMessage(err, "Failed to upload photo."))
        } finally {
            setUploading(false)
        }
    }

    if (done) {
        return (
            // overflow-visible: Card clips by default, which would cut the burst.
            <Card className="border-2 border-border overflow-visible">
                <CardContent className="flex flex-col items-center gap-6 text-center py-4">
                    <div className="relative flex items-center justify-center">
                        <Confetti />
                        <div className="stamp-in flex size-20 items-center justify-center border-2 border-border bg-accent text-accent-foreground">
                            <Check className="size-10" strokeWidth={2.5} />
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out [animation-delay:200ms] [animation-fill-mode:both]">
                        <h1
                            ref={headingRef}
                            tabIndex={-1}
                            className="text-3xl font-medium tracking-tight outline-none"
                        >
                            {firstName ? `You're all set, ${firstName}!` : "You're all set!"}
                        </h1>
                        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                            Your profile is ready, so Connexus can now suggest people who share your interests.
                        </p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out [animation-delay:320ms] [animation-fill-mode:both]">
                        <Button asChild>
                            <Link href="/home">
                                See who to meet <ArrowRight />
                            </Link>
                        </Button>
                        <Button variant="outline" asChild>
                            <Link href="/people">
                                <Users /> Browse people
                            </Link>
                        </Button>
                        <Button variant="ghost" asChild>
                            <Link href={`/profile/${profile.id}`}>View my profile</Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        )
    }

    const isLast = stepIndex === steps.length - 1
    const continueLabel = step === "photo"
        ? (avatarUrl ? "Finish" : "Skip for now")
        : step === "school" && !chapterId
            ? "My school isn't listed"
            : "Continue"

    return (
        <Card className="border-2 border-border">
            <CardContent className="flex flex-col gap-6">
                {/* Progress */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                            {stepIndex === 0 && firstName ? `Welcome to Connexus, ${firstName}` : "Welcome to Connexus"}
                        </span>
                        <span aria-hidden="true">Step {stepIndex + 1} of {steps.length}</span>
                    </div>
                    <div
                        role="progressbar"
                        aria-label="Profile setup"
                        aria-valuemin={1}
                        aria-valuemax={steps.length}
                        aria-valuenow={stepIndex + 1}
                        aria-valuetext={`Step ${stepIndex + 1} of ${steps.length}`}
                        className="flex gap-1"
                    >
                        {steps.map((s, i) => (
                            <div key={s} className="h-1.5 flex-1 bg-secondary overflow-hidden">
                                <div
                                    className={cn(
                                        "h-full w-full origin-left bg-primary transition-transform duration-[260ms] ease-[cubic-bezier(0.2,0,0,1)]",
                                        i <= stepIndex ? "scale-x-100" : "scale-x-0"
                                    )}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Step body — keyed so each step plays the standard entrance. */}
                <div
                    key={step}
                    className="flex flex-col gap-5 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out"
                >
                    <div className="flex flex-col gap-1">
                        <h1
                            ref={headingRef}
                            tabIndex={-1}
                            className="text-2xl sm:text-3xl font-medium tracking-tight outline-none"
                        >
                            {copy.title}
                        </h1>
                        <p className="text-sm text-muted-foreground">{copy.description}</p>
                    </div>

                    {step === "school" && (
                        <div className="flex flex-col gap-2">
                            {chapters.map(c => (
                                <button
                                    key={c.id}
                                    type="button"
                                    aria-pressed={chapterId === c.id}
                                    onClick={() => setChapterId(prev => prev === c.id ? null : c.id)}
                                    className={cn(optionClass(chapterId === c.id), "justify-between py-3")}
                                >
                                    <span className="flex flex-col">
                                        <span className="font-medium">{c.school_name}</span>
                                        <span className={cn("text-xs", chapterId === c.id ? "text-primary-foreground/80" : "text-muted-foreground")}>
                                            {c.name}
                                        </span>
                                    </span>
                                    {chapterId === c.id && <Check className="size-4 shrink-0" />}
                                </button>
                            ))}
                        </div>
                    )}

                    {step === "year" && (
                        <div className="flex flex-col gap-3">
                            <div className="grid grid-cols-2 gap-2">
                                {classYears.map((year, i) => (
                                    <button
                                        key={year}
                                        type="button"
                                        aria-pressed={yearChoice === year}
                                        onClick={() => setYearChoice(year)}
                                        className={cn(optionClass(yearChoice === year), "flex-col items-start gap-0 py-3")}
                                    >
                                        <span className="font-medium">Class of {year}</span>
                                        <span className={cn("text-xs", yearChoice === year ? "text-primary-foreground/80" : "text-muted-foreground")}>
                                            {CLASS_LABELS[i]}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                aria-pressed={yearChoice === "other"}
                                onClick={() => setYearChoice("other")}
                                className={cn(optionClass(yearChoice === "other"), "justify-center")}
                            >
                                A different year
                            </button>
                            {yearChoice === "other" && (
                                <Input
                                    inputMode="numeric"
                                    autoFocus
                                    aria-label="Class year"
                                    placeholder="e.g. 2025"
                                    maxLength={4}
                                    value={otherYear}
                                    onChange={e => setOtherYear(e.target.value.replace(/\D/g, ""))}
                                    onKeyDown={e => { if (e.key === "Enter") saveAndContinue() }}
                                    className="animate-in fade-in-0 duration-150"
                                />
                            )}
                        </div>
                    )}

                    {step === "interests" && (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap gap-2">
                                {[...INTEREST_OPTIONS, ...interests.filter(i => !INTEREST_OPTIONS.includes(i))].map(interest => {
                                    const selected = interests.includes(interest)
                                    return (
                                        <button
                                            key={interest}
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => toggleInterest(interest)}
                                            className={optionClass(selected)}
                                        >
                                            {selected && <Check className="size-3.5 animate-in zoom-in-50 duration-150" />}
                                            {interest}
                                        </button>
                                    )
                                })}
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    aria-label="Add your own interest"
                                    placeholder="Something else? Add it here"
                                    value={customInterest}
                                    maxLength={40}
                                    onChange={e => setCustomInterest(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === "Enter") {
                                            e.preventDefault()
                                            addCustomInterest()
                                        }
                                    }}
                                />
                                <Button type="button" variant="outline" onClick={addCustomInterest} className="shrink-0">
                                    <Plus /> Add
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground" aria-live="polite">
                                {interests.length === 0
                                    ? "Nothing picked yet."
                                    : `${interests.length} picked`}
                            </p>
                        </div>
                    )}

                    {step === "photo" && (
                        <div className="flex flex-col items-center gap-4 py-2">
                            <Avatar className={cn("size-28 border-2 border-border", uploading && "animate-pulse")}>
                                <AvatarImage src={avatarUrl || undefined} alt="" />
                                <AvatarFallback className="text-3xl bg-secondary text-foreground font-semibold">
                                    {profile.fullName?.trim()[0]?.toUpperCase() ?? "?"}
                                </AvatarFallback>
                            </Avatar>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleAvatarChange}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                disabled={uploading}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Camera />
                                {uploading ? "Uploading…" : avatarUrl ? "Choose a different photo" : "Upload a photo"}
                            </Button>
                            <p className="text-xs text-muted-foreground">JPG, PNG or GIF, up to 2MB.</p>
                        </div>
                    )}
                </div>

                {error && (
                    <div key={error} className="shake">
                        <p role="alert" className="bg-destructive/10 text-destructive text-sm px-4 py-3 text-center animate-in fade-in-0 duration-150">
                            {error}
                        </p>
                    </div>
                )}

                <div className="flex items-center gap-2">
                    {stepIndex > 0 && (
                        <Button type="button" variant="outline" onClick={() => goTo(stepIndex - 1)} disabled={saving || uploading}>
                            <ArrowLeft /> Back
                        </Button>
                    )}
                    <Button
                        type="button"
                        className="flex-1"
                        onClick={saveAndContinue}
                        disabled={saving || uploading}
                        variant={step === "photo" && !avatarUrl ? "outline" : "default"}
                    >
                        {saving ? "Saving…" : continueLabel}
                        {!saving && !isLast && <ArrowRight />}
                    </Button>
                </div>

                <p className="text-center text-xs text-muted-foreground">
                    <Link href="/home" className="underline-offset-4 hover:underline">
                        I&apos;ll finish this later
                    </Link>
                </p>
            </CardContent>
        </Card>
    )
}
