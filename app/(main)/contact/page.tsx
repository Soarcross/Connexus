"use client"

import { useState } from "react"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Textarea } from "@/app/components/ui/textarea"
import { Card, CardContent } from "@/app/components/ui/card"
import { Badge } from "@/app/components/ui/badge"
import { CheckCircle } from "lucide-react"

const CATEGORIES = ["General Inquiry", "Report a Bug", "Request a Feature"]

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
                .insert({
                    name,
                    email,
                    category,
                    message,
                } as any)

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
            <Card>
                <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
                    <CheckCircle className="size-12 text-primary" />
                    <div className="flex flex-col gap-1">
                        <h2 className="text-xl font-bold">Message Received!</h2>
                        <p className="text-muted-foreground text-sm">
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
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">

                    {error && (
                        <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-3">
                            {error}
                        </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium">Name</label>
                            <Input
                                placeholder="Your name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium">Email</label>
                            <Input
                                type="email"
                                placeholder="your@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">Category</label>
                        <div className="flex flex-wrap gap-2">
                            {CATEGORIES.map(cat => (
                                <Badge
                                    key={cat}
                                    variant={category === cat ? "default" : "outline"}
                                    className="cursor-pointer transition-colors"
                                    onClick={() => setCategory(cat)}
                                >
                                    {cat}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">Message</label>
                        <Textarea
                            placeholder="Tell us what's on your mind..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={5}
                            required
                            maxLength={1000}
                        />
                        <p className="text-xs text-muted-foreground text-right">
                            {message.length}/1000
                        </p>
                    </div>

                    <Button type="submit" disabled={loading}>
                        {loading ? "Sending..." : "Send Message"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}