/**
 * Real-name validation and capitalization for `profiles.full_name`.
 *
 * Pure and dependency-free so it can run in client components (signup, profile
 * editor) and on the server. Callers should always persist the returned
 * `value` rather than the raw input, so names are stored normalized.
 */

const MIN_LENGTH = 3
const MAX_LENGTH = 60

/** Lowercased mid-name particles, e.g. "Ludwig van Beethoven". */
const PARTICLES = new Set([
    "van", "von", "der", "den", "de", "del", "della", "di", "da", "dos", "das",
    "du", "la", "le", "bin", "ibn", "al", "of", "y",
])

/** Roman-numeral suffixes, rendered in full caps. */
const NUMERAL_SUFFIXES = new Set(["ii", "iii", "iv", "v", "vi", "vii", "viii"])

/** Obvious placeholders — matched against the whole lowercased name. */
const BLOCKLIST = new Set([
    "test", "test test", "testing test", "test user", "asdf", "asdf asdf",
    "qwerty", "qwerty qwerty", "john doe", "jane doe", "anonymous",
    "anonymous user", "admin", "admin admin", "user", "user user", "fake",
    "fake name", "no name", "none", "abc", "abc abc", "xxx", "aaa", "first last",
    "firstname lastname", "your name", "n a",
])

/** Letters (incl. accented), space, hyphen, apostrophe, period. */
const ALLOWED_CHARS = /^[\p{L}\p{M}' \-.]+$/u
const HAS_DIGIT = /\d/
const VOWEL = /[aeiouyàáâäãåèéêëìíîïòóôöõùúûüæøœ]/i
const TRIPLE_LETTER = /(\p{L})\1\1/iu
const CONSONANT_RUN = /[bcdfghjklmnpqrstvwxz]{5}/i

type ValidationResult =
    | { ok: true; value: string }
    | { ok: false; error: string }

/** Title-cases a single hyphen/apostrophe-free chunk, honouring Mc/Mac. */
function capitalizeChunk(chunk: string): string {
    if (!chunk) return chunk
    const lower = chunk.toLowerCase()

    // McDonald / MacArthur — only when a real name-sized remainder follows.
    if (lower.startsWith("mc") && lower.length > 3) {
        return "Mc" + lower[2].toUpperCase() + lower.slice(3)
    }
    if (lower.startsWith("mac") && lower.length > 4) {
        return "Mac" + lower[3].toUpperCase() + lower.slice(4)
    }

    return lower[0].toUpperCase() + lower.slice(1)
}

/** Title-cases a whitespace-free token, splitting on hyphens and apostrophes. */
function capitalizeToken(token: string): string {
    return token
        .split("-")
        .map(part =>
            part
                .split("'")
                .map(capitalizeChunk)
                .join("'")
        )
        .join("-")
}

/**
 * Normalizes capitalization and whitespace: "  john   SMITH " → "John Smith".
 * Never rejects — use {@link validateFullName} for that.
 */
export function formatFullName(input: string): string {
    const tokens = input.trim().split(/\s+/).filter(Boolean)

    return tokens
        .map((token, i) => {
            const bare = token.replace(/\./g, "").toLowerCase()

            // Particles stay lowercase, but only when the author typed them that
            // way. Capitalizing is a real signal: "Nguyen Van An" is a Vietnamese
            // middle name, not a Dutch particle, and must survive untouched.
            const typedLowercase = token === token.toLowerCase()
            if (i > 0 && i < tokens.length - 1 && PARTICLES.has(bare) && typedLowercase) {
                return bare
            }
            if (NUMERAL_SUFFIXES.has(bare)) {
                return bare.toUpperCase() + (token.endsWith(".") ? "." : "")
            }
            return capitalizeToken(token)
        })
        .join(" ")
}

/**
 * Rejects names that are obviously not real (usernames, keyboard mashing,
 * placeholders, digits/symbols) and returns the properly capitalized form.
 */
export function validateFullName(input: string): ValidationResult {
    const value = formatFullName(input)

    if (!value) {
        return { ok: false, error: "Please enter your full name." }
    }
    if (value.length < MIN_LENGTH) {
        return { ok: false, error: `Your name must be at least ${MIN_LENGTH} characters.` }
    }
    if (value.length > MAX_LENGTH) {
        return { ok: false, error: `Your name must be ${MAX_LENGTH} characters or fewer.` }
    }
    if (HAS_DIGIT.test(value)) {
        return { ok: false, error: "Your name can't contain numbers. Please enter your real name." }
    }
    if (!ALLOWED_CHARS.test(value)) {
        return { ok: false, error: "Your name can only contain letters, spaces, hyphens and apostrophes." }
    }

    const tokens = value.split(" ")
    if (tokens.length < 2) {
        return { ok: false, error: "Please enter both your first and last name." }
    }
    if (BLOCKLIST.has(value.toLowerCase())) {
        return { ok: false, error: "That doesn't look like a real name. Please enter your real name." }
    }

    for (const token of tokens) {
        const bare = token.replace(/[.'-]/g, "")

        // Single letters are fine as initials ("J." / "J"), but not as a whole surname.
        if (bare.length < 2) {
            if (token === tokens[tokens.length - 1]) {
                return { ok: false, error: "Please enter your full last name, not an initial." }
            }
            continue
        }
        if (TRIPLE_LETTER.test(bare)) {
            return { ok: false, error: "That doesn't look like a real name. Please enter your real name." }
        }
        if (bare.length >= 4 && !VOWEL.test(bare)) {
            return { ok: false, error: "That doesn't look like a real name. Please enter your real name." }
        }
        if (CONSONANT_RUN.test(bare)) {
            return { ok: false, error: "That doesn't look like a real name. Please enter your real name." }
        }
    }

    return { ok: true, value }
}
