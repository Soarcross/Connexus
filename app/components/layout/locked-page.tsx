import Link from "next/link"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Avatar, AvatarFallback } from "@/app/components/ui/avatar"
import { Badge } from "@/app/components/ui/badge"
import { Lock } from "lucide-react"

type Variant = "opportunities" | "community" | "chapters" | "profile"

// Hardcoded sample data. Never real rows: a CSS blur over real data can be
// removed in dev tools, so nothing member-related is ever fetched here.
const SAMPLE_PEOPLE = ["Alex Rivera", "Jordan Lee", "Sam Patel", "Taylor Chen"]
const SAMPLE_ITEMS = [
    { title: "Summer Research Program", org: "University Lab", cat: "Research" },
    { title: "Software Engineering Internship", org: "Tech Startup", cat: "Internships" },
    { title: "Community Volunteering Day", org: "Local Nonprofit", cat: "Volunteering" },
    { title: "National Math Competition", org: "Math Society", cat: "Competitions" },
    { title: "Weekend Coding Workshop", org: "CS Club", cat: "Events" },
    { title: "College Essay Bootcamp", org: "Writing Center", cat: "Programs" },
]

function SampleGrid({ variant }: { variant: Variant }) {
    if (variant === "profile") {
        return (
            <div className="max-w-2xl mx-auto flex flex-col gap-4">
                <Card>
                    <CardContent className="pt-6 flex items-center gap-5">
                        <Avatar className="size-24"><AvatarFallback className="text-2xl">?</AvatarFallback></Avatar>
                        <div className="flex flex-col gap-2">
                            <div className="h-6 w-48 rounded bg-muted" />
                            <div className="h-4 w-32 rounded bg-muted" />
                        </div>
                    </CardContent>
                </Card>
                {["About", "Career Interests", "Looking For"].map(section => (
                    <Card key={section}>
                        <CardHeader><CardTitle className="text-base">{section}</CardTitle></CardHeader>
                        <CardContent className="flex flex-col gap-2">
                            <div className="h-4 w-full rounded bg-muted" />
                            <div className="h-4 w-2/3 rounded bg-muted" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }
    if (variant === "community") {
        return (
            <div className="max-w-2xl mx-auto flex flex-col gap-4">
                {SAMPLE_ITEMS.slice(0, 4).map((item, i) => (
                    <Card key={item.title}>
                        <CardContent className="pt-6 flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <Avatar className="size-9"><AvatarFallback>{SAMPLE_PEOPLE[i][0]}</AvatarFallback></Avatar>
                                <div className="flex flex-col">
                                    <span className="text-sm font-semibold">{SAMPLE_PEOPLE[i]}</span>
                                    <span className="text-xs text-muted-foreground">Class of 2027</span>
                                </div>
                            </div>
                            <p className="font-semibold text-sm">{item.title}</p>
                            <div className="h-4 w-full rounded bg-muted" />
                            <div className="h-4 w-3/4 rounded bg-muted" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }
    // opportunities + chapters share the card-grid look
    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SAMPLE_ITEMS.map(item => (
                <Card key={item.title}>
                    <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-sm font-semibold leading-snug">{item.title}</CardTitle>
                            <Badge variant="secondary" className="shrink-0 text-xs">{item.cat}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.org}</p>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        <div className="h-3.5 w-full rounded bg-muted" />
                        <div className="h-3.5 w-2/3 rounded bg-muted" />
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

export function LockedPage({ variant, title, description }: {
    variant: Variant
    title: string
    description: string
}) {
    return (
        <div className="relative">
            <div className="blur-[6px] pointer-events-none select-none opacity-70" aria-hidden="true">
                <SampleGrid variant={variant} />
            </div>
            <div className="absolute inset-0 flex items-start justify-center pt-16 sm:pt-24">
                <Card className="w-full max-w-sm mx-4 shadow-lg">
                    <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
                        <div className="size-12 border border-border flex items-center justify-center text-accent">
                            <Lock className="size-6" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <p className="font-semibold text-lg">{title}</p>
                            <p className="text-sm text-muted-foreground">{description}</p>
                        </div>
                        <div className="flex flex-col gap-2 w-full">
                            <Button asChild><Link href="/signup">Sign up</Link></Button>
                            <Button variant="outline" asChild><Link href="/login">Log in</Link></Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
