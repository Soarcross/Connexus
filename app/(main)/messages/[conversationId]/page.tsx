import { createSupabaseServerClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { ChatWindow } from "@/app/components/messages/chat-window"

type Props = {
    params: Promise<{ conversationId: string }>
}

export default async function ConversationPage({ params }: Props) {
    const { conversationId } = await params
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()
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

    const { data: otherProfile } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("id", otherId)
        .single()

    // fetch messages
    const { data: messages } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })

    // mark unread messages as read
    await supabase
        .from("messages")
        .update({ read: true })
        .eq("conversation_id", conversationId)
        .eq("read", false)
        .neq("sender_id", user.id)

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