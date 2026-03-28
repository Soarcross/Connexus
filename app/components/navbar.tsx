"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Input } from "@/app/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import { Home, Users, Briefcase, Info, Mail, Search, LogOut, User, Menu, X, MessageCircle } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

type Props = {
    userId: string
    avatarUrl: string | null
    fullName: string | null
    isAdmin: boolean
}

const NAV_LINKS = [
    { label: "Home", href: "/", icon: Home },
    { label: "People", href: "/people", icon: Users },
    { label: "Opportunities", href: "/opportunities", icon: Briefcase },
    { label: "About", href: "/about", icon: Info },
    { label: "Contact", href: "/contact", icon: Mail },
]

export function Navbar({ userId, avatarUrl, fullName, isAdmin }: Props) {
    const router = useRouter()
    const pathname = usePathname()
    const [search, setSearch] = useState("")
    const [mobileOpen, setMobileOpen] = useState(false)
    const [unreadCount, setUnreadCount] = useState(0)

    // fetch unread message count and subscribe to realtime updates
    useEffect(() => {
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

        // subscribe to new messages in realtime
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
        }
    }

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">

                {/* Logo */}
                <Link href="/" className="flex items-center gap-2 shrink-0">
                    <Image
                        src="/Stuy_connections_logo.png"
                        alt="Stuy Connections"
                        width={32}
                        height={32}
                        className="rounded-md"
                    />
                    <span className="font-bold text-base hidden sm:block">
                        Stuy Connections
                    </span>
                </Link>

                {/* Desktop Nav Links */}
                <nav className="hidden md:flex items-center gap-1 ml-2">
                    {NAV_LINKS.map(({ label, href, icon: Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                                ${pathname === href
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                }`}
                        >
                            <Icon className="size-4" />
                            {label}
                        </Link>
                    ))}
                </nav>

                {/* Search */}
                <form onSubmit={handleSearch} className="flex-1 max-w-xs hidden sm:flex">
                    <div className="relative w-full">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search people..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8 h-9 text-sm"
                        />
                    </div>
                </form>

                <div className="ml-auto flex items-center gap-2">

                    {/* Messages Icon */}
                    <Link
                        href="/messages"
                        className="relative p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <MessageCircle className="size-5" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                                {unreadCount > 9 ? "9+" : unreadCount}
                            </span>
                        )}
                    </Link>

                    {/* Account Dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                                <Avatar className="size-8 cursor-pointer">
                                    <AvatarImage src={avatarUrl ?? ""} />
                                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                                        {fullName?.[0] ?? "?"}
                                    </AvatarFallback>
                                </Avatar>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => router.push(`/profile/${userId}`)}>
                                <User className="size-4 mr-2" />
                                My Profile
                            </DropdownMenuItem>
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

                    {/* Mobile menu toggle */}
                    <button
                        className="md:hidden p-1.5 rounded-md hover:bg-muted transition-colors"
                        onClick={() => setMobileOpen(!mobileOpen)}
                    >
                        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
                    </button>
                </div>
            </div>

            {/* Mobile Nav */}
            {mobileOpen && (
                <div className="md:hidden border-t bg-background px-4 py-3 flex flex-col gap-1">
                    <form onSubmit={handleSearch} className="mb-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                            <Input
                                placeholder="Search people..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-8 h-9 text-sm"
                            />
                        </div>
                    </form>
                    {NAV_LINKS.map(({ label, href, icon: Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            onClick={() => setMobileOpen(false)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors
                                ${pathname === href
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                }`}
                        >
                            <Icon className="size-4" />
                            {label}
                        </Link>
                    ))}
                    <Link
                        href="/messages"
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        <MessageCircle className="size-4" />
                        Messages
                        {unreadCount > 0 && (
                            <span className="ml-auto size-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                                {unreadCount > 9 ? "9+" : unreadCount}
                            </span>
                        )}
                    </Link>
                </div>
            )}
        </header>
    )
}