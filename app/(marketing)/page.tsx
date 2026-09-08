import { redirect } from "next/navigation"
import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent } from "@/app/components/ui/card"
import { ArrowRight, Users, Briefcase, Newspaper } from "lucide-react"

export default async function MarketingHomePage() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (user) redirect("/home")

    return (
        <>
            <section className="max-w-4xl mx-auto px-4 py-24 flex flex-col items-center text-center gap-6">
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
                    The networking platform for high schools everywhere
                </h1>
                <p className="text-muted-foreground text-lg max-w-2xl">
                    Connexus helps students and alumni from your school connect, share career opportunities, and build their network &mdash; organized by chapter, one per school.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
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
                        <div className="size-10 border border-border flex items-center justify-center text-accent">
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
                        <div className="size-10 border border-border flex items-center justify-center text-accent">
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
                        <div className="size-10 border border-border flex items-center justify-center text-accent">
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
