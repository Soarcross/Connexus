import { createSupabaseServerClient } from "@/lib/supabase/server"
import { Badge } from "@/app/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import { Briefcase, GraduationCap, FlaskConical, Trophy, Heart, BookOpen, ArrowRight } from "lucide-react"
import Link from "next/link"
import { PeopleCarousel } from "@/app/components/home/people-carousel"
import { ParticleBackground } from "@/app/components/home/particle-background"
import { HeroTypewriter } from "@/app/components/home/hero-typewriter"

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Internships: <Briefcase className="size-4" />,
  Jobs: <GraduationCap className="size-4" />,
  Research: <FlaskConical className="size-4" />,
  Scholarships: <BookOpen className="size-4" />,
  Competitions: <Trophy className="size-4" />,
  Volunteering: <Heart className="size-4" />,
}

const CATEGORIES = ["Internships", "Jobs", "Research", "Scholarships", "Competitions", "Volunteering"]

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  Internships:  { bg: "#3b82f6", text: "#ffffff" }, // blue
  Jobs:         { bg: "#22c55e", text: "#ffffff" }, // green
  Research:     { bg: "#a855f7", text: "#ffffff" }, // purple
  Scholarships: { bg: "#f59e0b", text: "#ffffff" }, // amber
  Competitions: { bg: "#ef4444", text: "#ffffff" }, // red
  Volunteering: { bg: "#14b8a6", text: "#ffffff" }, // teal
}

export default async function HomePage() {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()

  // fetch current user's profile for matching
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("interests, looking_for, club_roles, chapter_id")
    .eq("id", user?.id ?? "")
    .single()

  const myChapterId = currentProfile?.chapter_id ?? null

  // fetch other profiles in the same chapter for recommendations
  // (a user without a chapter yet has no chapter-mates to recommend)
  const { data: allProfiles } = myChapterId
    ? await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, grad_year, interests, looking_for, club_roles, bio")
        .neq("id", user?.id ?? "")
        .not("full_name", "is", null)
        .eq("chapter_id", myChapterId)
    : { data: [] }

  // score each profile primarily by extracurricular (club_roles) overlap, then interests
  const scored = (allProfiles ?? []).map(profile => {
    let score = 0

    const myInterests = currentProfile?.interests ?? []
    const myClubRoles = currentProfile?.club_roles ?? []

    myClubRoles.forEach(r => {
      if (profile.club_roles?.some((cr: string) => cr.toLowerCase().includes(r.toLowerCase()))) score += 3
    })
    myInterests.forEach(i => {
      if (profile.interests?.includes(i)) score += 1
    })

    return { ...profile, score }
  })

  // sort by score descending, take top 9
  const recommendations = scored
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 9)

  // fetch opportunities
  const opportunitiesByCategory: Record<string, any[]> = {}
  await Promise.all(
    CATEGORIES.map(async (category) => {
      const baseQuery = supabase
        .from("opportunities")
        .select("*")
        .eq("category", category)
        .eq("is_featured", true)
      const { data } = await (myChapterId
        ? baseQuery.or(`chapter_id.eq.${myChapterId},chapter_id.is.null`)
        : baseQuery.is("chapter_id", null)
      ).order("created_at", { ascending: false }).limit(2)
      opportunitiesByCategory[category] = data ?? []
    })
  )

  const hasAnyOpportunities = CATEGORIES.some(
    (cat) => opportunitiesByCategory[cat].length > 0
  )

  return (
    <div className="flex flex-col gap-10">
      <ParticleBackground />

      {/* Hero — escape layout padding so it truly fills the viewport */}
      <section className="relative z-10 flex flex-col items-center justify-start text-center gap-4 -mx-4 -mt-8 px-4" style={{ height: "100vh", paddingTop: "35vh" }}>
        <div className="flex flex-col gap-4 items-center px-8 py-6 rounded-2xl backdrop-blur-sm">
          <h1 className="text-5xl font-bold tracking-tight">Welcome to High School Connections</h1>
          <HeroTypewriter />
        </div>
      </section>

      {/* Opportunities */}
      <section className="relative z-10 flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 sm:relative sm:flex-row sm:justify-center">
          <h2 className="text-3xl font-bold tracking-tight px-6 py-3 rounded-xl backdrop-blur-2xl bg-white/20 dark:bg-black/20">Opportunities of the Month</h2>
          <Link href="/opportunities" className="sm:absolute sm:right-0">
            <Button variant="ghost" size="sm" className="gap-1 backdrop-blur-2xl bg-white/20 dark:bg-black/20 rounded-xl hover:bg-black hover:text-white dark:hover:bg-black dark:hover:text-white">
              View all <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>

        {!hasAnyOpportunities ? (
          <Card className="dark:bg-zinc-800" style={{ backgroundColor: "var(--opp-card-bg)" }}>
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              No featured opportunities yet. Check back soon!
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-8">
            {[...CATEGORIES].sort((a, b) => opportunitiesByCategory[b].length - opportunitiesByCategory[a].length).map((category) => {
              const opps = opportunitiesByCategory[category]
              if (opps.length === 0) return null
              return (
                <div key={category} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="size-7 rounded-md flex items-center justify-center" style={{ backgroundColor: CATEGORY_COLORS[category]?.bg + "22", color: CATEGORY_COLORS[category]?.bg }}>
                      {CATEGORY_ICONS[category]}
                    </div>
                    <h3 className="font-semibold text-base">{category}</h3>
                  </div>
                  <div className="grid gap-6 sm:grid-cols-2">
                    {opps.map((opp) => (
                      <Card key={opp.id} className="hover:border-primary/50 transition-colors" style={{ backgroundColor: "var(--opp-card-bg)", border: "2px solid black" }}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-sm font-semibold leading-snug">
                              {opp.title}
                            </CardTitle>
                            <Badge variant="secondary" className="shrink-0 text-xs" style={{ backgroundColor: CATEGORY_COLORS[opp.category]?.bg, color: CATEGORY_COLORS[opp.category]?.text }}>
                              {opp.category}
                            </Badge>
                          </div>
                          {opp.organization && (
                            <CardDescription className="text-xs">{opp.organization}</CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                          <p className="text-xs text-muted-foreground line-clamp-2">{opp.description}</p>
                          <div className="flex items-center justify-between">
                            {opp.deadline && (
                              <span className="text-xs text-muted-foreground">
                                Due {new Date(opp.deadline).toLocaleDateString()}
                              </span>
                            )}
                            {opp.url && (
                              <a href={opp.url} target="_blank" rel="noopener noreferrer">
                                <Button size="sm" variant="outline" className="text-xs h-7 transition-all duration-300 border-black text-black hover:bg-black hover:text-white dark:border-white dark:text-white dark:hover:bg-white dark:hover:text-black">
                                  Learn more
                                </Button>
                              </a>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* People Recommendations */}
        {recommendations.length > 0 && (
          <section className="relative z-10 flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2 sm:relative sm:flex-row sm:justify-center">
              <h2 className="text-3xl font-bold tracking-tight px-6 py-3 rounded-xl backdrop-blur-2xl bg-white/20 dark:bg-black/20">Suggested Connections</h2>
              <Link href="/people" className="sm:absolute sm:right-0">
                <Button variant="ghost" size="sm" className="gap-1 backdrop-blur-2xl bg-white/20 dark:bg-black/20 rounded-xl hover:bg-black hover:text-white dark:hover:bg-black dark:hover:text-white">
                  See all <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
            <PeopleCarousel people={recommendations} currentUserId={user?.id ?? ""} />
          </section>
        )}
      </section>
    </div>
  )
}