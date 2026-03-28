import { createSupabaseServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ConversationList } from "@/app/components/messages/conversation-list"

export default async function MessagesPage() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    // fetch all conversations the user is part of
    const { data: conversations } = await supabase
        .from("conversations")
        .select(`
            id,
            participant_1,
            participant_2,
            last_message_at,
            created_at
        `)
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
        .order("last_message_at", { ascending: false })

    // get the other participant's profile for each conversation
    const conversationsWithProfiles = await Promise.all(
        (conversations ?? []).map(async (conv) => {
            const otherId = conv.participant_1 === user.id
                ? conv.participant_2
                : conv.participant_1

            const { data: profile } = await supabase
                .from("profiles")
                .select("id, full_name, avatar_url")
                .eq("id", otherId)
                .single()

            // get the last message
            const { data: lastMessage } = await supabase
                .from("messages")
                .select("content, created_at, read, sender_id")
                .eq("conversation_id", conv.id)
                .order("created_at", { ascending: false })
                .limit(1)
                .single()

            // get unread count
            const { count: unreadCount } = await supabase
                .from("messages")
                .select("id", { count: "exact", head: true })
                .eq("conversation_id", conv.id)
                .eq("read", false)
                .neq("sender_id", user.id)

            return {
                ...conv,
                otherProfile: profile,
                lastMessage: lastMessage ?? null,
                unreadCount: unreadCount ?? 0,
            }
        })
    )

    return (
        <div className="flex flex-col gap-6 max-w-2xl mx-auto">
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
                <p className="text-muted-foreground">Your conversations with other members.</p>
            </div>
            <ConversationList
                conversations={conversationsWithProfiles}
                currentUserId={user.id}
            />
        </div>
    )
}