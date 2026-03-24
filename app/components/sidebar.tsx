import Link from "next/link";

export default function Sidebar() {
    return (
        <div className="w-60 h-screen bg-white border-r p-4">

            <div className="flex flex-col gap-4 text-sm">
                <Link href="/">Home</Link>
                <Link href="/opportunities">Opportunities</Link>
                <Link href="/connections">Connections</Link>
            </div>

        </div>
    );
}