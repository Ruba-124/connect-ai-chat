"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Sidebar } from "@/components/chat-sidebar"
import { ChatPanel } from "@/components/chat-panel"
import { LogIn, UserPlus, LogOut, User, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { socket } from "@/lib/socket"
import { supabase } from "@/lib/supabase"
import {
  type Conversation,
  type Message,
  nowTime,
} from "@/lib/chat-data"

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

  // Mobile: true = showing sidebar, false = showing chat panel
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
      // On desktop always show both panels; on mobile start at sidebar
      if (!mobile) setMobileView("sidebar")
    }
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  // ---- Auth/init ----
  useEffect(() => {
    async function loadUserAndProfile() {
      const { data: { user } } = await supabase.auth.getUser()
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

  // ---- Patch a single message status in local state ----
  function patchMessageStatus(conversationId: string, messageId: string, status: "sent" | "delivered" | "seen") {
    console.log(`[TICK] patchMessageStatus → convo=${conversationId} msg=${messageId} status=${status}`)
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

  // ---- Load messages from DB and mark unread as seen ----
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

    // Only mark as read when this conversation is actually open on screen
    if (currentUser && activeIdRef.current === conversationId) {
      const { data: updated, error: updateError } = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("receiver_id", currentUser.id)
        .is("read_at", null)
        .select("id")

      if (updateError) { console.error("[TICK] Failed to mark read:", updateError); return }

      console.log(`[TICK] Marked ${updated?.length ?? 0} messages as read`)

      if (updated && updated.length > 0) {
        const messageIds = updated.map((m: any) => m.id)
        console.log(`[TICK] Broadcasting seen for messageIds:`, messageIds)
        // Must subscribe before sending
        await new Promise<void>((resolve) => {
          const bc = supabase.channel(`ticks-${conversationId}`)
          bc.subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              const sendResult = await bc.send({
                type: "broadcast",
                event: "seen",
                payload: { messageIds },
              })
              console.log(`[TICK] seen broadcast result:`, sendResult)
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
    // On mobile, switch to chat view
    if (isMobile) setMobileView("chat")
  }

  function handleBackToSidebar() {
    setMobileView("sidebar")
  }

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

  // ---- Realtime: messages INSERT — receiver marks delivered + broadcasts ----
  // No `tab` in deps — tabRef handles it so the channel never closes on re-render
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel("messages-insert-" + user.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const msg = payload.new as any
          const currentUser = userRef.current
          console.log(`[TICK] INSERT event received. receiver_id=${msg.receiver_id} me=${currentUser?.id}`)
          if (msg.receiver_id !== currentUser?.id) return

          // Mark delivered in DB
          const { data: deliveredRows, error: deliverError } = await supabase
            .from("messages")
            .update({ delivered_at: new Date().toISOString() })
            .eq("id", msg.id)
            .is("delivered_at", null)
            .select("id")

          if (deliverError) {
            console.error("[TICK] Failed to mark delivered:", deliverError)
          } else if (deliveredRows && deliveredRows.length > 0) {
            console.log(`[TICK] Marked delivered: ${msg.id}, broadcasting...`)
            // Must subscribe before sending
            await new Promise<void>((resolve) => {
              const bc = supabase.channel(`ticks-${msg.conversation_id}`)
              bc.subscribe(async (status) => {
                if (status === "SUBSCRIBED") {
                  const result = await bc.send({
                    type: "broadcast",
                    event: "delivered",
                    payload: { messageId: msg.id },
                  })
                  console.log(`[TICK] delivered broadcast result:`, result)
                  await supabase.removeChannel(bc)
                  resolve()
                }
              })
            })
          }

          await loadConversations(currentUser.id)

          const isOpen = tabRef.current === "chats" && activeIdRef.current === msg.conversation_id
          if (isOpen) {
            await loadMessages(msg.conversation_id)
          } else {
            setConvos((prev) =>
              prev.map((c) =>
                c.id === msg.conversation_id ? { ...c, unread: (c.unread || 0) + 1 } : c
              )
            )
          }
        }
      )
      .subscribe((status) => {
        console.log(`[TICK] messages-insert channel status:`, status)
      })

    return () => { supabase.removeChannel(channel) }
  }, [user]) // ← only user, never tab

  // ---- Realtime: ticks channel — sender listens for delivered + seen ----
  useEffect(() => {
    if (!activeId) return
    console.log(`[TICK] Subscribing to ticks-${activeId}`)
    const channel = supabase
      .channel(`ticks-${activeId}`)
      .on("broadcast", { event: "delivered" }, (payload) => {
        console.log(`[TICK] received delivered broadcast:`, payload)
        const { messageId } = payload.payload
        if (messageId) patchMessageStatus(activeId, messageId, "delivered")
      })
      .on("broadcast", { event: "seen" }, (payload) => {
        console.log(`[TICK] received seen broadcast:`, payload)
        const { messageIds } = payload.payload as { messageIds: string[] }
        if (messageIds?.length) {
          messageIds.forEach((id) => patchMessageStatus(activeId, id, "seen"))
        }
      })
      .subscribe((status) => {
        console.log(`[TICK] ticks-${activeId} channel status:`, status)
        ticksChannelRef.current = channel
      })
    return () => {
      supabase.removeChannel(channel)
      ticksChannelRef.current = null
    }
  }, [activeId])

  // ---- Realtime: DB UPDATE fallback ----
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel("messages-update-" + user.id)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as any
          const currentUser = userRef.current
          console.log(`[TICK] UPDATE event: sender=${msg.sender_id} me=${currentUser?.id} delivered=${msg.delivered_at} read=${msg.read_at}`)
          if (!currentUser || msg.sender_id !== currentUser.id) return
          const status = msg.read_at ? "seen" : msg.delivered_at ? "delivered" : "sent"
          patchMessageStatus(msg.conversation_id, msg.id, status)
        }
      )
      .subscribe((status) => {
        console.log(`[TICK] messages-update channel status:`, status)
      })
    return () => { supabase.removeChannel(channel) }
  }, [user])

  // ---- Realtime: new conversations ----
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel("conversations-" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations" }, (payload) => {
        const convo = payload.new as any
        if (convo.user1 === user.id || convo.user2 === user.id) loadConversations(user.id)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  // ---- Realtime: Presence ----
  useEffect(() => {
    if (!user) return
    let isActive = true
    const presenceChannel = supabase.channel("online-users", {
      config: { presence: { key: user.id } },
    })
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        if (!isActive) return
        setOnlineUsers(new Set(Object.keys(presenceChannel.presenceState())))
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED" && isActive) {
          await presenceChannel.track({ online_at: new Date().toISOString() })
        }
      })
    return () => {
      isActive = false
      setTimeout(() => { supabase.removeChannel(presenceChannel) }, 0)
    }
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
      })
      .subscribe()
    typingChannelRef.current = channel
    return () => { supabase.removeChannel(channel); typingChannelRef.current = null }
  }, [activeId, user])

  function broadcastTyping() {
    if (!typingChannelRef.current || !user) return
    typingChannelRef.current.send({
      type: "broadcast", event: "typing", payload: { userId: user.id },
    })
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
    const { data: allMessages, error: msgError } = await supabase
      .from("messages").select("*").in("conversation_id", convoIds).order("created_at", { ascending: true })
    if (msgError) console.error(msgError)

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
          const mappedMsgs = msgs.map((m: any) => ({
            id: m.id,
            text: m.message,
            sender: m.sender_id === userId ? "me" : "them",
            time: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            status: m.read_at ? "seen" : m.delivered_at ? "delivered" : "sent",
            fileUrl: m.file_url,
            fileName: m.file_name,
            fileType: m.file_type,
          }))
          return {
            id: conversation.id,
            name: nameMap.get(otherId) || existing?.name || "Contact",
            avatar: "", color: existing?.color || "3b82f6", otherId, online: false,
            lastMessageAt: lastMsg ? lastMsg.created_at : conversation.created_at,
            lastMessage: lastMsg
              ? (lastMsg.message || (lastMsg.file_name ? `📎 ${lastMsg.file_name}` : ""))
              : "",
            timestamp: lastMsg
              ? new Date(lastMsg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
            unread: unreadCount,
            messages: mappedMsgs,
            isAI: false,
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
    const { data, error } = await supabase
      .from("ai_chats").insert({ user_id: user.id, title: "New Chat" }).select().single()
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

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
  }

  async function openAIChat(chatId: string) {
    setActiveAiChat(chatId)
    const { data, error } = await supabase
      .from("ai_messages").select("*").eq("chat_id", chatId).order("created_at")
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
          const { error } = await supabase.from("ai_messages").insert({
            chat_id: activeAiChat, user_id: user.id, message: text, response: data.reply,
          })
          if (error) console.error("AI Message Save Error:", error)
          const { data: currentChat } = await supabase
            .from("ai_chats").select("title").eq("id", activeAiChat).single()
          if (currentChat?.title === "New Chat") {
            await supabase.from("ai_chats").update({ title: text.slice(0, 40) }).eq("id", activeAiChat)
            await loadAIChats(user.id)
          }
        }
      } catch (error) {
        console.error("AI Error:", error)
        pushMessage(target.id, {
          id: `${target.id}-${Date.now()}-error`,
          text: "Sorry, I couldn't generate a response.", sender: "ai", time: nowTime(),
        }, "Sorry, I couldn't generate a response.")
      }
      return
    }

    // ---- User-to-user ----
    const { data: convRow } = await supabase.from("conversations").select("*").eq("id", target.id).single()
    if (!convRow) { console.error("Conversation not found:", target.id); return }
    const otherUserId = convRow.user1 === user.id ? convRow.user2 : convRow.user1

    const optimisticId = `optimistic-${Date.now()}`
    pushMessage(target.id, {
      id: optimisticId, text, sender: "me", time: nowTime(), status: "sent",
      fileUrl: file?.url, fileName: file?.name, fileType: file?.type,
    } as any, file ? (text || file.name) : text)

    const { data: inserted, error: msgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: target.id, sender_id: user.id, receiver_id: otherUserId,
        message: text,
        file_url: file?.url || null, file_name: file?.name || null, file_type: file?.type || null,
      })
      .select()
      .single()

    if (msgError) {
      console.error("MESSAGE INSERT ERROR:", msgError)
      setConvos((prev) => prev.map((c) =>
        c.id === target.id ? { ...c, messages: c.messages.filter((m) => m.id !== optimisticId) } : c
      ))
      return
    }

    // Replace optimistic ID with real DB UUID — critical for tick patching
    setConvos((prev) => prev.map((c) =>
      c.id !== target.id ? c : {
        ...c,
        messages: c.messages.map((m) =>
          m.id === optimisticId ? { ...m, id: inserted.id, status: "sent" } : m
        ),
      }
    ))

    await loadConversations(user.id)
    await supabase.from("conversations").update({ last_message: text || `📎 ${file?.name}` }).eq("id", target.id)
    socket.emit("send-message", { text, sender: user.id, conversationId: target.id })
  }

  // ---- Sidebar component (shared between mobile + desktop) ----
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

  // ---- Chat panel (shared) ----
  const chatPanelEl = active ? (
    <ChatPanel
      conversation={active}
      messages={active.messages}
      typing={typingConvoId === active.id}
      onSend={handleSend}
      // On mobile: onOpenSidebar goes back to sidebar view
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
          Start chatting, share files instantly, and enjoy fast, secure, real-time conversations.
        </p>
      </div>
    </div>
  )

  // ---- MOBILE LAYOUT ----
  if (isMobile) {
    return (
      <main className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
        {/* Header */}
        <div className="fixed top-0 left-0 right-0 z-40 flex justify-end border-b bg-background p-3">
          {user ? (
            <div className="flex items-center gap-3">
              {tab === "chats" && mobileView === "sidebar" && (
                <button
                  onClick={() => { setShowUsers(!showUsers); loadUsers() }}
                  className="flex items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-500 hover:text-white transition-all"
                >
                  <Search size={14} /><span>Contacts</span>
                </button>
              )}
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white">
                <User size={14} /><span>{profile?.name}</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500 hover:text-white transition-all"
              >
                <LogOut size={14} /><span>Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <a href="/login" className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white">
                <LogIn size={14} /><span>Login</span>
              </a>
              <a href="/signup" className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-3 py-1.5 text-xs text-white">
                <UserPlus size={14} /><span>Sign Up</span>
              </a>
            </div>
          )}
        </div>

        {/* Contacts dropdown */}
        {showUsers && tab === "chats" && (
          <div className="fixed right-3 top-14 z-50 w-72 rounded-xl border bg-white shadow-xl">
            <div className="max-h-72 overflow-y-auto">
              {allUsers.filter((u) => u.id !== user?.id).map((u) => (
                <button key={u.id}
                  className="flex w-full items-center justify-between border-b p-3 text-left hover:bg-slate-100"
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
        )}

        {/* Body — sidebar OR chat, never both on mobile */}
        <div className="flex flex-1 flex-col pt-[52px]">
          {mobileView === "sidebar" ? (
            <div className="flex-1 overflow-hidden">{sidebarEl}</div>
          ) : (
            <div className="flex-1 overflow-hidden">{chatPanelEl}</div>
          )}
        </div>
      </main>
    )
  }

  // ---- DESKTOP LAYOUT ----
  return (
    <main className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden w-80 shrink-0 border-r border-sidebar-border md:block">
        {sidebarEl}
      </aside>

      {/* Mobile slide-over (only shown when sidebarOpen on desktop-ish sizes) */}
      <div className={cn("fixed inset-0 z-50 md:hidden", sidebarOpen ? "pointer-events-auto" : "pointer-events-none")}>
        <div
          className={cn("absolute inset-0 bg-background/70 backdrop-blur-sm transition-opacity", sidebarOpen ? "opacity-100" : "opacity-0")}
          onClick={() => setSidebarOpen(false)} aria-hidden="true"
        />
        <div className={cn("absolute left-0 top-0 h-full w-80 max-w-[85%] border-r border-sidebar-border shadow-xl transition-transform duration-300", sidebarOpen ? "translate-x-0" : "-translate-x-full")}>
          {sidebarEl}
        </div>
      </div>

      <section className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex justify-end border-b p-4">
          {user ? (
            <div className="flex items-center gap-8">
              {tab === "chats" && (
                <button
                  onClick={() => { setShowUsers(!showUsers); loadUsers() }}
                  className="flex items-center gap-2 rounded-2xl border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-blue-400 shadow-md transition-all duration-300 hover:scale-105 hover:bg-blue-500 hover:text-white"
                >
                  <Search size={18} /><span>Contacts</span>
                </button>
              )}
              <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-white shadow-md transition-all duration-300 hover:scale-105 hover:border-cyan-500 hover:shadow-cyan-500/30">
                <User size={18} /><span>{profile?.name}</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-2 text-red-400 shadow-md transition-all duration-300 hover:scale-105 hover:bg-red-500 hover:text-white hover:shadow-red-500/40"
              >
                <LogOut size={18} /><span>Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-8">
              <a href="/login" className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-5 py-2 text-white shadow-md transition-all duration-300 hover:scale-105 hover:border-cyan-500 hover:shadow-cyan-500/30">
                <LogIn size={20} /><span>Login</span>
              </a>
              <a href="/signup" className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-2 text-white shadow-md transition-all duration-300 hover:scale-105 hover:shadow-purple-500/40">
                <UserPlus size={18} /><span>Sign Up</span>
              </a>
            </div>
          )}
        </div>

        {showUsers && tab === "chats" && (
          <div className="absolute right-4 top-20 z-50 w-80 rounded-xl border bg-white shadow-xl">
            <div className="max-h-80 overflow-y-auto">
              {allUsers.filter((u) => u.id !== user?.id).map((u) => (
                <button key={u.id}
                  className="flex w-full items-center justify-between border-b p-3 text-left hover:bg-slate-100"
                  onClick={() => { startConversation(u); setShowUsers(false) }}
                >
                  <div>
                    <p className="font-semibold text-black">{u.name}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {chatPanelEl}
        </div>
      </section>
    </main>
  )
}
