"use client";
import Link from "next/link";

export default function Navbar() {
    return (
        <nav className="flex items-center justify-between px-6 py-3 bg-white border-b shadow-sm">

            {/* Logo */}
            <div className="text-lg font-semibold">
                <Link href="/">Stuy Connections</Link>
            </div>

            {/* Search */}
            <div className="flex-1 flex justify-center">
                <input
                    type="text"
                    placeholder="Search..."
                    className="w-72 px-3 py-1 border rounded-md"
                />
            </div>

            {/* Links */}
            <div className="flex gap-6 text-sm">
                <Link href="/profile">Profile</Link>
                <Link href="/settings">Settings</Link>
            </div>

        </nav>
    );
}