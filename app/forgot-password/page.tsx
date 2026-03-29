"use client"

import { useState } from "react"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Card, CardContent } from "@/app/components/ui/card"
import { ArrowLeft, CheckCircle } from "lucide-react"
import Link from "next/link"

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [sent, setSent] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)

        const supabase = getSupaBrowserClient()

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        })

        setLoading(false)

        if (error) {
            setError(error.message)
            return
        }

        setSent(true)
    }

    return (
        <div className="min-h-svh flex items-center justify-center p-6">
            <div className="w-full max-w-sm flex flex-col gap-6">
                <div className="flex flex-col gap-1 text-center">
                    <h1 className="text-2xl font-bold">Forgot your password?</h1>
                    <p className="text-sm text-muted-foreground">
                        Enter your email and we'll send you a reset link.
                    </p>
                </div>

                {sent ? (
                    <Card>
                        <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
                            <CheckCircle className="size-10 text-primary" />
                            <div className="flex flex-col gap-1">
                                <p className="font-semibold">Check your inbox</p>
                                <p className="text-sm text-muted-foreground">
                                    We sent a password reset link to {email}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <CardContent className="pt-6">
                            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                                {error && (
                                    <p className="text-sm text-destructive text-center">{error}</p>
                                )}
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium">Email</label>
                                    <Input
                                        type="email"
                                        placeholder="m@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                                <Button type="submit" disabled={loading}>
                                    {loading ? "Sending..." : "Send Reset Link"}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                )}

                <Link
                    href="/login"
                    className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="size-4" />
                    Back to login
                </Link>
            </div>
        </div>
    )
}