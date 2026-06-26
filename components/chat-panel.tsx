"use client"

import { useEffect, useRef, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import type { Conversation, Message } from "@/lib/chat-data"
import { Send, Menu, Check, CheckCheck, Paperclip, Smile, X, FileText, Loader2 } from "lucide-react"
import EmojiPicker from "emoji-picker-react";

type ChatPanelProps = {
  conversation: Conversation
  messages: Message[]
  typing: boolean
  onSend: (text: string, file?: { url: string; name: string; type: string }) => void
  onOpenSidebar: () => void
  onTyping?: () => void
}

function Tick({ status }: { status?: "sent" | "delivered" | "seen" }) {
  if (!status) return null

  if (status === "sent") {
    return <Check className="size-3.5 text-muted-foreground" aria-label="Sent" />
  }

  if (status === "delivered") {
    return <CheckCheck className="size-3.5 text-muted-foreground" aria-label="Delivered" />
  }

  return <CheckCheck className="size-3.5 text-blue-500" aria-label="Seen" />
}

function isImageType(type?: string) {
  return !!type && type.startsWith("image/")
}

function AttachmentBubbleContent({
  fileUrl,
  fileName,
  fileType,
}: {
  fileUrl: string
  fileName?: string
  fileType?: string
}) {
  if (isImageType(fileType)) {
    return (
      <a href={fileUrl} target="_blank" rel="noopener noreferrer">
        <img
          src={fileUrl}
          alt={fileName || "attachment"}
          className="max-h-60 w-full rounded-lg object-cover"
        />
      </a>
      
    )
  }

  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg bg-background/40 p-2"
    >
      <FileText className="size-5 shrink-0" />
      <span className="truncate text-sm underline">{fileName || "Attachment"}</span>
    </a>
  )
}

export function ChatPanel({
  conversation,
  messages,
  typing,
  onSend,
  onOpenSidebar,
  onTyping,
}: ChatPanelProps) {
  const [text, setText] = useState("")
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, typing])

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
    }
  }, [pendingPreviewUrl])

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // 10MB limit — adjust as needed
    if (file.size > 10 * 1024 * 1024) {
      alert("File is too large. Max size is 10MB.")
      return
    }

    setPendingFile(file)
    if (file.type.startsWith("image/")) {
      setPendingPreviewUrl(URL.createObjectURL(file))
    } else {
      setPendingPreviewUrl(null)
    }

    // reset input so picking the same file again still fires onChange
    e.target.value = ""
  }

  function clearPendingFile() {
    setPendingFile(null)
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
    setPendingPreviewUrl(null)
  }

  async function handleSubmit() {
    const trimmed = text.trim()

    if (!trimmed && !pendingFile) return

    if (pendingFile) {
      setUploading(true)
      try {
        const fileExt = pendingFile.name.split(".").pop()
        const filePath = `${conversation.id}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from("chat-attachments")
          .upload(filePath, pendingFile)

        if (uploadError) {
          console.error("Upload error:", uploadError)
          alert("Failed to upload file. Please try again.")
          setUploading(false)
          return
        }

        const { data: publicUrlData } = supabase.storage
          .from("chat-attachments")
          .getPublicUrl(filePath)

        onSend(trimmed, {
          url: publicUrlData.publicUrl,
          name: pendingFile.name,
          type: pendingFile.type,
        })

        clearPendingFile()
        setText("")
        
setShowEmojiPicker(false)
      } finally {
        setUploading(false)
      }
      return
    }

    onSend(trimmed)
    setText("")
setShowEmojiPicker(false)
  }

  function handleChange(value: string) {
    setText(value)
    if (onTyping) onTyping()
  }
function handleEmojiClick(emojiData: any) {
  setText((prev) => prev + emojiData.emoji)

  if (onTyping) {
    onTyping()
  }

  setShowEmojiPicker(false)
}

  const initials = conversation.name?.[0]?.toUpperCase() || "?"

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent md:hidden"
            aria-label="Open sidebar"
          >
            <Menu className="size-5" />
          </button>

          <Avatar className="size-10">
            <AvatarImage src={conversation.avatar || undefined} alt={conversation.name} />
            <AvatarFallback
              style={{ backgroundColor: `#${conversation.color || "3b82f6"}` }}
              className="text-white"
            >
              {initials}
            </AvatarFallback>
          </Avatar>

          <div>
            <p className="font-semibold leading-tight">{conversation.name}</p>
            <p className="text-xs leading-tight text-muted-foreground">
              {typing ? (
                <span className="text-primary">typing...</span>
              ) : conversation.isAI ? (
                "Online"
              ) : conversation.online ? (
                "Online"
              ) : (
                "Offline"
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          {messages.map((m) => {
            const isMine = m.sender === "me"
            const fileUrl = (m as any).fileUrl as string | undefined
            const fileName = (m as any).fileName as string | undefined
            const fileType = (m as any).fileType as string | undefined

            return (
              <div
                key={m.id}
                className={cn("flex", isMine ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
                    isMine
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {fileUrl && (
                    <div className={cn(m.text ? "mb-2" : "")}>
                      <AttachmentBubbleContent
                        fileUrl={fileUrl}
                        fileName={fileName}
                        fileType={fileType}
                      />
                    </div>
                  )}

                  {m.text && (
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  )}

                  <div
                    className={cn(
                      "mt-1 flex items-center gap-1 text-[11px]",
                      isMine ? "justify-end text-primary-foreground/70" : "text-muted-foreground"
                    )}
                  >
                    <span>{m.time}</span>
                    {isMine && !conversation.isAI && (
                      <Tick status={(m as any).status} />
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {typing && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-3">
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pending file preview */}
      {pendingFile && (
        <div className="flex items-center gap-3 border-t bg-muted/40 p-3">
          {pendingPreviewUrl ? (
            <img
              src={pendingPreviewUrl}
              alt="preview"
              className="size-12 rounded-lg object-cover"
            />
          ) : (
            <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
              <FileText className="size-6 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{pendingFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {(pendingFile.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <button
            type="button"
            onClick={clearPendingFile}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
            aria-label="Remove attachment"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 border-t p-3">
       <div className="relative">

  <button
    type="button"
    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
    className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
    aria-label="Emoji"
  >
    <Smile className="size-5" />
  </button>

  {showEmojiPicker && (
    <div className="absolute bottom-12 left-0 z-50">
      <EmojiPicker
        onEmojiClick={handleEmojiClick}
      />
    </div>
  )}

</div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.doc,.docx,.txt,.zip"
          className="hidden"
          onChange={handlePickFile}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
          aria-label="Attach file"
        >
          <Paperclip className="size-5" />
        </button>

        <Input
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder={`Message ${conversation.name}...`}
          className="flex-1"
        />

        <Button onClick={handleSubmit} size="icon" aria-label="Send message" disabled={uploading}>
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
    </div>
  )
}

