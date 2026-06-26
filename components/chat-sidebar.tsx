import { useState } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { Conversation } from "@/lib/chat-data"
import {
  Bot,
  MessagesSquare,
  Search,
  X,
  MoreVertical,
  Trash2,
} from "lucide-react"
type Tab = "chats" | "ai"

type SidebarProps = {
  conversations: Conversation[]
  activeId: string
  onSelect: (id: string) => void
  tab: Tab
  onTabChange: (tab: Tab) => void
  search: string
  onSearch: (value: string) => void
  onClose: () => void

  aiChats: any[]
  createNewAIChat: () => void
  openAIChat: (chatId: string) => void
  deleteAIChat: (chatId: string) => void
  typingConvoId?: string | null
}
export function Sidebar({
  conversations,
  activeId,
  onSelect,
  tab,
  onTabChange,
  search,
  onSearch,
  onClose,
  aiChats,
  createNewAIChat,
  openAIChat,
  deleteAIChat,
  typingConvoId,
}: SidebarProps) {

  const filtered = conversations.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )
const [menuOpen, setMenuOpen] = useState<string | null>(null)
  

  return (
    <div className="flex h-full w-full flex-col bg-sidebar">
      <div className="flex items-center justify-between gap-2 border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <MessagesSquare className="size-5" aria-hidden="true" />
          </div>
          <span className="text-lg font-semibold tracking-tight">ConnectAI</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground md:hidden"
          aria-label="Close sidebar"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search contacts..."
            className="border-sidebar-border bg-sidebar-accent pl-9 text-sm"
            aria-label="Search contacts"
          />
        </div>
      </div>

      <div className="flex gap-1 px-3 pb-2">
        <TabButton
          active={tab === "chats"}
          onClick={() => onTabChange("chats")}
        >
          <MessagesSquare className="size-4" />
          Chats
        </TabButton>

        <TabButton
          active={tab === "ai"}
          onClick={() => onTabChange("ai")}
        >
          <Bot className="size-4" />
          AI Assistant
        </TabButton>
      </div>

      {tab === "chats" && (
        <ScrollArea className="flex-1 px-2">
          <div className="flex flex-col gap-1 pb-3">
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No conversations yet
              </p>
            )}

            {filtered.map((c) => {
              const isActive = c.id === activeId
              const initials = c.name?.[0]?.toUpperCase() || "?"

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg p-2.5 text-left transition-colors",
                    isActive
                      ? "bg-primary/10"
                      : "hover:bg-sidebar-accent"
                  )}
                >
                  <div className="relative shrink-0">
                    <Avatar className="size-10">
                      <AvatarImage src={c.avatar || undefined} alt={c.name} />
                      <AvatarFallback
                        style={{ backgroundColor: `#${c.color || "3b82f6"}` }}
                        className="text-white"
                      >
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    {c.online && (
                      <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-sidebar bg-green-500" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {c.name}
                      </p>
                      {c.timestamp && (
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {c.timestamp}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-muted-foreground">
                        {typingConvoId === c.id ? (
                          <span className="text-primary">typing...</span>
                        ) : (
                          (() => {
                            const lastMsg = c.messages?.[c.messages.length - 1];
                            const isMine = lastMsg?.sender === "me";
                            const status = (lastMsg as any)?.status;
                           // After — seen gets a blue indicator
                            const tick = isMine
                              ? status === "seen"
                                ? "🔵✓✓ "
                                : status === "delivered"
                                ? "✓✓ "
                                : "✓ "
                              : "";
                            return `${tick}${c.lastMessage || "No messages yet"}`;
                          })()
                        )}
                      </p>
                      {c.unread > 0 && (
                        <Badge className="h-5 min-w-5 shrink-0 justify-center rounded-full bg-primary px-1.5 text-[11px]">
                          {c.unread}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      )}

      {tab === "ai" && (
        <div className="px-3 pb-2">
          <button
            onClick={createNewAIChat}
            className="mb-2 w-full rounded-lg bg-purple-600 p-2 text-white"
          >
            + New AI Chat
          </button>
          {aiChats.map((chat) => (
  <div
    key={chat.id}
    className="relative mb-2 rounded-lg hover:bg-slate-800"
  >
    <div
      onClick={() => openAIChat(chat.id)}
      className="cursor-pointer p-2 pr-10"
    >
      <div className="truncate font-medium">
        {chat.title}
      </div>

      <div className="text-xs text-slate-400">
        {new Date(chat.created_at).toLocaleDateString()}
      </div>
    </div>

    <button
      onClick={(e) => {
        e.stopPropagation()
        setMenuOpen(menuOpen === chat.id ? null : chat.id)
      }}
      className="absolute right-2 top-2 rounded p-1 hover:bg-slate-700"
    >
      <MoreVertical size={18} />
    </button>

    {menuOpen === chat.id && (
      <div className="absolute right-2 top-10 z-50 rounded-lg border bg-slate-900 shadow-lg">
        <button
          onClick={() => {
            deleteAIChat(chat.id)
            setMenuOpen(null)
          }}
          className="flex w-full items-center gap-2 px-4 py-2 text-red-500 hover:bg-slate-800"
        >
          <Trash2 size={16} />
          Delete Chat
        </button>
      </div>
    )}
  </div>
))}
         
        </div>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
