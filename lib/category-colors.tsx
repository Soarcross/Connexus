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
    CalendarClock,
    Bus,
    PiggyBank,
    Megaphone,
} from "lucide-react"

// Single source of truth for category labels across home, community,
// opportunities, and the admin dashboards.
//
// "Cream & Black" identity (2026-09): flat lowercase monospace labels, hard
// corners, no pastel pills. Categories are grouped into four buckets so the
// community feed still reads at a glance — work is an ink outline, events are
// teal, social is magenta, announcements are violet. Colours come from the
// theme's secondary palette (`--chart-cat-*` / `--accent`) via color-mix so
// both light and dark stay correct with no `dark:` variants.
const CHIP_BASE =
    "inline-flex items-center font-mono lowercase tracking-tight text-[11px] leading-tight px-1.5 py-px rounded-none"

const CHIP_WORK = `${CHIP_BASE} border border-border text-foreground`
const CHIP_EVENT = `${CHIP_BASE} text-[var(--chart-cat-4)] bg-[color-mix(in_srgb,var(--chart-cat-4)_14%,var(--background))]`
const CHIP_SOCIAL = `${CHIP_BASE} text-[var(--chart-cat-3)] bg-[color-mix(in_srgb,var(--chart-cat-3)_14%,var(--background))]`
const CHIP_NOTE = `${CHIP_BASE} text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_16%,var(--background))]`

export const CATEGORY_META: Record<string, { icon: React.ReactNode; chip: string }> = {
    Clubs: { icon: <Users className="size-4" />, chip: CHIP_SOCIAL },
    Events: { icon: <Calendar className="size-4" />, chip: CHIP_EVENT },
    // Chapter-page-only categories (chapter admins post these; they are not in
    // the national opportunities/home category lists on purpose).
    Meetings: { icon: <CalendarClock className="size-4" />, chip: CHIP_EVENT },
    Trips: { icon: <Bus className="size-4" />, chip: CHIP_EVENT },
    Fundraisers: { icon: <PiggyBank className="size-4" />, chip: CHIP_SOCIAL },
    Announcements: { icon: <Megaphone className="size-4" />, chip: CHIP_NOTE },
    Internships: { icon: <Briefcase className="size-4" />, chip: CHIP_WORK },
    Jobs: { icon: <GraduationCap className="size-4" />, chip: CHIP_WORK },
    Research: { icon: <FlaskConical className="size-4" />, chip: CHIP_WORK },
    Scholarships: { icon: <BookOpen className="size-4" />, chip: CHIP_WORK },
    Competitions: { icon: <Trophy className="size-4" />, chip: CHIP_WORK },
    Volunteering: { icon: <Heart className="size-4" />, chip: CHIP_SOCIAL },
    Programs: { icon: <Layers className="size-4" />, chip: CHIP_WORK },
}

export const FALLBACK_CHIP = `${CHIP_BASE} border border-border text-muted-foreground`

export function categoryChip(category: string | null | undefined): string {
    return (category && CATEGORY_META[category]?.chip) || FALLBACK_CHIP
}

export function categoryIcon(category: string | null | undefined): React.ReactNode {
    return (category && CATEGORY_META[category]?.icon) || <Layers className="size-4" />
}
