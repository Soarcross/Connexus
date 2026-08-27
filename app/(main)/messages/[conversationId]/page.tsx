import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getServerUser } from "@/lib/supabase/user"
import { redirect, notFound } from "next/navigation"
import { after } from "next/server"
import { ChatWindow } from "@/app/components/messages/chat-window"

type Props = {
    params: Promise<{ conversationId: string }>
}

export default async function ConversationPage({ params }: Props) {
    const { conversationId } = await params
    const supabase = await createSupabaseServerClient()

    const user = await getServerUser(supabase)
    if (!user) redirect("/login")

    // verify user is part of this conversation
    const { data: conversation, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
        .single()

    if (error || !conversation) notFound()

    // get other participant's profile
    const otherId = conversation.participant_1 === user.id
        ? conversation.participant_2
        : conversation.participant_1

    if (!otherId) {
        return; // or show an error, or redirect
    }

    // The other participant's profile and the message history both depend only
    // on the conversation row already in hand, not on each other, so they go out
    // together rather than as two sequential round trips.
    const [{ data: otherProfile }, { data: messages }] = await Promise.all([
        supabase
            .from("profiles")
            .select("id, full_name, avatar_url")
            .eq("id", otherId)
            .single(),
        supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true }),
    ])

    // Mark unread messages as read. This is a write whose result the page never
    // reads, so awaiting it inside the render held the HTML back for a whole
    // round trip on one of the slowest navigations in the app.
    //
    // `after()` runs it once the response has been sent, so the work still
    // happens on the server with the same session and the same RLS policies —
    // it is deferred, not dropped, and not moved to the client. Nothing renders
    // `read` (chat-window.tsx uses it only for the realtime mark-as-read of
    // incoming messages), and the navbar's unread badge already updates
    // asynchronously off a postgres_changes subscription, so it still updates
    // when this write lands.
    after(async () => {
        await supabase
            .from("messages")
            .update({ read: true })
            .eq("conversation_id", conversationId)
            .eq("read", false)
            .neq("sender_id", user.id)
    })

    return (
        <div className="max-w-2xl mx-auto">
            <ChatWindow
                conversationId={conversationId}
                currentUserId={user.id}
                otherProfile={otherProfile}
                initialMessages={messages ?? []}
            />
        </div>
    )
}