"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Card, CardContent } from "@/app/components/ui/card"

export default function ResetPasswordPage() {
    const router = useRouter()
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        if (password !== confirmPassword) {
            setError("Passwords do not match.")
            return
        }

        if (password.length < 8) {
            setError("Password must be at least 8 characters.")
            return
        }

        setLoading(true)
        const supabase = getSupaBrowserClient()

        const { error } = await supabase.auth.updateUser({ password })

        setLoading(false)

        if (error) {
            setError(error.message)
            return
        }

        router.push("/home")
        router.refresh()
    }

    return (
        <div className="min-h-svh flex items-center justify-center p-6">
            <div className="w-full max-w-sm flex flex-col gap-6">
                <div className="flex flex-col gap-1 text-center">
                    <h1 className="text-2xl font-bold">Reset your password</h1>
                    <p className="text-sm text-muted-foreground">
                        Enter your new password below.
                    </p>
                </div>
                <Card>
                    <CardContent className="pt-6">
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            {error && (
                                <p className="text-sm text-destructive text-center">{error}</p>
                            )}
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">New Password</label>
                                <Input
                                    type="password"
                                    placeholder="At least 8 characters"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Confirm Password</label>
                                <Input
                                    type="password"
                                    placeholder="Repeat your password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <Button type="submit" disabled={loading}>
                                {loading ? "Updating..." : "Update Password"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}