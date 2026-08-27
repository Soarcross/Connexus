import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getServerUser } from "@/lib/supabase/user"
import { redirect } from "next/navigation"
import { ConversationList } from "@/app/components/messages/conversation-list"

export default async function MessagesPage() {
    const supabase = await createSupabaseServerClient()

    const user = await getServerUser(supabase)
    if (!user) redirect("/login")

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

    const convs = conversations ?? []
    const convIds = convs.map((c) => c.id)
    const otherIdOf = (conv: (typeof convs)[number]) =>
        conv.participant_1 === user.id ? conv.participant_2 : conv.participant_1
    const otherIds = [...new Set(convs.map(otherIdOf).filter((id): id is string => Boolean(id)))]

    // This used to run three sequential queries *per conversation* — the other
    // participant's profile, the last message, and an unread count — so the page
    // cost 2 + 3N requests across three round-trip stages. The profile and
    // unread lookups are now one batched query each, and everything goes out in
    // a single stage, giving 2 + N requests in one stage.
    //
    // The per-conversation "last message" query stays per-conversation on
    // purpose: PostgREST cannot express "latest row per group" without a view or
    // an RPC, and fetching every message of every thread to pick the newest in
    // JS would grow without bound as threads get long. These N queries are at
    // least issued concurrently rather than after one another.
    const [profilesResult, unreadResult, lastMessages] = convIds.length === 0
        ? [{ data: [] }, { data: [] }, []]
        : await Promise.all([
            supabase
                .from("profiles")
                .select("id, full_name, avatar_url")
                .in("id", otherIds),
            // Only unread rows come back, and the count per conversation is done
            // in memory. The unread set is inherently small, unlike the full
            // message history.
            supabase
                .from("messages")
                .select("conversation_id")
                .in("conversation_id", convIds)
                .eq("read", false)
                .neq("sender_id", user.id),
            Promise.all(
                convs.map((conv) =>
                    supabase
                        .from("messages")
                        .select("content, created_at, read, sender_id")
                        .eq("conversation_id", conv.id)
                        .order("created_at", { ascending: false })
                        .limit(1)
                        .maybeSingle()
                )
            ),
        ])

    const profilesById = new Map((profilesResult.data ?? []).map((p) => [p.id, p]))
    const unreadByConversation = new Map<string, number>()
    for (const row of unreadResult.data ?? []) {
        unreadByConversation.set(row.conversation_id, (unreadByConversation.get(row.conversation_id) ?? 0) + 1)
    }

    const conversationsWithProfiles = convs.map((conv, i) => {
            const otherId = otherIdOf(conv)

            return {
                id: conv.id,
                participant_1: conv.participant_1,
                participant_2: conv.participant_2,
                last_message_at: conv.last_message_at,
                created_at: conv.created_at,
                otherProfile: (otherId ? profilesById.get(otherId) : null) ?? null,
                lastMessage: lastMessages[i]?.data ?? null,
                unreadCount: unreadByConversation.get(conv.id) ?? 0,
            }
    })

    return (
        <div className="flex flex-col gap-6 max-w-2xl mx-auto">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
                <p className="text-sm text-muted-foreground">Your conversations with other members.</p>
            </div>
            <ConversationList
                conversations={conversationsWithProfiles as any}
                currentUserId={user.id}
            />
        </div>
    )
}