import { LoginForm } from "../components/login-form"
import { WireframeGlobe } from "../components/login/wireframe-globe"
import { getChapterSlug } from "@/lib/chapter"

// `?error=` is set by app/auth/callback/route.ts when the OAuth/email code
// exchange fails. Without this map the redirect landed on a login page that
// rendered no message at all, so the failure looked like a page that had simply
// reloaded itself.
const ERROR_MESSAGES: Record<string, string> = {
    session_expired:
        "Your previous session had expired, so we signed you out. Please try signing in again — it should work this time.",
    auth_callback_failed:
        "We couldn't complete that sign-in. Please try again.",
}

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>
}) {
    const currentChapterSlug = await getChapterSlug()
    const { error } = await searchParams
    const errorMessage = error ? ERROR_MESSAGES[error] ?? ERROR_MESSAGES.auth_callback_failed : null

    return (
        <div className="grid min-h-svh lg:grid-cols-2">
            <div className="flex flex-col gap-4 p-6 md:p-10">
                <div className="flex justify-center gap-2 md:justify-start">
                    <a href="#" className="flex items-center gap-2 font-medium">
                        <img src="/brand/hsc-logo.svg" alt="High School Connections" className="size-9" />
                        High School Connections
                    </a>
                </div>
                <div className="flex flex-1 items-center justify-center">
                    <div className="w-full max-w-xs">
                        <LoginForm
                            currentChapterSlug={currentChapterSlug}
                            initialError={errorMessage}
                        />
                    </div>
                </div>
            </div>
            <div className="relative hidden bg-[#0d0f1a] lg:block">
                <WireframeGlobe />
            </div>
        </div>
    )
}
