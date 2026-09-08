import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getServerUser } from "@/lib/supabase/user"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { PeopleCarousel } from "@/app/components/home/people-carousel"
import { categoryChip, categoryIcon } from "@/lib/category-colors"
import { activeFilter } from "@/lib/lifecycle"

const CATEGORIES = ["Internships", "Jobs", "Research", "Scholarships", "Competitions", "Volunteering", "Programs"]

export default async function HomePage() {
  const supabase = await createSupabaseServerClient()

  const user = await getServerUser(supabase)

  if (!user) {
    // Guest dashboard: real People carousel (anon-granted columns only) plus a
    // blurred placeholder opportunities section. No member-only data fetched.
    const { data: guestPeople } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, grad_year, interests, club_roles")
      .not("full_name", "is", null)
      .limit(12)

    const carouselPeople = (guestPeople ?? []).map(p => ({
      ...p,
      looking_for: null,
      bio: null,
      score: 0,
    }))

    return (
      <div className="flex flex-col gap-8">
        <Card className="border-2 border-border">
          <CardContent className="flex flex-col gap-2">
            <h1 className="text-3xl sm:text-4xl font-medium tracking-tight">Welcome, guest</h1>
            <p className="text-sm text-muted-foreground">
              You&apos;re browsing Connexus as a guest. Sign up to unlock opportunities, community posts and messaging.
            </p>
          </CardContent>
        </Card>

        {carouselPeople.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">People on Connexus</h2>
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" asChild>
                <Link href="/people">
                  See all <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
            <PeopleCarousel people={carouselPeople} currentUserId="" />
          </section>
        )}

        <section className="relative">
          <div className="blur-[6px] pointer-events-none select-none opacity-70" aria-hidden="true">
            <div className="flex flex-col gap-4">
              <h2 className="text-xl font-semibold tracking-tight">Opportunities of the Month</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {["Summer Research Program", "Software Engineering Internship", "Community Volunteering Day", "National Math Competition"].map(title => (
                  <Card key={title} size="sm">
                    <CardHeader className="pb-0">
                      <CardTitle className="text-sm font-semibold leading-snug">{title}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <div className="h-3.5 w-full rounded bg-muted" />
                      <div className="h-3.5 w-2/3 rounded bg-muted" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Card className="w-full max-w-sm mx-4 shadow-lg">
              <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
                <p className="font-semibold">Members see every opportunity</p>
                <p className="text-sm text-muted-foreground">
                  Peek at this month&apos;s <Link href="/opportunities" className="text-primary hover:underline">featured picks</Link> — or sign up free to browse them all.
                </p>
                <div className="flex gap-2">
                  <Button asChild><Link href="/signup">Sign up</Link></Button>
                  <Button variant="outline" asChild><Link href="/login">Log in</Link></Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    )
  }

  // fetch current user's profile for matching
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("full_name, interests, looking_for, club_roles, chapter_id, chapters(name)")
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
      // Chained .or() groups are ANDed by PostgREST: (chapter match) AND (not expired).
      const { data } = await (myChapterId
        ? baseQuery.or(`chapter_id.eq.${myChapterId},chapter_id.is.null`)
        : baseQuery.is("chapter_id", null)
      ).or(activeFilter()).order("created_at", { ascending: false }).limit(2)
      opportunitiesByCategory[category] = data ?? []
    })
  )

  const hasAnyOpportunities = CATEGORIES.some(
    (cat) => opportunitiesByCategory[cat].length > 0
  )

  const firstName = currentProfile?.full_name?.split(" ")[0] ?? null
  const chapterName = currentProfile?.chapters?.name ?? null

  return (
    <div className="flex flex-col gap-8">

      {/* Welcome banner */}
      <Card className="border-2 border-border">
        <CardContent className="flex flex-col gap-2">
          <h1 className="text-3xl sm:text-4xl font-medium tracking-tight">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            {chapterName
              ? `Here's what's happening in the ${chapterName} chapter.`
              : "Here's what's happening across Connexus."}
          </p>
        </CardContent>
      </Card>

      {/* Opportunities */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Opportunities of the Month</h2>
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" asChild>
            <Link href="/opportunities">
              View all <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        {!hasAnyOpportunities ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              No featured opportunities yet. Check back soon!
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            {[...CATEGORIES].sort((a, b) => opportunitiesByCategory[b].length - opportunitiesByCategory[a].length).map((category) => {
              const opps = opportunitiesByCategory[category]
              if (opps.length === 0) return null
              return (
                <div key={category} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="size-7 rounded-none border border-border flex items-center justify-center text-foreground">
                      {categoryIcon(category)}
                    </div>
                    <h3 className="font-semibold text-base">{category}</h3>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {opps.map((opp) => (
                      <Card key={opp.id} size="sm" className="transition-colors hover:bg-secondary">
                        <CardHeader className="pb-0">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-sm font-semibold leading-snug">
                              {opp.title}
                            </CardTitle>
                            <span className={`shrink-0 ${categoryChip(opp.category)}`}>
                              {opp.category}
                            </span>
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
                                <Button size="sm" variant="outline" className="text-xs h-7">
                                  Learn More --&gt;
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
      </section>

      {/* People Recommendations */}
      {recommendations.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Suggested Connections</h2>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" asChild>
              <Link href="/people">
                See all <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <PeopleCarousel people={recommendations} currentUserId={user?.id ?? ""} />
        </section>
      )}
    </div>
  )
}
