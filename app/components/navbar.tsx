"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Input } from "@/app/components/ui/input"
import { Button } from "@/app/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { ThemeToggle } from "@/app/components/theme-toggle"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/app/components/ui/sheet"
import { Home, Users, Briefcase, Info, Mail, Search, LogOut, User, Menu, MessageCircle, Newspaper, School } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

type Props = {
    userId: string | null
    avatarUrl: string | null
    fullName: string | null
    isAdmin: boolean
    chapterName?: string | null
    isChapterAdmin?: boolean
}

const NAV_TABS = [
    { label: "Home", href: "/home", icon: Home },
    { label: "People", href: "/people", icon: Users },
    { label: "Opportunities", href: "/opportunities", icon: Briefcase },
    { label: "Chapters", href: "/chapters", icon: School },
    { label: "Community", href: "/community", icon: Newspaper },
]

const MENU_LINKS = [
    { label: "About", href: "/about", icon: Info },
    { label: "Contact", href: "/contact", icon: Mail },
]

export function Navbar({ userId, avatarUrl, fullName, isAdmin, chapterName, isChapterAdmin }: Props) {
    const router = useRouter()
    const pathname = usePathname()
    const [search, setSearch] = useState("")
    const [mobileOpen, setMobileOpen] = useState(false)
    const [unreadCount, setUnreadCount] = useState(0)

    useEffect(() => {
        if (!userId) return

        const supabase = getSupaBrowserClient()

        async function fetchUnreadCount() {
            const { count } = await supabase
                .from("messages")
                .select("id", { count: "exact", head: true })
                .eq("read", false)
                .neq("sender_id", userId)

            setUnreadCount(count ?? 0)
        }

        fetchUnreadCount()

        const channel = supabase
            .channel("unread-messages")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "messages" },
                () => fetchUnreadCount()
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "messages" },
                () => fetchUnreadCount()
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [userId])

    async function handleLogout() {
        const supabase = getSupaBrowserClient()
        await supabase.auth.signOut()
        router.push("/login")
        router.refresh()
    }

    function handleSearch(e: React.FormEvent) {
        e.preventDefault()
        if (search.trim()) {
            router.push(`/people?search=${encodeURIComponent(search.trim())}`)
            setMobileOpen(false)
        }
    }

    function tabClass(active: boolean) {
        return `relative flex h-14 flex-col items-center justify-center gap-0.5 px-3 text-[11px] font-medium transition-colors whitespace-nowrap ${
            active
                ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground"
                : "text-muted-foreground hover:text-foreground"
        }`
    }

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-card">
            <div className="max-w-[1128px] mx-auto px-4 h-14 flex items-center gap-3">

                {/* Logo */}
                <Link href={userId ? "/home" : "/"} className="shrink-0" aria-label="Home">
                    <Image
                        src="/brand/hsc-logo.svg"
                        alt="High School Connections"
                        width={34}
                        height={34}
                        priority
                    />
                </Link>

                {/* Search */}
                <form onSubmit={handleSearch} className="hidden sm:block w-[240px] lg:w-[280px]">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                        <Input
                            placeholder="Search people..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8 h-9 text-sm w-full border-transparent bg-muted focus-visible:bg-card"
                        />
                    </div>
                </form>

                {/* Desktop tabs */}
                <nav className="hidden md:flex items-stretch ml-auto">
                    {NAV_TABS.map(({ label, href, icon: Icon }) => (
                        <Link key={href} href={href} className={tabClass(pathname === href)}>
                            <Icon className="size-5" />
                            <span className="hidden lg:block">{label}</span>
                        </Link>
                    ))}
                    {userId && (
                        <Link href="/messages" className={tabClass(pathname.startsWith("/messages"))}>
                            <span className="relative">
                                <MessageCircle className="size-5" />
                                {unreadCount > 0 && (
                                    <span className="absolute -top-1 -right-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                                        {unreadCount > 9 ? "9+" : unreadCount}
                                    </span>
                                )}
                            </span>
                            <span className="hidden lg:block">Messages</span>
                        </Link>
                    )}
                </nav>

                {/* Right side */}
                <div className="shrink-0 flex items-center gap-1.5 md:ml-2 ml-auto">
                    <ThemeToggle />

                    {/* Account dropdown (members) / auth buttons (guests) */}
                    {!userId && (
                        <div className="hidden sm:flex items-center gap-1.5">
                            <Button variant="ghost" size="sm" asChild><Link href="/login">Log in</Link></Button>
                            <Button size="sm" asChild><Link href="/signup">Sign up</Link></Button>
                        </div>
                    )}
                    {userId && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                <Avatar className="size-8 cursor-pointer">
                                    <AvatarImage src={avatarUrl ?? ""} />
                                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                                        {fullName?.[0] ?? "?"}
                                    </AvatarFallback>
                                </Avatar>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="flex flex-col">
                                <span className="font-semibold">{fullName ?? "Account"}</span>
                                {chapterName && (
                                    <span className="text-xs font-normal text-muted-foreground">{chapterName}</span>
                                )}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => router.push(`/profile/${userId}`)}>
                                <User className="size-4 mr-2" />
                                My Profile
                            </DropdownMenuItem>
                            {MENU_LINKS.map(({ label, href, icon: Icon }) => (
                                <DropdownMenuItem key={href} onClick={() => router.push(href)}>
                                    <Icon className="size-4 mr-2" />
                                    {label}
                                </DropdownMenuItem>
                            ))}
                            {isChapterAdmin && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => router.push("/chapter-admin")}>
                                        Chapter Admin
                                    </DropdownMenuItem>
                                </>
                            )}
                            {isAdmin && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => router.push("/admin")}>
                                        Admin Dashboard
                                    </DropdownMenuItem>
                                </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                                <LogOut className="size-4 mr-2" />
                                Log out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    )}

                    {/* Mobile menu */}
                    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                        <SheetTrigger asChild>
                            <button
                                className="md:hidden p-1.5 rounded-md hover:bg-muted transition-colors"
                                aria-label="Open menu"
                            >
                                <Menu className="size-5" />
                            </button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-72">
                            <SheetHeader>
                                <SheetTitle className="text-left text-sm">
                                    {fullName ?? (userId ? "Menu" : "Welcome, guest")}
                                    {chapterName && (
                                        <span className="block text-xs font-normal text-muted-foreground">{chapterName}</span>
                                    )}
                                </SheetTitle>
                            </SheetHeader>
                            {/* min-h-0 is load-bearing: without it the flex item's
                                min-height:auto floors it at content height and
                                overflow-y-auto never engages (landscape phones). */}
                            <div className="px-4 pb-4 flex flex-1 min-h-0 flex-col gap-1 overflow-y-auto">
                                <form onSubmit={handleSearch} className="mb-2">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Search people..."
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            className="pl-8 h-9 text-sm bg-muted border-transparent"
                                        />
                                    </div>
                                </form>
                                {[...NAV_TABS, ...MENU_LINKS].map(({ label, href, icon: Icon }) => (
                                    <Link
                                        key={href}
                                        href={href}
                                        onClick={() => setMobileOpen(false)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                            pathname === href
                                                ? "bg-primary/10 text-primary"
                                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                        }`}
                                    >
                                        <Icon className="size-4" />
                                        {label}
                                    </Link>
                                ))}
                                {userId && (
                                    <Link
                                        href="/messages"
                                        onClick={() => setMobileOpen(false)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                            pathname.startsWith("/messages")
                                                ? "bg-primary/10 text-primary"
                                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                        }`}
                                    >
                                        <MessageCircle className="size-4" />
                                        Messages
                                        {unreadCount > 0 && (
                                            <span className="ml-auto size-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                                                {unreadCount > 9 ? "9+" : unreadCount}
                                            </span>
                                        )}
                                    </Link>
                                )}
                                {!userId && (
                                    <div className="mt-2 flex flex-col gap-2">
                                        <Button asChild onClick={() => setMobileOpen(false)}>
                                            <Link href="/signup">Sign up</Link>
                                        </Button>
                                        <Button variant="outline" asChild onClick={() => setMobileOpen(false)}>
                                            <Link href="/login">Log in</Link>
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>
        </header>
    )
}
