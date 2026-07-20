"use client";

import { cn } from "@/lib/utils"
import { Button } from "./ui/button"
import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
    FieldSeparator,
} from "./ui/field"
import { Input } from "./ui/input"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { useState } from "react"
import { useRouter } from "next/navigation"

export function LoginForm({
    className,
    ...props
}: React.ComponentProps<"form">) {
    const router = useRouter()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    async function handleEmailLogin(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)

        const supabase = getSupaBrowserClient()

        const { error } = await supabase.auth.signInWithPassword({ email, password })

        if (error) {
            setLoading(false)
            if (error.message === "Email not confirmed") {
                setError("Please check your inbox and confirm your email before logging in.")
                return
            }
            setError(error.message)
            return
        }

        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
            const { data: profile } = await supabase
                .from("profiles")
                .select("grad_year, interests")
                .eq("id", user.id)
                .single()

            // incomplete profile → send to their profile page to fill it out
            if (!(profile as any)?.grad_year || !(profile as any)?.interests?.length) {
                router.push(`/profile/${user.id}`)
                router.refresh()
                return
            }

            // complete profile → send to home
            router.push("/home")
            router.refresh()
            return
        }

        setLoading(false)
    }

    async function handleGoogleLogin() {
        setError(null)
        const supabase = getSupaBrowserClient()

        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        })

        if (error) {
            setError(error.message)
        }
    }

    return (
        <form
            className={cn("flex flex-col gap-6", className)}
            onSubmit={handleEmailLogin}
            {...props}
        >
            <FieldGroup>
                <div className="flex flex-col items-center gap-1 text-center">
                    <h1 className="text-2xl font-bold">Login to your account</h1>
                    <p className="text-sm text-balance text-muted-foreground">
                        Enter your email below to login to your account
                    </p>
                </div>

                {error && (
                    <p className="text-sm text-red-500 text-center">{error}</p>
                )}

                <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                        id="email"
                        type="email"
                        placeholder="m@example.com"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </Field>
                <Field>
                    <div className="flex items-center">
                        <FieldLabel htmlFor="password">Password</FieldLabel>
                        <a href="/forgot-password" className="ml-auto text-sm underline-offset-4 hover:underline">
                            Forgot your password?
                        </a>
                    </div>
                    <Input
                        id="password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </Field>
                <Field>
                    <Button type="submit" disabled={loading}>
                        {loading ? "Logging in..." : "Login"}
                    </Button>
                </Field>

                <FieldSeparator>Or continue with</FieldSeparator>

                <Field>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={loading}
                    >
                        <svg viewBox="0 0 48 48" className="size-5">
                            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.7 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C33.7 6.1 29.1 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
                            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16.1 18.9 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C33.7 6.1 29.1 4 24 4c-7.7 0-14.3 4.4-17.7 10.7z" />
                            <path fill="#4CAF50" d="M24 44c5.3 0 10.2-2 13.8-5.3l-6.4-5.2C29.5 35.9 26.9 37 24 37c-5.4 0-9.9-3.3-11.5-7.9l-6.5 5C9.6 39.5 16.3 44 24 44z" />
                            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3-3.3 5.5-6.1 7.2l6.4 5.2C39.5 36.5 44 30.7 44 24c0-1.3-.1-2.7-.4-3.5z" />
                        </svg>
                        Login with Google
                    </Button>
                    <FieldDescription className="text-center">
                        Don&apos;t have an account?{" "}
                        <a href="/signup" className="underline underline-offset-4">
                            Sign up
                        </a>
                    </FieldDescription>
                </Field>
            </FieldGroup>
        </form>
    )
}