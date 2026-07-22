import { NextRequest, NextResponse } from "next/server"
import { CHAPTER_SLUG_HEADER, ROOT_DOMAIN, DEV_HOSTS, SLUG_PATTERN } from "@/lib/chapter-shared"

function resolveSlug(request: NextRequest): string | null {
    const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase()

    if (process.env.NODE_ENV !== "production") {
        const queryChapter = request.nextUrl.searchParams.get("chapter")?.toLowerCase()
        if (queryChapter && SLUG_PATTERN.test(queryChapter)) return queryChapter
    }

    const isDevHost = DEV_HOSTS.some((devHost) => host === devHost || host.endsWith(`.${devHost}`))
    const root = isDevHost ? DEV_HOSTS.find((devHost) => host.endsWith(devHost)) : ROOT_DOMAIN
    if (!root) return null

    if (host === root || host === `www.${root}`) return null

    if (host.endsWith(`.${root}`)) {
        const subdomain = host.slice(0, -(`.${root}`.length))
        // guard against multi-level subdomains resolving to something unexpected
        if (subdomain && !subdomain.includes(".")) return subdomain
    }

    return null
}

export function proxy(request: NextRequest) {
    const slug = resolveSlug(request)

    const requestHeaders = new Headers(request.headers)
    if (slug) {
        requestHeaders.set(CHAPTER_SLUG_HEADER, slug)
    } else {
        requestHeaders.delete(CHAPTER_SLUG_HEADER)
    }

    return NextResponse.next({
        request: { headers: requestHeaders },
    })
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
