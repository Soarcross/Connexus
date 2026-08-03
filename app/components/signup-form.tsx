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
import { PasswordInput } from "./ui/password-input"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { formatFullName, validateFullName } from "@/lib/name-validation"
import { useState } from "react"
import { useRouter } from "next/navigation"

type ChapterOption = {
  id: string
  name: string
  school_name: string
}

type Props = React.ComponentProps<"form"> & {
  chapterId?: string | null
  chapterName?: string | null
  chapters?: ChapterOption[]
}

export function SignupForm({
  className,
  chapterId: defaultChapterId,
  chapterName,
  chapters = [],
  ...props
}: Props) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [chapterId, setChapterId] = useState(defaultChapterId ?? "")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)


  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const nameResult = validateFullName(name)
    if (!nameResult.ok) {
      setError(nameResult.error)
      return
    }
    // Persist the normalized form ("john smith" -> "John Smith").
    setName(nameResult.value)

    if (!chapterId) {
      setError("Please select your chapter.")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.")
      return
    }

    setLoading(true)
    const supabase = getSupaBrowserClient()

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: nameResult.value,
          // chapter_role is intentionally never sent here — it must never be
          // client-trusted (see supabase/sql/001_chapters.sql section 4).
          // The DB trigger defaults it to 'member'; only the platform-admin
          // approve-chapter route can elevate a profile to chapter_admin.
          chapter_id: chapterId,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (!data.user) {
      setError("An account with this email may already exist. Check your inbox.")
      setLoading(false)
      return
    }

    setLoading(false)
    router.push("/verify-email")
  }

  async function handleGoogleSignup() {
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
    // No need to redirect — Supabase handles it via the OAuth flow
  }

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleEmailSignup}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-sm text-balance text-muted-foreground">
            {chapterName ? `You're joining the ${chapterName} chapter. ` : ""}
            Fill in the form below to create your account
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-500 text-center">{error}</p>
        )}

        <Field>
          <FieldLabel htmlFor="name">Full Name</FieldLabel>
          <Input
            id="name"
            type="text"
            placeholder="John Doe"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setName(formatFullName(name))}
          />
          <FieldDescription>
            Use your real first and last name so classmates can find you.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="chapter">School / Chapter</FieldLabel>
          <select
            id="chapter"
            required
            value={chapterId}
            onChange={(e) => setChapterId(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select your chapter&hellip;</option>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>{c.school_name}</option>
            ))}
          </select>
        </Field>
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
          <FieldDescription>
            We&apos;ll use this to contact you. We will not share your email
            with anyone else.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <PasswordInput
            id="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FieldDescription>Must be at least 8 characters long.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm-password">Confirm Password</FieldLabel>
          <PasswordInput
            id="confirm-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <FieldDescription>Please confirm your password.</FieldDescription>
        </Field>
        <Field>
          <Button type="submit" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </Field>

        <FieldSeparator>Or continue with</FieldSeparator>

        <Field>
          <Button
            variant="outline"
            type="button"
            onClick={handleGoogleSignup}
            disabled={loading}
          >
            <svg viewBox="0 0 48 48" className="size-5">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.7 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C33.7 6.1 29.1 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16.1 18.9 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C33.7 6.1 29.1 4 24 4c-7.7 0-14.3 4.4-17.7 10.7z" />
              <path fill="#4CAF50" d="M24 44c5.3 0 10.2-2 13.8-5.3l-6.4-5.2C29.5 35.9 26.9 37 24 37c-5.4 0-9.9-3.3-11.5-7.9l-6.5 5C9.6 39.5 16.3 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3-3.3 5.5-6.1 7.2l6.4 5.2C39.5 36.5 44 30.7 44 24c0-1.3-.1-2.7-.4-3.5z" />
            </svg>
            Sign up with Google
          </Button>
          <FieldDescription className="px-6 text-center">
            Already have an account? <a href="/login">Log in</a>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}