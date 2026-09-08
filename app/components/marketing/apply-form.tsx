"use client"

import { useState } from "react"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Textarea } from "@/app/components/ui/textarea"
import { CheckCircle, Send, GraduationCap, User, Briefcase, Users } from "lucide-react"

const ROLES = [
    { label: "Student", icon: GraduationCap },
    { label: "Alum", icon: User },
    { label: "Teacher", icon: Briefcase },
    { label: "Parent", icon: Users },
]

export function ApplyForm() {
    const [applicantName, setApplicantName] = useState("")
    const [applicantEmail, setApplicantEmail] = useState("")
    const [applicantRole, setApplicantRole] = useState("Student")
    const [schoolName, setSchoolName] = useState("")
    const [city, setCity] = useState("")
    const [state, setState] = useState("")
    const [motivation, setMotivation] = useState("")
    const [website, setWebsite] = useState("") // honeypot
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [submitted, setSubmitted] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        if (!applicantName || !applicantEmail || !schoolName || !motivation) {
            setError("Please fill in all required fields.")
            return
        }

        setLoading(true)

        try {
            const res = await fetch("/api/apply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    applicant_name: applicantName,
                    applicant_email: applicantEmail,
                    applicant_role: applicantRole,
                    school_name: schoolName,
                    city,
                    state,
                    motivation,
                    website,
                }),
            })

            const json = await res.json()
            if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.")

            setSubmitted(true)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    if (submitted) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="flex flex-col items-center gap-6 text-center max-w-md">
                    <div className="size-20 border border-border flex items-center justify-center text-accent">
                        <CheckCircle className="size-10 text-primary" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <h2 className="text-2xl font-bold">Application received!</h2>
                        <p className="text-muted-foreground">
                            Thanks for your interest in starting a Connexus chapter. We&apos;ll review your application and follow up by email.
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-2xl mx-auto px-4 py-16 flex flex-col gap-8">
            <div className="flex flex-col gap-2 text-center">
                <h1 className="text-4xl font-bold tracking-tight">Start a chapter</h1>
                <p className="text-muted-foreground text-lg">
                    Bring Connexus to your school. Tell us a bit about yourself and we&apos;ll be in touch.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                {error && (
                    <div key={error} className="shake">
                        <div className="bg-destructive/10 text-destructive text-sm rounded-xl px-4 py-3 border border-destructive/20 animate-in fade-in-0 duration-150">
                            {error}
                        </div>
                    </div>
                )}

                {/* Honeypot — hidden from real users, left for bots to fill in */}
                <input
                    type="text"
                    name="website"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="absolute left-[-9999px] w-px h-px overflow-hidden"
                />

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold">Your name</label>
                        <Input
                            placeholder="Your name"
                            value={applicantName}
                            onChange={(e) => setApplicantName(e.target.value)}
                            className="h-11"
                            required
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold">Your email</label>
                        <Input
                            type="email"
                            placeholder="your@email.com"
                            value={applicantEmail}
                            onChange={(e) => setApplicantEmail(e.target.value)}
                            className="h-11"
                            required
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <label className="text-sm font-semibold">I am a</label>
                    <div className="grid grid-cols-4 gap-3">
                        {ROLES.map(({ label, icon: Icon }) => (
                            <button
                                key={label}
                                type="button"
                                onClick={() => setApplicantRole(label)}
                                className={`flex flex-col items-center gap-2 px-3 py-4 rounded-xl border-2 text-sm font-medium transition-all duration-200
                                    ${applicantRole === label
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                                    }`}
                            >
                                <Icon className="size-5" />
                                <span className="text-xs text-center leading-tight">{label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold">School name</label>
                    <Input
                        placeholder="e.g. Stuyvesant High School"
                        value={schoolName}
                        onChange={(e) => setSchoolName(e.target.value)}
                        className="h-11"
                        required
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold">City</label>
                        <Input
                            placeholder="City"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            className="h-11"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold">State</label>
                        <Input
                            placeholder="State"
                            value={state}
                            onChange={(e) => setState(e.target.value)}
                            className="h-11"
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold">Why do you want to start a chapter?</label>
                    <Textarea
                        placeholder="Tell us about your school's community and why you'd like to bring Connexus there..."
                        value={motivation}
                        onChange={(e) => setMotivation(e.target.value)}
                        rows={5}
                        required
                        maxLength={2000}
                        className="resize-none"
                    />
                    <p className="text-xs text-muted-foreground text-right">{motivation.length}/2000</p>
                </div>

                <Button type="submit" disabled={loading} className="h-11 gap-2 text-sm font-semibold">
                    {loading ? "Submitting..." : (
                        <>
                            Submit application
                            <Send className="size-4" />
                        </>
                    )}
                </Button>
            </form>
        </div>
    )
}
