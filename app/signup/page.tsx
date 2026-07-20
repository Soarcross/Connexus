import { SignupForm } from "../components/signup-form"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getCurrentChapter } from "@/lib/chapter"

export default async function SignupPage() {
    const supabase = await createSupabaseServerClient()
    const chapter = await getCurrentChapter(supabase)

    return (
        <div className="grid min-h-svh lg:grid-cols-2">
            <div className="flex flex-col gap-4 p-6 md:p-10">
                <div className="flex justify-center gap-2 md:justify-start">
                    <a href="#" className="flex items-center gap-2 font-medium">
                        <img src="/hsc-logo.png" alt="High School Connections" className="size-9" />
                        High School Connections
                    </a>
                </div>
                <div className="flex flex-1 items-center justify-center">
                    <div className="w-full max-w-xs">
                        <SignupForm chapterId={chapter?.id ?? null} chapterName={chapter?.name ?? null} />
                    </div>
                </div>
            </div>
            <div className="relative hidden bg-muted lg:block">
                <img
                    src="/placeholder"
                    alt="Image"
                    className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
                />
            </div>
        </div>
    )
}
