// Shared choices for the profile fields that drive suggested connections.
// The profile editor and the /welcome flow both read from here, so a new
// interest only has to be added once.

export const INTEREST_OPTIONS = [
    "Software Engineering", "Finance", "Medicine", "Law",
    "Research", "Design", "Entrepreneurship", "Data Science",
    "Cybersecurity", "Journalism", "Education", "Consulting",
    "Architecture", "Biology", "Physics", "Mathematics",
]

// Same bounds the profile editor's grad-year input uses.
export const GRAD_YEAR_MIN = 1970
export const GRAD_YEAR_MAX = 2035

/**
 * The four high-school class years that are still in school on `now`.
 * A school year runs roughly September to June, so from July onward the
 * senior class is next year's graduates.
 */
export function currentClassYears(now: Date = new Date()): number[] {
    const year = now.getFullYear()
    const seniors = now.getMonth() >= 6 ? year + 1 : year
    return [seniors, seniors + 1, seniors + 2, seniors + 3]
}

/** Parses a typed class year, or returns null when it is not a usable year. */
export function parseGradYear(input: string): number | null {
    const trimmed = input.trim()
    if (!/^\d{4}$/.test(trimmed)) return null
    const value = Number(trimmed)
    if (value < GRAD_YEAR_MIN || value > GRAD_YEAR_MAX) return null
    return value
}
