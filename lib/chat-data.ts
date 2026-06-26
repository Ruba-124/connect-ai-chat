
export type Message = {
  id: string
  text: string
  sender: "me" | "them" | "ai"
  time: string
  status?: "sent" | "delivered" | "seen"

  fileUrl?: string
  fileName?: string
  fileType?: string
}

export type Conversation = {
  id: string
  name: string
  avatar: string
  color: string
  online: boolean
  lastMessage: string
  timestamp: string
  unread: number
  isAI?: boolean
  messages: Message[]
}

function avatarUrl(name: string, bg: string) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name,
  )}&background=${bg}&color=fff&bold=true&size=128`
}

export const currentUser = {
  name: "You",
  avatar: avatarUrl("You", "7c3aed"),
}

export const conversations: Conversation[] = [];
export const aiSuggestions = [
  "Summarize this",
  "Explain like I'm 5",
  "Write an email",
];
  

export function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}
