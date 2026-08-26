import { SignupForm } from "../components/signup-form"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export default async function SignupPage() {
    const supabase = await createSupabaseServerClient()
    const { data: chapters } = await supabase
        .from("chapters")
        .select("id, name, school_name")
        .eq("status", "Active")
        .order("name")

    return (
        <div className="grid min-h-svh lg:grid-cols-2">
            <div className="flex flex-col gap-4 p-6 md:p-10">
                <div className="flex justify-center gap-2 md:justify-start">
                    <a href="#" className="flex items-center gap-2 font-medium">
                        <img src="/brand/hsc-logo.svg" alt="Connexus" className="size-9" />
                        Connexus
                    </a>
                </div>
                <div className="flex flex-1 items-center justify-center">
                    <div className="w-full max-w-xs">
                        <SignupForm chapters={chapters ?? []} />
                    </div>
                </div>
            </div>
            <div className="relative hidden lg:flex lg:items-center lg:justify-center bg-gradient-to-br from-primary/90 to-primary/60 dark:from-primary/30 dark:to-background">
                <img src="/brand/hsc-logo.svg" alt="" aria-hidden="true" className="size-40 opacity-90" />
            </div>
        </div>
    )
}
