import type { TeamRole } from '@/lib/team'

export type TeamChatKind = 'direct' | 'group'

export type TeamChatMember = {
  membershipId: string
  organizationId: string
  userId: string
  role: TeamRole
  fullName: string | null
  email: string | null
  avatarUrl: string | null
}

export type TeamChatConversation = {
  id: string
  organizationId: string
  kind: TeamChatKind
  name: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  lastMessageAt: string | null
  lastMessageBody: string | null
  lastMessageSenderId: string | null
  unreadCount: number
  memberCount: number
  memberUserIds: string[]
}

export type TeamChatMessage = {
  id: string
  organizationId: string
  conversationId: string
  senderUserId: string
  body: string
  createdAt: string
  readByCount: number
}

export type TeamChatMessageReaction = {
  id: string
  organizationId: string
  conversationId: string
  messageId: string
  userId: string
  emoji: string
  createdAt: string
  updatedAt: string
}

export type TeamChatTyping = {
  conversationId: string
  userId: string
  isTyping: boolean
  expiresAt: string
}

export type TeamChatPresence = {
  userId: string
  lastSeenAt: string
  isOnline: boolean
}
