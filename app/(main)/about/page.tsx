import { createSupabaseServerClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/app/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Badge } from "@/app/components/ui/badge"
import { Mail, Phone, ExternalLink } from "lucide-react"
import { AuroraBackground } from "@/app/components/about/aurora-background"

export default async function AboutPage() {
    const supabase = await createSupabaseServerClient()

    const [
        { data: aboutContent },
        { data: teamMembers },
        { data: partners },
    ] = await Promise.all([
        supabase.from("about_content").select("*").single(),
        supabase.from("team_members").select("*").order("order_index"),
        supabase.from("partners").select("*").order("order_index"),
    ])

    // ensure image_url is a full public URL (some rows may store just the storage path)
    const resolveUrl = (url: string | null) => {
        if (!url) return null
        if (url.startsWith("http")) return url
        const { data } = supabase.storage.from("avatars").getPublicUrl(url)
        return data.publicUrl
    }

    return (
        <>
            <AuroraBackground />
            <div className="relative z-10 max-w-4xl mx-auto flex flex-col gap-16">
                {/* Mission */}
                <section className="flex flex-col gap-4 text-center items-center">
                    <Badge variant="secondary" className="w-fit">Our Mission</Badge>
                    <h1 className="text-4xl font-bold tracking-tight">
                        Connecting Stuyvesant's Community
                    </h1>
                    <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">
                        {(aboutContent as any)?.mission || "Stuy Connections is a platform built to bridge the gap between Stuyvesant students and alumni, creating meaningful connections that help everyone grow personally and professionally."}
                    </p>
                </section>

                {/* Team */}
                {teamMembers && teamMembers.length > 0 && (
                    <section className="flex flex-col gap-8">
                        <div className="flex flex-col gap-1 text-center">
                            <h2 className="text-2xl font-bold">Meet the Team</h2>
                            <p className="text-muted-foreground text-sm">
                                The people behind Stuy Connections
                            </p>
                        </div>
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {teamMembers.map((member: any) => (
                                <Card key={member.id} className="hover:border-primary/50 transition-colors">
                                    <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
                                        <Avatar className="size-20">
                                            <AvatarImage src={resolveUrl(member.image_url) ?? ""} />
                                            <AvatarFallback className="text-xl bg-primary/10 text-primary font-semibold">
                                                {member.name?.[0]}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col gap-1">
                                            <p className="font-semibold">{member.name}</p>
                                            <p className="text-sm text-primary">{member.role}</p>
                                            {member.bio && (
                                                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                                    {member.bio}
                                                </p>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </section>
                )}

                {/* Partners */}
                {partners && partners.length > 0 && (
                    <section className="flex flex-col gap-8">
                        <div className="flex flex-col gap-1 text-center">
                            <h2 className="text-2xl font-bold">Our Partners</h2>
                            <p className="text-muted-foreground text-sm">
                                Organizations that support our mission
                            </p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {partners.map((partner: any) => (
                                <Card key={partner.id} className="hover:border-primary/50 transition-colors">
                                    <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
                                        {partner.logo_url ? (
                                            <img src={partner.logo_url} alt={partner.name} className="h-12 object-contain" />
                                        ) : (
                                            <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                                                {partner.name?.[0]}
                                            </div>
                                        )}
                                        <div className="flex flex-col gap-1">
                                            <p className="font-semibold text-sm">{partner.name}</p>
                                            {partner.description && (
                                                <p className="text-xs text-muted-foreground leading-relaxed">{partner.description}</p>
                                            )}
                                            {partner.website_url && (
                                                <a href={partner.website_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center justify-center gap-1 mt-1">
                                                    Visit website <ExternalLink className="size-3" />
                                                </a>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </section>
                )}

                {/* Contact */}
                <section className="flex flex-col gap-4 items-center text-center pb-10">
                    <h2 className="text-2xl font-bold">Get in Touch</h2>
                    <p className="text-muted-foreground text-sm max-w-md">
                        Have questions or want to learn more? Reach out to us directly or use our contact form.
                    </p>
                    <div className="flex flex-col gap-2">
                        {(aboutContent as any)?.contact_email && (
                            <a href={`mailto:${(aboutContent as any).contact_email}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                                <Mail className="size-4" />
                                {(aboutContent as any).contact_email}
                            </a>
                        )}
                        {(aboutContent as any)?.contact_phone && (
                            <a href={`tel:${(aboutContent as any).contact_phone}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                                <Phone className="size-4" />
                                {(aboutContent as any).contact_phone}
                            </a>
                        )}
                    </div>
                </section>
            </div>
        </>
    )
}
