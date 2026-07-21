import {
    Briefcase,
    GraduationCap,
    FlaskConical,
    Trophy,
    Heart,
    BookOpen,
    Layers,
    Users,
    Calendar,
} from "lucide-react"

// Single source of truth for category chips across home, community,
// opportunities, and the admin dashboards. Chip classes are soft tints
// with dark-mode variants; the same class works for badges and icon chips.
export const CATEGORY_META: Record<string, { icon: React.ReactNode; chip: string }> = {
    Clubs: {
        icon: <Users className="size-4" />,
        chip: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
    },
    Events: {
        icon: <Calendar className="size-4" />,
        chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
    },
    Internships: {
        icon: <Briefcase className="size-4" />,
        chip: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    },
    Jobs: {
        icon: <GraduationCap className="size-4" />,
        chip: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    },
    Research: {
        icon: <FlaskConical className="size-4" />,
        chip: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    },
    Scholarships: {
        icon: <BookOpen className="size-4" />,
        chip: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    },
    Competitions: {
        icon: <Trophy className="size-4" />,
        chip: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    },
    Volunteering: {
        icon: <Heart className="size-4" />,
        chip: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
    },
    Programs: {
        icon: <Layers className="size-4" />,
        chip: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
    },
}

export const FALLBACK_CHIP = "bg-muted text-muted-foreground"

export function categoryChip(category: string | null | undefined): string {
    return (category && CATEGORY_META[category]?.chip) || FALLBACK_CHIP
}

export function categoryIcon(category: string | null | undefined): React.ReactNode {
    return (category && CATEGORY_META[category]?.icon) || <Layers className="size-4" />
}
