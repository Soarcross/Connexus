"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { ArrowLeft, Send } from "lucide-react"

type Message = {
    id: string
    conversation_id: string
    sender_id: string
    content: string
    created_at: string
    read: boolean
}

type Profile = {
    id: string
    full_name: string | null
    avatar_url: string | null
}

type Props = {
    conversationId: string
    currentUserId: string
    otherProfile: Profile | null
    initialMessages: Message[]
}

export function ChatWindow({ conversationId, currentUserId, otherProfile, initialMessages }: Props) {
    const router = useRouter()
    const [messages, setMessages] = useState<Message[]>(initialMessages)
    const [input, setInput] = useState("")
    const [sending, setSending] = useState(false)
    const bottomRef = useRef<HTMLDivElement>(null)

    // scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    // subscribe to realtime messages
    useEffect(() => {
        const supabase = getSupaBrowserClient()

        const channel = supabase
            .channel(`conversation-${conversationId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",
                    filter: `conversation_id=eq.${conversationId}`
                },
                async (payload) => {
                    const newMessage = payload.new as Message
                    setMessages(prev => [...prev, newMessage])

                    // mark as read if from other person
                    if (newMessage.sender_id !== currentUserId) {
                        await supabase
                            .from("messages")
                            .update({ read: true })
                            .eq("id", newMessage.id)
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [conversationId, currentUserId])

    async function handleSend(e: React.FormEvent) {
        e.preventDefault()
        const trimmed = input.trim()
        if (!trimmed || sending) return

        setSending(true)
        const supabase = getSupaBrowserClient()

        try {
            const { error } = await supabase
                .from("messages")
                .insert({
                    conversation_id: conversationId,
                    sender_id: currentUserId,
                    content: trimmed,
                })

            if (error) throw error

            // update last_message_at on conversation
            await supabase
                .from("conversations")
                .update({ last_message_at: new Date().toISOString() })
                .eq("id", conversationId)

            setInput("")
        } catch (err) {
            console.error("Failed to send message:", err)
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)]">

            {/* Header */}
            <div className="flex items-center gap-3 pb-4 border-b mb-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push("/messages")}
                    className="shrink-0"
                >
                    <ArrowLeft className="size-4" />
                </Button>
                <Avatar className="size-9">
                    <AvatarImage src={otherProfile?.avatar_url ?? ""} />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                        {otherProfile?.full_name?.[0] ?? "?"}
                    </AvatarFallback>
                </Avatar>
                <div>
                    <p className="font-semibold text-sm">{otherProfile?.full_name ?? "Unknown"}</p>
                    <p
                        className="text-xs text-primary cursor-pointer hover:underline"
                        onClick={() => router.push(`/profile/${otherProfile?.id}`)}
                    >
                        View profile
                    </p>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
                {messages.length === 0 && (
                    <p className="text-center text-muted-foreground text-sm mt-8">
                        No messages yet. Say hello!
                    </p>
                )}
                {messages.map((msg) => {
                    const isOwn = msg.sender_id === currentUserId
                    return (
                        <div
                            key={msg.id}
                            className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                        >
                            <div
                                className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm
                                    ${isOwn
                                        ? "bg-primary text-primary-foreground rounded-br-sm"
                                        : "bg-muted text-foreground rounded-bl-sm"
                                    }`}
                            >
                                <p>{msg.content}</p>
                                <p className={`text-[10px] mt-1 ${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </p>
                            </div>
                        </div>
                    )
                })}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="flex gap-2 pt-4 border-t mt-4">
                <Input
                    placeholder="Type a message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="flex-1"
                    disabled={sending}
                />
                <Button type="submit" disabled={sending || !input.trim()} size="icon">
                    <Send className="size-4" />
                </Button>
            </form>
        </div>
    )
}