import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent } from "@/app/components/ui/card"
import { ArrowRight, Briefcase, MessageCircle, Users, Megaphone } from "lucide-react"

export const metadata = {
    title: "Highschool Connections",
    description: "The network connecting high school students and alumni.",
}

const FEATURES = [
    {
        icon: <Users className="size-5" />,
        title: "People directory",
        body: "Find students and alumni by graduation year, interests, clubs and career field.",
    },
    {
        icon: <Briefcase className="size-5" />,
        title: "Opportunities",
        body: "A curated board of internships, jobs, research positions, scholarships and competitions.",
    },
    {
        icon: <Megaphone className="size-5" />,
        title: "Community board",
        body: "Share what you've found. Every post is reviewed before it reaches the feed.",
    },
    {
        icon: <MessageCircle className="size-5" />,
        title: "Direct messaging",
        body: "Reach out to someone a few years ahead of you and just ask.",
    },
]

/**
 * Public landing page at `/`. Deliberately lives outside the `(main)` route
 * group so it is not behind the auth gate in `app/(main)/layout.tsx`. The
 * signed-in dashboard is at `/home`.
 */
export default async function LandingPage() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    return (
        <div className="relative min-h-svh bg-background overflow-hidden">
            {/* Decorative wash — purely presentational, no client JS. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--color-primary)/12%,transparent_60%)]"
            />

            <div className="relative z-10 mx-auto flex max-w-5xl flex-col gap-24 px-6 py-16">

                <header className="flex items-center justify-between">
                    <span className="text-lg font-bold tracking-tight">Highschool Connections</span>
                    {!user && (
                        <Link href="/login">
                            <Button variant="ghost" size="sm">Log in</Button>
                        </Link>
                    )}
                </header>

                <section className="flex flex-col items-center gap-6 text-center">
                    <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
                        Highschool Connections
                    </h1>
                    <p className="max-w-2xl text-balance text-lg text-muted-foreground">
                        The network where high school students and the alumni who came before
                        them find each other — for opportunities, advice, and the introductions
                        that are hard to make cold.
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-3">
                        {user ? (
                            <Link href="/home">
                                <Button size="lg" className="gap-2">
                                    Go to your dashboard <ArrowRight className="size-4" />
                                </Button>
                            </Link>
                        ) : (
                            <>
                                <Link href="/signup">
                                    <Button size="lg" className="gap-2">
                                        Create an account <ArrowRight className="size-4" />
                                    </Button>
                                </Link>
                                <Link href="/login">
                                    <Button size="lg" variant="outline">Log in</Button>
                                </Link>
                            </>
                        )}
                    </div>
                </section>

                <section className="grid gap-6 sm:grid-cols-2">
                    {FEATURES.map(feature => (
                        <Card key={feature.title} className="backdrop-blur-sm bg-background/70">
                            <CardContent className="flex flex-col gap-2 py-6">
                                <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                                    {feature.icon}
                                </div>
                                <h2 className="font-semibold">{feature.title}</h2>
                                <p className="text-sm text-muted-foreground">{feature.body}</p>
                            </CardContent>
                        </Card>
                    ))}
                </section>

                <footer className="flex flex-col items-center gap-2 border-t border-border pt-8 text-center">
                    <p className="text-sm text-muted-foreground">
                        Already part of a school on the network?
                    </p>
                    <Link href={user ? "/home" : "/login"}>
                        <Button variant="link" className="gap-1">
                            {user ? "Continue to your dashboard" : "Log in to continue"}
                            <ArrowRight className="size-3.5" />
                        </Button>
                    </Link>
                </footer>
            </div>
        </div>
    )
}
