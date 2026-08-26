import Link from "next/link"
import Image from "next/image"
import { Button } from "@/app/components/ui/button"

export default function MarketingLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-svh bg-background flex flex-col">
            <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
                    <Link href="/" className="flex items-center gap-2 shrink-0">
                        <Image
                            src="/brand/hsc-logo.svg"
                            alt="Connexus"
                            width={32}
                            height={32}
                        />
                        <span className="hidden sm:inline font-bold text-base">Connexus</span>
                    </Link>

                    <div className="flex items-center gap-2">
                        {/* Hidden on phones to keep the header from overflowing;
                            the same link is in the footer and the hero CTA. */}
                        <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
                            <Link href="/apply">Start a chapter</Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/login">Log in</Link>
                        </Button>
                        <Button size="sm" asChild>
                            <Link href="/signup">Sign up</Link>
                        </Button>
                    </div>
                </div>
            </header>

            <main className="flex-1">
                {children}
            </main>

            <footer className="border-t py-8">
                <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
                    <p>&copy; {new Date().getFullYear()} Connexus</p>
                    <div className="flex items-center gap-4">
                        <Link href="/apply" className="hover:text-foreground transition-colors">Start a chapter</Link>
                        <Link href="/login" className="hover:text-foreground transition-colors">Log in</Link>
                    </div>
                </div>
            </footer>
        </div>
    )
}
