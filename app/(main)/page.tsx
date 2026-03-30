import { createSupabaseServerClient } from "@/lib/supabase/server"
import { Badge } from "@/app/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import { Briefcase, GraduationCap, FlaskConical, Trophy, Heart, BookOpen, ArrowRight } from "lucide-react"
import Link from "next/link"
import { PeopleCarousel } from "@/app/components/home/people-carousel"

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Internships: <Briefcase className="size-4" />,
  Jobs: <GraduationCap className="size-4" />,
  Research: <FlaskConical className="size-4" />,
  Scholarships: <BookOpen className="size-4" />,
  Competitions: <Trophy className="size-4" />,
  Volunteering: <Heart className="size-4" />,
}

const CATEGORIES = ["Internships", "Jobs", "Research", "Scholarships", "Competitions", "Volunteering"]

export default async function HomePage() {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()

  // fetch current user's profile for matching
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("interests, looking_for, club_roles")
    .eq("id", user?.id ?? "")
    .single()

  // fetch all other profiles for recommendations
  const { data: allProfiles } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, grad_year, interests, looking_for, club_roles, bio")
    .neq("id", user?.id ?? "")
    .not("full_name", "is", null)

  // score each profile by how many interests/looking_for/club_roles overlap
  const scored = (allProfiles ?? []).map(profile => {
    let score = 0

    const myInterests = currentProfile?.interests ?? []
    const myLookingFor = currentProfile?.looking_for ?? []
    const myClubRoles = currentProfile?.club_roles ?? []

    myInterests.forEach(i => {
      if (profile.interests?.includes(i)) score += 2
    })
    myLookingFor.forEach(l => {
      if (profile.looking_for?.includes(l)) score += 1
    })
    myClubRoles.forEach(r => {
      if (profile.club_roles?.some((cr: string) => cr.toLowerCase().includes(r.toLowerCase()))) score += 1
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
      const { data } = await supabase
        .from("opportunities")
        .select("*")
        .eq("category", category)
        .eq("is_featured", true)
        .order("created_at", { ascending: false })
        .limit(2)
      opportunitiesByCategory[category] = data ?? []
    })
  )

  const hasAnyOpportunities = CATEGORIES.some(
    (cat) => opportunitiesByCategory[cat].length > 0
  )

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Welcome to Stuy Connections</h1>
        <p className="text-muted-foreground">
          Discover opportunities, connect with fellow Stuyvesant students and alumni.
        </p>
      </div>

      {/* People Recommendations */}
      {recommendations.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">People You May Know</h2>
            <Link href="/people">
              <Button variant="ghost" size="sm" className="gap-1">
                See all <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
          <PeopleCarousel people={recommendations} currentUserId={user?.id ?? ""} />
        </section>
      )}

      {/* Opportunities */}
      <section className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Opportunities of the Month</h2>
          <Link href="/opportunities">
            <Button variant="ghost" size="sm" className="gap-1">
              View all <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>

        {!hasAnyOpportunities ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              No featured opportunities yet. Check back soon!
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-8">
            {CATEGORIES.map((category) => {
              const opps = opportunitiesByCategory[category]
              if (opps.length === 0) return null
              return (
                <div key={category} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="size-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                      {CATEGORY_ICONS[category]}
                    </div>
                    <h3 className="font-semibold text-base">{category}</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {opps.map((opp) => (
                      <Card key={opp.id} className="hover:border-primary/50 transition-colors">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-sm font-semibold leading-snug">
                              {opp.title}
                            </CardTitle>
                            <Badge variant="secondary" className="shrink-0 text-xs">
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
                                <Button size="sm" variant="outline" className="text-xs h-7">
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
      </section>
    </div>
  )
}