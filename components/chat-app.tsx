"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Sidebar } from "@/components/chat-sidebar"
import { ChatPanel } from "@/components/chat-panel"
import { cn } from "@/lib/utils"
import { socket } from "@/lib/socket"
import { supabase } from "@/lib/supabase"
import {
  type Conversation,
  type Message,
  nowTime,
} from "@/lib/chat-data"
import { LogIn, UserPlus, LogOut, User, Search, MessagesSquare } from "lucide-react"

type Tab = "chats" | "ai"

export function ChatApp() {
  const [tab, setTab] = useState<Tab>("chats")
  const [activeId, setActiveId] = useState<string>("")
  const [search, setSearch] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [typingConvoId, setTypingConvoId] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [showUsers, setShowUsers] = useState(false)
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [convos, setConvos] = useState<Conversation[]>([])
  const [activeAiChat, setActiveAiChat] = useState<string | null>(null)
  const [aiChats, setAiChats] = useState<any[]>([])
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())

  const [isMobile, setIsMobile] = useState(false)
  const [mobileView, setMobileView] = useState<"sidebar" | "chat">("sidebar")

  const typingChannelRef = useRef<any>(null)
  const typingTimeoutRef = useRef<any>(null)
  const userRef = useRef<any>(null)
  const activeIdRef = useRef<string>("")
  const tabRef = useRef<Tab>("chats")
  const ticksChannelRef = useRef<any>(null)

  useEffect(() => { userRef.current = user }, [user])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { tabRef.current = tab }, [tab])

  // ---- Detect mobile ----
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) setMobileView("sidebar")
    }
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  // ---- Auth/init ----
  useEffect(() => {
    async function loadUserAndProfile() {
      console.log("[TICK] Fetching auth user...")
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      console.log("[TICK] Auth result. user:", user?.id ?? "NULL", "error:", authError)
      setUser(user)
      if (user) {
        await loadAIChats(user.id)
        await loadConversations(user.id)
        const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single()
        if (error) console.error("Profile Fetch Error:", error)
        else setProfile(data)
      }
    }
    loadUserAndProfile()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      console.log("[TICK] Auth state changed:", event)
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") await loadUserAndProfile()
    })
    return () => subscription.unsubscribe()
  }, [])

  // ---- visibleConversations ----
  const visibleConversations = useMemo(() => {
    const filtered = convos.filter((c) => (tab === "ai" ? c.isAI : !c.isAI))
    const withStatus = filtered.map((c) => ({
      ...c,
      online: c.isAI ? true : onlineUsers.has((c as any).otherId),
    }))
    return withStatus.sort((a, b) => {
      const aTime = (a as any).lastMessageAt ? new Date((a as any).lastMessageAt).getTime() : 0
      const bTime = (b as any).lastMessageAt ? new Date((b as any).lastMessageAt).getTime() : 0
      return bTime - aTime
    })
  }, [convos, onlineUsers, tab])

  const active =
    tab === "ai"
      ? visibleConversations.find((c) => c.id === activeAiChat)
      : visibleConversations.find((c) => c.id === activeId)

  function handleTabChange(next: Tab) {
    setTab(next)
    if (next === "ai") setActiveAiChat(null)
    else setActiveId("")
  }

  function patchMessageStatus(conversationId: string, messageId: string, status: "sent" | "delivered" | "seen") {
    setConvos((prev) =>
      prev.map((c) =>
        c.id !== conversationId ? c : {
          ...c,
          messages: c.messages.map((m) =>
            m.id === messageId ? { ...m, status } : m
          ),
        }
      )
    )
  }

  async function loadMessages(conversationId: string) {
    const currentUser = userRef.current
    const { data, error } = await supabase
      .from("messages").select("*").eq("conversation_id", conversationId).order("created_at")
    if (error) { console.error(error); return }

    const msgs = data?.map((m: any) => ({
      id: m.id,
      text: m.message,
      sender: m.sender_id === currentUser?.id ? "me" : "them",
      time: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      status: m.read_at ? "seen" : m.delivered_at ? "delivered" : "sent",
      fileUrl: m.file_url,
      fileName: m.file_name,
      fileType: m.file_type,
    })) || []

    setConvos((prev) => {
      const exists = prev.some((c) => c.id === conversationId)
      if (exists) return prev.map((c) => c.id === conversationId ? { ...c, messages: msgs } : c)
      return [...prev, {
        id: conversationId, name: "Contact", avatar: "", color: "3b82f6",
        online: true, lastMessage: msgs.length ? msgs[msgs.length - 1].text : "",
        timestamp: "now", unread: 0, messages: msgs, isAI: false,
      }]
    })

    if (currentUser && activeIdRef.current === conversationId) {
      const { data: updated, error: updateError } = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("receiver_id", currentUser.id)
        .is("read_at", null)
        .select("id")

      if (updateError) { console.error("[TICK] Failed to mark read:", updateError); return }

      if (updated && updated.length > 0) {
        const messageIds = updated.map((m: any) => m.id)
        await new Promise<void>((resolve) => {
          const bc = supabase.channel(`ticks-${conversationId}`)
          bc.subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              await bc.send({ type: "broadcast", event: "seen", payload: { messageIds } })
              await supabase.removeChannel(bc)
              resolve()
            }
          })
        })
      }
    }
  }

  function handleSelect(id: string) {
    setActiveId(id)
    setSidebarOpen(false)
    setConvos((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)))
    loadMessages(id)
    if (isMobile) setMobileView("chat")
  }

  function handleBackToSidebar() { setMobileView("sidebar") }

  function pushMessage(convoId: string, message: Message, lastPreview: string) {
    setConvos((prev) =>
      prev.map((c) =>
        c.id === convoId ? {
          ...c,
          messages: [...c.messages, message],
          lastMessage: lastPreview,
          timestamp: "now",
          lastMessageAt: new Date().toISOString(),
        } : c
      )
    )
  }

  // ---- Realtime: INSERT (with diagnostic logs) ----
  useEffect(() => {
    console.log("[TICK] INSERT effect running. user:", user?.id ?? "NULL")
    if (!user) {
      console.log("[TICK] INSERT effect bailing — no user yet")
      return
    }

    const channel = supabase
      .channel("messages-insert-" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          console.log("[TICK] RAW INSERT payload received:", payload)
          const msg = payload.new as any
          const currentUser = userRef.current
          if (msg.receiver_id !== currentUser?.id) {
            console.log("[TICK] INSERT ignored — not for me. receiver:", msg.receiver_id, "me:", currentUser?.id)
            return
          }

          const { data: deliveredRows, error: deliverError } = await supabase
            .from("messages")
            .update({ delivered_at: new Date().toISOString() })
            .eq("id", msg.id).is("delivered_at", null).select("id")

          if (deliverError) {
            console.error("[TICK] Failed to mark delivered:", deliverError)
          } else if (deliveredRows && deliveredRows.length > 0) {
            await new Promise<void>((resolve) => {
              const bc = supabase.channel(`ticks-${msg.conversation_id}`)
              bc.subscribe(async (status) => {
                if (status === "SUBSCRIBED") {
                  await bc.send({ type: "broadcast", event: "delivered", payload: { messageId: msg.id } })
                  await supabase.removeChannel(bc)
                  resolve()
                }
              })
            })
          }

          // FIX: Build and insert the message directly from the realtime
          // payload instead of immediately re-querying the DB. A fresh
          // SELECT right after INSERT can race with Postgres replication
          // and miss the very row that triggered this event — that race
          // is what caused "works after refresh, not live" symptom.
          const newMsg = {
            id: msg.id,
            text: msg.message,
            sender: msg.sender_id === currentUser?.id ? "me" : "them",
            time: new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            status: msg.read_at ? "seen" : "delivered", // we just marked delivered above
            fileUrl: msg.file_url,
            fileName: msg.file_name,
            fileType: msg.file_type,
          }

          console.log("[TICK] Pushing message directly into state:", newMsg)

          setConvos((prev) => {
            const exists = prev.some((c) => c.id === msg.conversation_id)
            if (exists) {
              return prev.map((c) =>
                c.id === msg.conversation_id
                  ? {
                      ...c,
                      // avoid duplicate if it's somehow already there
                      messages: c.messages.some((m) => m.id === newMsg.id)
                        ? c.messages
                        : [...c.messages, newMsg],
                      lastMessage: newMsg.text || (newMsg.fileName ? `📎 ${newMsg.fileName}` : ""),
                      lastMessageAt: msg.created_at,
                      timestamp: newMsg.time,
                    }
                  : c
              )
            }
            // Conversation not in state yet (first message ever) — create it
            return [...prev, {
              id: msg.conversation_id, name: "Contact", avatar: "", color: "3b82f6",
              online: true, lastMessage: newMsg.text, lastMessageAt: msg.created_at,
              timestamp: newMsg.time, unread: 0, messages: [newMsg], isAI: false,
            }]
          })

          // If this conversation is the one currently open, mark it seen
          // (this also fires the "seen" broadcast back to the sender)
          const isOpen = tabRef.current === "chats" && activeIdRef.current === msg.conversation_id
          if (isOpen) {
            await loadMessages(msg.conversation_id)
          } else {
            setConvos((prev) => prev.map((c) =>
              c.id === msg.conversation_id ? { ...c, unread: (c.unread || 0) + 1 } : c
            ))
          }

          // Refresh sidebar-level metadata for everything else (safe now —
          // it won't clobber the message we just pushed directly above)
          await loadConversations(currentUser.id)
        }
      ).subscribe((status) => {
        console.log(`[TICK] messages-insert-${user.id} channel status:`, status)
      })

    return () => { supabase.removeChannel(channel) }
  }, [user])

  // ---- Realtime: ticks ----
  useEffect(() => {
    if (!activeId) return
    const channel = supabase
      .channel(`ticks-${activeId}`)
      .on("broadcast", { event: "delivered" }, (payload) => {
        const { messageId } = payload.payload
        if (messageId) patchMessageStatus(activeId, messageId, "delivered")
      })
      .on("broadcast", { event: "seen" }, (payload) => {
        const { messageIds } = payload.payload as { messageIds: string[] }
        if (messageIds?.length) messageIds.forEach((id) => patchMessageStatus(activeId, id, "seen"))
      })
      .subscribe((status) => { ticksChannelRef.current = channel })
    return () => { supabase.removeChannel(channel); ticksChannelRef.current = null }
  }, [activeId])

  // ---- Realtime: UPDATE fallback ----
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel("messages-update-" + user.id)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as any
        const currentUser = userRef.current
        if (!currentUser || msg.sender_id !== currentUser.id) return
        const status = msg.read_at ? "seen" : msg.delivered_at ? "delivered" : "sent"
        patchMessageStatus(msg.conversation_id, msg.id, status)
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  // ---- Realtime: conversations ----
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel("conversations-" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations" }, (payload) => {
        const convo = payload.new as any
        if (convo.user1 === user.id || convo.user2 === user.id) loadConversations(user.id)
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  // ---- Realtime: Presence ----
  useEffect(() => {
    if (!user) return
    let isActive = true
    const presenceChannel = supabase.channel("online-users", { config: { presence: { key: user.id } } })
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        if (!isActive) return
        setOnlineUsers(new Set(Object.keys(presenceChannel.presenceState())))
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED" && isActive) await presenceChannel.track({ online_at: new Date().toISOString() })
      })
    return () => { isActive = false; setTimeout(() => { supabase.removeChannel(presenceChannel) }, 0) }
  }, [user?.id])

  // ---- Realtime: Typing ----
  useEffect(() => {
    if (!activeId || !user) { typingChannelRef.current = null; return }
    const channel = supabase
      .channel("typing-" + activeId)
      .on("broadcast", { event: "typing" }, (payload) => {
        if (payload.payload.userId !== user.id) {
          setTypingConvoId(activeId)
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => {
            setTypingConvoId((prev) => (prev === activeId ? null : prev))
          }, 2500)
        }
      }).subscribe()
    typingChannelRef.current = channel
    return () => { supabase.removeChannel(channel); typingChannelRef.current = null }
  }, [activeId, user])

  function broadcastTyping() {
    if (!typingChannelRef.current || !user) return
    typingChannelRef.current.send({ type: "broadcast", event: "typing", payload: { userId: user.id } })
  }

  async function loadUsers() {
    const { data, error } = await supabase.from("profiles").select("*").neq("id", user?.id)
    if (error) { console.error(error); return }
    setAllUsers(data || [])
  }

  async function loadConversations(userId: string) {
    if (!userId) return
    const { data: convData, error } = await supabase
      .from("conversations").select("*").or(`user1.eq.${userId},user2.eq.${userId}`)
    if (error) { console.error(error); return }
    if (!convData || convData.length === 0) { setConvos((prev) => prev.filter((c) => c.isAI)); return }

    const convoIds = convData.map((c: any) => c.id)
    const { data: allMessages } = await supabase
      .from("messages").select("*").in("conversation_id", convoIds).order("created_at", { ascending: true })

    const messagesByConvo = new Map<string, any[]>()
    ;(allMessages || []).forEach((m: any) => {
      const list = messagesByConvo.get(m.conversation_id) || []
      list.push(m)
      messagesByConvo.set(m.conversation_id, list)
    })

    const otherIds = convData.map((c: any) => c.user1 === userId ? c.user2 : c.user1)
    const { data: profiles } = await supabase
      .from("profiles").select("id, name")
      .in("id", otherIds.length ? otherIds : ["00000000-0000-0000-0000-000000000000"])
    const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.name]))

    setConvos((prev) => {
      const aiConvos = prev.filter((c) => c.isAI)
      const chatConvos = convData
        .filter((conversation: any) => (messagesByConvo.get(conversation.id) || []).length > 0)
        .map((conversation: any) => {
          const existing = prev.find((c) => c.id === conversation.id)
          const otherId = conversation.user1 === userId ? conversation.user2 : conversation.user1
          const msgs = messagesByConvo.get(conversation.id) || []
          const lastMsg = msgs[msgs.length - 1]
          const unreadCount = msgs.filter((m: any) => m.receiver_id === userId && !m.read_at).length

          const mappedMsgs = existing?.messages?.length
            ? existing.messages
            : msgs.map((m: any) => ({
                id: m.id, text: m.message,
                sender: m.sender_id === userId ? "me" : "them",
                time: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                status: m.read_at ? "seen" : m.delivered_at ? "delivered" : "sent",
                fileUrl: m.file_url, fileName: m.file_name, fileType: m.file_type,
              }))

          return {
            id: conversation.id,
            name: nameMap.get(otherId) || existing?.name || "Contact",
            avatar: "", color: existing?.color || "3b82f6", otherId, online: false,
            lastMessageAt: lastMsg ? lastMsg.created_at : conversation.created_at,
            lastMessage: lastMsg ? (lastMsg.message || (lastMsg.file_name ? `📎 ${lastMsg.file_name}` : "")) : "",
            timestamp: lastMsg ? new Date(lastMsg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
            unread: unreadCount, messages: mappedMsgs, isAI: false,
          }
        })
      return [...aiConvos, ...chatConvos]
    })
  }

  async function loadAIChats(userId: string) {
    const { data, error } = await supabase
      .from("ai_chats").select("*").eq("user_id", userId).order("created_at", { ascending: false })
    if (error) { console.error(error); return }
    setAiChats(data || [])
    if (data && data.length > 0) { setActiveAiChat(data[0].id); await openAIChat(data[0].id) }
  }

  async function createNewAIChat() {
    if (!user) return
    const { data, error } = await supabase.from("ai_chats").insert({ user_id: user.id, title: "New Chat" }).select().single()
    if (error) { console.error(error); return }
    setActiveAiChat(data.id)
    setConvos((prev) => [...prev.filter((c) => !c.isAI), {
      id: data.id, name: "AI Assistant", avatar: "", color: "7c3aed",
      online: true, lastMessage: "", timestamp: "", unread: 0, isAI: true, messages: [],
    }])
    await openAIChat(data.id)
    setAiChats((prev) => [data, ...prev])
    await loadAIChats(user.id)
    if (isMobile) setMobileView("chat")
  }

  async function deleteAIChat(chatId: string) {
    if (!confirm("Delete this chat?")) return
    await supabase.from("ai_messages").delete().eq("chat_id", chatId)
    await supabase.from("ai_chats").delete().eq("id", chatId)
    if (user) await loadAIChats(user.id)
  }

  async function startConversation(targetUser: any) {
    if (!user) return
    const { data: existing } = await supabase
      .from("conversations").select("*")
      .or(`and(user1.eq.${user.id},user2.eq.${targetUser.id}),and(user1.eq.${targetUser.id},user2.eq.${user.id})`)
      .maybeSingle()
    if (existing) {
      setConvos((prev) => {
        if (prev.some((c) => c.id === existing.id)) return prev
        return [...prev, {
          id: existing.id, name: targetUser.name, avatar: "", color: "7c3aed",
          otherId: targetUser.id, online: false, lastMessage: existing.last_message || "",
          timestamp: existing.updated_at || "now", unread: 0, messages: [], isAI: false,
        }]
      })
      setActiveId(existing.id); setTab("chats")
      await loadMessages(existing.id)
      if (isMobile) setMobileView("chat")
      return
    }
    const { data, error } = await supabase
      .from("conversations").insert({ user1: user.id, user2: targetUser.id }).select().single()
    if (error) { console.error(error); return }
    setActiveId(data.id); setTab("chats")
    setConvos((prev) => [...prev, {
      id: data.id, name: targetUser.name, avatar: "", color: "7c3aed",
      otherId: targetUser.id, online: false, lastMessage: "", timestamp: "now",
      unread: 0, messages: [], isAI: false,
    }])
    if (isMobile) setMobileView("chat")
  }

  async function handleLogout() { await supabase.auth.signOut(); setUser(null) }

  async function openAIChat(chatId: string) {
    setActiveAiChat(chatId)
    const { data, error } = await supabase.from("ai_messages").select("*").eq("chat_id", chatId).order("created_at")
    if (error) { console.error(error); return }
    const msgs = data?.flatMap((m: any) => [
      { id: `${m.id}-user`, text: m.message, sender: "me", time: new Date(m.created_at).toLocaleTimeString() },
      { id: `${m.id}-ai`, text: m.response, sender: "ai", time: new Date(m.created_at).toLocaleTimeString() },
    ]) || []
    setConvos((prev) => [...prev.filter((c) => c.id !== chatId), {
      id: chatId, name: "AI Assistant", avatar: "", color: "7c3aed", online: true,
      lastMessage: data?.length > 0 ? data[data.length - 1].message : "",
      timestamp: "now", unread: 0, isAI: true, messages: msgs,
    }])
    if (isMobile) setMobileView("chat")
  }

  async function handleSend(text: string, file?: { url: string; name: string; type: string }) {
    const target = active
    if (!target) return

    if (target.isAI) {
      const userMsg: Message = { id: `${target.id}-${Date.now()}`, text, sender: "me", time: nowTime() }
      pushMessage(target.id, userMsg, text)
      try {
        const response = await fetch("/api/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        })
        const data = await response.json()
        const aiMsg: Message = { id: `${target.id}-${Date.now()}-ai`, text: data.reply, sender: "ai", time: nowTime() }
        pushMessage(target.id, aiMsg, aiMsg.text)
        if (user) {
          await supabase.from("ai_messages").insert({ chat_id: activeAiChat, user_id: user.id, message: text, response: data.reply })
          const { data: currentChat } = await supabase.from("ai_chats").select("title").eq("id", activeAiChat).single()
          if (currentChat?.title === "New Chat") {
            await supabase.from("ai_chats").update({ title: text.slice(0, 40) }).eq("id", activeAiChat)
            await loadAIChats(user.id)
          }
        }
      } catch {
        pushMessage(target.id, { id: `${target.id}-${Date.now()}-error`, text: "Sorry, I couldn't generate a response.", sender: "ai", time: nowTime() }, "Sorry...")
      }
      return
    }

    const { data: convRow } = await supabase.from("conversations").select("*").eq("id", target.id).single()
    if (!convRow) return
    const otherUserId = convRow.user1 === user.id ? convRow.user2 : convRow.user1

    const optimisticId = `optimistic-${Date.now()}`
    pushMessage(target.id, { id: optimisticId, text, sender: "me", time: nowTime(), status: "sent", fileUrl: file?.url, fileName: file?.name, fileType: file?.type } as any, file ? (text || file.name) : text)

    console.log("[TICK] Inserting message into Supabase...")
    const { data: inserted, error: msgError } = await supabase
      .from("messages")
      .insert({ conversation_id: target.id, sender_id: user.id, receiver_id: otherUserId, message: text, file_url: file?.url || null, file_name: file?.name || null, file_type: file?.type || null })
      .select().single()

    if (msgError) {
      console.error("[TICK] MESSAGE INSERT ERROR:", msgError)
      setConvos((prev) => prev.map((c) => c.id === target.id ? { ...c, messages: c.messages.filter((m) => m.id !== optimisticId) } : c))
      return
    }

    console.log("[TICK] Message inserted successfully, id:", inserted.id)

    setConvos((prev) => prev.map((c) => c.id !== target.id ? c : {
      ...c, messages: c.messages.map((m) => m.id === optimisticId ? { ...m, id: inserted.id, status: "sent" } : m),
    }))

    await loadConversations(user.id)
    await supabase.from("conversations").update({ last_message: text || `📎 ${file?.name}` }).eq("id", target.id)
    socket.emit("send-message", { text, sender: user.id, conversationId: target.id })
  }

  // ── Full-width header (spans sidebar + panel) ──────────────────────────────
  const header = (
    <header className="flex h-14 w-full shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar px-4">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <MessagesSquare className="size-4" />
        </div>
        <span className="text-base font-semibold tracking-tight">ConnectAI</span>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {user ? (
          <>
            {tab === "chats" && (
              <button
                onClick={() => { setShowUsers(!showUsers); loadUsers() }}
                className="flex items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-400 transition-all hover:bg-blue-500 hover:text-white md:px-4 md:py-2 md:text-sm"
              >
                <Search size={14} />
                <span className="hidden sm:inline">Contacts</span>
              </button>
            )}
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white md:px-4 md:py-2 md:text-sm">
              <User size={14} />
              <span className="hidden sm:inline">{profile?.name}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 transition-all hover:bg-red-500 hover:text-white md:px-4 md:py-2 md:text-sm"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </>
        ) : (
          <>
            <a href="/login" className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white md:px-4 md:py-2 md:text-sm">
              <LogIn size={14} /><span>Login</span>
            </a>
            <a href="/signup" className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-3 py-1.5 text-xs text-white md:px-4 md:py-2 md:text-sm">
              <UserPlus size={14} /><span>Sign Up</span>
            </a>
          </>
        )}
      </div>
    </header>
  )

  // ── Contacts dropdown ───────────────────────────────────────────────────────
  const contactsDropdown = showUsers && tab === "chats" && (
    <div className="absolute right-3 top-16 z-50 w-72 rounded-xl border bg-white shadow-xl">
      <div className="max-h-72 overflow-y-auto">
        {allUsers.filter((u) => u.id !== user?.id).map((u) => (
          <button key={u.id}
            className="flex w-full items-center border-b p-3 text-left hover:bg-slate-100"
            onClick={() => { startConversation(u); setShowUsers(false) }}
          >
            <div>
              <p className="font-semibold text-black text-sm">{u.name}</p>
              <p className="text-xs text-gray-500">{u.email}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  // ── Sidebar element ─────────────────────────────────────────────────────────
  const sidebarEl = (
    <Sidebar
      conversations={visibleConversations}
      activeId={activeId}
      onSelect={handleSelect}
      tab={tab}
      onTabChange={handleTabChange}
      search={search}
      onSearch={setSearch}
      onClose={() => setSidebarOpen(false)}
      aiChats={aiChats}
      createNewAIChat={createNewAIChat}
      openAIChat={openAIChat}
      deleteAIChat={deleteAIChat}
      typingConvoId={typingConvoId}
    />
  )

  // ── Chat panel element ──────────────────────────────────────────────────────
  const chatPanelEl = active ? (
    <ChatPanel
      conversation={active}
      messages={active.messages}
      typing={typingConvoId === active.id}
      onSend={handleSend}
      onOpenSidebar={isMobile ? handleBackToSidebar : () => setSidebarOpen(true)}
      onTyping={broadcastTyping}
      isMobile={isMobile}
      onBack={handleBackToSidebar}
    />
  ) : (
    <div className="flex h-full items-center justify-center">
      <div className="text-center px-6">
        <h2 className="text-3xl font-bold">✨ Welcome to ConnectAI!</h2>
        <p className="text-slate-500 mt-2">
          Stay connected with friends, colleagues, and AI — all in one place.
        </p>
      </div>
    </div>
  )

  // ── MOBILE ──────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
        {header}
        {contactsDropdown}
        <div className="flex flex-1 overflow-hidden">
          {mobileView === "sidebar"
            ? <div className="flex-1 overflow-hidden">{sidebarEl}</div>
            : <div className="flex-1 overflow-hidden">{chatPanelEl}</div>
          }
        </div>
      </main>
    )
  }

  // ── DESKTOP ─────────────────────────────────────────────────────────────────
  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
      {header}
      {contactsDropdown}

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-80 shrink-0 border-r border-sidebar-border md:block">
          {sidebarEl}
        </aside>

        <div className={cn("fixed inset-0 z-50 md:hidden", sidebarOpen ? "pointer-events-auto" : "pointer-events-none")}>
          <div
            className={cn("absolute inset-0 bg-background/70 backdrop-blur-sm transition-opacity", sidebarOpen ? "opacity-100" : "opacity-0")}
            onClick={() => setSidebarOpen(false)} aria-hidden="true"
          />
          <div className={cn("absolute left-0 top-0 h-full w-80 max-w-[85%] border-r border-sidebar-border shadow-xl transition-transform duration-300", sidebarOpen ? "translate-x-0" : "-translate-x-full")}>
            {sidebarEl}
          </div>
        </div>

        <section className="flex flex-1 flex-col overflow-hidden">
          {chatPanelEl}
        </section>
      </div>
    </main>
  )
}
