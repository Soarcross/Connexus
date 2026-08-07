import { redirect } from "next/navigation"
import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getCurrentChapter } from "@/lib/chapter"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent } from "@/app/components/ui/card"
import { ArrowRight, Users, Briefcase, Newspaper } from "lucide-react"

export default async function MarketingHomePage() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (user) redirect("/home")

    const chapter = await getCurrentChapter(supabase)

    if (chapter) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-24 flex flex-col items-center text-center gap-6">
                <p className="text-sm font-semibold text-primary uppercase tracking-wide">
                    {chapter.school_name}
                </p>
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
                    Welcome to the {chapter.name} chapter
                </h1>
                <p className="text-muted-foreground text-lg max-w-2xl">
                    Connect with {chapter.name} students and alumni, share opportunities, and grow your network &mdash; all in one place.
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
                    {/* chapter.name is operator-supplied and unbounded, so this
                        button has to be allowed to wrap. */}
                    <Button size="lg" className="w-full sm:w-auto whitespace-normal h-auto py-2.5 text-center sm:whitespace-nowrap" asChild>
                        <Link href="/signup">Join the {chapter.name} chapter</Link>
                    </Button>
                    <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
                        <Link href="/login">Log in</Link>
                    </Button>
                    <Button size="lg" variant="ghost" className="w-full sm:w-auto" asChild>
                        <Link href="/home">Continue as guest</Link>
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <>
            <section className="max-w-4xl mx-auto px-4 py-24 flex flex-col items-center text-center gap-6">
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
                    The networking platform for high schools everywhere
                </h1>
                <p className="text-muted-foreground text-lg max-w-2xl">
                    High School Connections helps students and alumni from your school connect, share career opportunities, and build their network &mdash; organized by chapter, one per school.
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
                    <Button size="lg" className="w-full sm:w-auto" asChild>
                        <Link href="/apply">
                            Start a chapter at your school <ArrowRight className="size-4 ml-1" />
                        </Link>
                    </Button>
                    <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
                        <Link href="/login">Log in</Link>
                    </Button>
                    <Button size="lg" variant="ghost" className="w-full sm:w-auto" asChild>
                        <Link href="/home">Continue as guest</Link>
                    </Button>
                </div>
            </section>

            <section className="max-w-5xl mx-auto px-4 pb-24 grid gap-6 sm:grid-cols-3">
                <Card>
                    <CardContent className="pt-6 flex flex-col items-center text-center gap-3">
                        <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <Users className="size-5" />
                        </div>
                        <p className="font-semibold">Find your people</p>
                        <p className="text-sm text-muted-foreground">
                            A directory of students and alumni from your own chapter, ready to connect.
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex flex-col items-center text-center gap-3">
                        <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <Briefcase className="size-5" />
                        </div>
                        <p className="font-semibold">Discover opportunities</p>
                        <p className="text-sm text-muted-foreground">
                            Internships, jobs, research and scholarships curated for your chapter, plus national listings.
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex flex-col items-center text-center gap-3">
                        <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <Newspaper className="size-5" />
                        </div>
                        <p className="font-semibold">Share with your community</p>
                        <p className="text-sm text-muted-foreground">
                            A moderated community board for posting and discovering opportunities together.
                        </p>
                    </CardContent>
                </Card>
            </section>
        </>
    )
}
