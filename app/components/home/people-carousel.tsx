"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent } from "@/app/components/ui/card"
import { ChevronLeft, ChevronRight } from "lucide-react"

type Person = {
    id: string
    full_name: string | null
    avatar_url: string | null
    grad_year: number | null
    interests: string[] | null
    looking_for: string[] | null
    club_roles: string[] | null
    bio: string | null
    score: number
}

type Props = {
    people: Person[]
    currentUserId: string
}

export function PeopleCarousel({ people, currentUserId }: Props) {
    const router = useRouter()
    const [index, setIndex] = useState(0)

    // show 3 at a time
    const pageSize = 3
    const totalPages = Math.ceil(people.length / pageSize)
    const currentPage = people.slice(index * pageSize, index * pageSize + pageSize)

    function prev() {
        setIndex(i => Math.max(0, i - 1))
    }

    function next() {
        setIndex(i => Math.min(totalPages - 1, i + 1))
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-4">
                {currentPage.map(person => (
                    <Card
                        key={person.id}
                        className="cursor-pointer hover:border-primary/50 transition-colors"
                        style={{ backgroundColor: "var(--opp-card-bg)", border: "2px solid black" }}
                        onClick={() => router.push(`/profile/${person.id}`)}
                    >
                        <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
                            <Avatar className="size-14">
                                <AvatarImage src={person.avatar_url ?? ""} />
                                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                                    {person.full_name?.[0] ?? "?"}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col gap-0.5 min-w-0 w-full">
                                <p className="font-semibold text-sm truncate">{person.full_name}</p>
                                {person.grad_year && (
                                    <p className="text-xs text-muted-foreground">
                                        Class of {person.grad_year}
                                    </p>
                                )}
                            </div>
                            {person.club_roles && person.club_roles.length > 0 && (
                                <div className="flex flex-wrap gap-1 justify-center">
                                    {person.club_roles.slice(0, 2).map(role => (
                                        <Badge key={role} variant="secondary" className="text-xs">
                                            {role}
                                        </Badge>
                                    ))}
                                    {person.club_roles.length > 2 && (
                                        <Badge variant="outline" className="text-xs">
                                            +{person.club_roles.length - 2}
                                        </Badge>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Navigation */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={prev}
                        disabled={index === 0}
                    >
                        <ChevronLeft className="size-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                        {index + 1} / {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={next}
                        disabled={index === totalPages - 1}
                    >
                        <ChevronRight className="size-4" />
                    </Button>
                </div>
            )}
        </div>
    )
}