"use client"

import { useState } from "react"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Textarea } from "@/app/components/ui/textarea"
import { CheckCircle, Send, Mail, Bug, Lightbulb } from "lucide-react"

const CATEGORIES = [
    { label: "General Inquiry", icon: Mail },
    { label: "Report a Bug", icon: Bug },
    { label: "Request a Feature", icon: Lightbulb },
]

type Props = {
    userEmail: string
    userName: string
}

export default function ContactForm({ userEmail, userName }: Props) {
    const [name, setName] = useState(userName)
    const [email, setEmail] = useState(userEmail)
    const [category, setCategory] = useState("General Inquiry")
    const [message, setMessage] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [submitted, setSubmitted] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        if (!name || !email || !message) {
            setError("Please fill in all fields.")
            return
        }

        setLoading(true)
        const supabase = getSupaBrowserClient()

        try {
            const { error } = await supabase
                .from("contact_submissions")
                .insert({ name, email, category, message } as any)

            if (error) throw error
            setSubmitted(true)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    if (submitted) {
        return (
            <>
            <div className="relative z-10 min-h-[60vh] flex items-center justify-center">
                <div className="flex flex-col items-center gap-6 text-center max-w-md">
                    <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center">
                        <CheckCircle className="size-10 text-primary" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <h2 className="text-2xl font-bold">Message Received!</h2>
                        <p className="text-muted-foreground">
                            Thanks for reaching out. We'll get back to you as soon as possible.
                        </p>
                    </div>
                    <Button variant="outline" onClick={() => {
                        setSubmitted(false)
                        setMessage("")
                        setCategory("General Inquiry")
                    }}>
                        Send Another Message
                    </Button>
                </div>
            </div>
            </>
        )
    }

    return (
        <>
        <div className="relative z-10 max-w-2xl mx-auto flex flex-col gap-8">

            {/* Header */}
            <div className="flex flex-col gap-2 text-center">
                <h1 className="text-4xl font-bold tracking-tight">Get in Touch</h1>
                <p className="text-muted-foreground text-lg">
                    Have a question, bug to report, or idea? We'd love to hear from you.
                </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">

                {error && (
                    <div className="bg-destructive/10 text-destructive text-sm rounded-xl px-4 py-3 border border-destructive/20">
                        {error}
                    </div>
                )}

                {/* Name + Email */}
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold">Name</label>
                        <Input
                            placeholder="Your name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="h-11"
                            required
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold">Email</label>
                        <Input
                            type="email"
                            placeholder="your@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="h-11"
                            required
                        />
                    </div>
                </div>

                {/* Category */}
                <div className="flex flex-col gap-3">
                    <label className="text-sm font-semibold">Category</label>
                    <div className="grid grid-cols-3 gap-3">
                        {CATEGORIES.map(({ label, icon: Icon }) => (
                            <button
                                key={label}
                                type="button"
                                onClick={() => setCategory(label)}
                                className={`flex flex-col items-center gap-2 px-3 py-4 rounded-xl border-2 text-sm font-medium transition-all duration-200
                                    ${category === label
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

                {/* Message */}
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold">Message</label>
                    <Textarea
                        placeholder="Tell us what's on your mind..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={6}
                        required
                        maxLength={1000}
                        className="resize-none"
                    />
                    <p className="text-xs text-muted-foreground text-right">{message.length}/1000</p>
                </div>

                {/* Submit */}
                <Button type="submit" disabled={loading} className="h-11 gap-2 text-sm font-semibold">
                    {loading ? "Sending..." : (
                        <>
                            Send Message
                            <Send className="size-4" />
                        </>
                    )}
                </Button>
            </form>
        </div>
        </>
    )
}
