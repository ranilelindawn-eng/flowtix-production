'use client'

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Check,
  CheckCheck,
  ChevronLeft,
  Circle,
  Edit3,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  Minus,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Smile,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import type { TeamRole } from '@/lib/team'
import type {
  TeamChatConversation,
  TeamChatMember,
  TeamChatMessage,
  TeamChatPresence,
  TeamChatTyping,
} from '@/components/team-chat/types'

type TeamChatDockProps = {
  organizationId: string
  currentUserId: string
  currentUserName: string
  currentUserEmail: string
  currentUserAvatarUrl: string | null
  role: TeamRole
}

type RawRecord = Record<string, unknown>

type ChatView = 'all' | 'direct' | 'group'
type ComposerMode = 'direct' | 'group' | 'manage-group' | null

const MAX_OPEN_TABS = 4
const ONLINE_WINDOW_MS = 120_000

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null
}

function toStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function toNumberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function isTeamRole(value: unknown): value is TeamRole {
  return (
    value === 'owner' ||
    value === 'admin' ||
    value === 'manager' ||
    value === 'agent'
  )
}

function parseMember(value: unknown): TeamChatMember | null {
  if (!isRecord(value)) return null

  const membershipId = toStringValue(value.id)
  const organizationId = toStringValue(value.organization_id)
  const userId = toStringValue(value.user_id)
  const role = value.role

  if (!membershipId || !organizationId || !userId || !isTeamRole(role)) {
    return null
  }

  return {
    membershipId,
    organizationId,
    userId,
    role,
    fullName: toStringValue(value.full_name),
    email: toStringValue(value.email),
    avatarUrl: toStringValue(value.avatar_url),
  }
}

function parseConversation(value: unknown): TeamChatConversation | null {
  if (!isRecord(value)) return null

  const id = toStringValue(value.conversation_id)
  const organizationId = toStringValue(value.organization_id)
  const kind = value.kind
  const createdBy = toStringValue(value.created_by)
  const createdAt = toStringValue(value.created_at)
  const updatedAt = toStringValue(value.updated_at)

  if (
    !id ||
    !organizationId ||
    (kind !== 'direct' && kind !== 'group') ||
    !createdBy ||
    !createdAt ||
    !updatedAt
  ) {
    return null
  }

  const rawMemberIds = Array.isArray(value.member_user_ids)
    ? value.member_user_ids
    : []

  return {
    id,
    organizationId,
    kind,
    name: toStringValue(value.name),
    createdBy,
    createdAt,
    updatedAt,
    lastMessageAt: toStringValue(value.last_message_at),
    lastMessageBody: toStringValue(value.last_message_body),
    lastMessageSenderId: toStringValue(value.last_message_sender_id),
    unreadCount: toNumberValue(value.unread_count),
    memberCount: toNumberValue(value.member_count),
    memberUserIds: rawMemberIds.filter(
      (memberId): memberId is string => typeof memberId === 'string',
    ),
  }
}

function parseMessage(value: unknown): TeamChatMessage | null {
  if (!isRecord(value)) return null

  const id = toStringValue(value.id)
  const organizationId = toStringValue(value.organization_id)
  const conversationId = toStringValue(value.conversation_id)
  const senderUserId = toStringValue(value.sender_user_id)
  const body = toStringValue(value.body)
  const createdAt = toStringValue(value.created_at)

  if (
    !id ||
    !organizationId ||
    !conversationId ||
    !senderUserId ||
    !body ||
    !createdAt
  ) {
    return null
  }

  return {
    id,
    organizationId,
    conversationId,
    senderUserId,
    body,
    createdAt,
    readByCount: toNumberValue(value.read_by_count),
  }
}

function parsePresence(value: unknown): TeamChatPresence | null {
  if (!isRecord(value)) return null
  const userId = toStringValue(value.user_id)
  const lastSeenAt = toStringValue(value.last_seen_at)
  if (!userId || !lastSeenAt) return null
  return {
    userId,
    lastSeenAt,
    isOnline: value.is_online === true,
  }
}

function parseTyping(value: unknown): TeamChatTyping | null {
  if (!isRecord(value)) return null
  const conversationId = toStringValue(value.conversation_id)
  const userId = toStringValue(value.user_id)
  const expiresAt = toStringValue(value.expires_at)
  if (!conversationId || !userId || !expiresAt) return null

  return {
    conversationId,
    userId,
    isTyping: value.is_typing === true,
    expiresAt,
  }
}

function formatRelativeTime(value: string | null): string {
  if (!value) return ''
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ''

  const deltaSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (deltaSeconds < 60) return 'now'
  const minutes = Math.floor(deltaSeconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function formatMessageTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function displayMemberName(member: TeamChatMember | undefined): string {
  if (!member) return 'Team member'
  return member.fullName?.trim() || member.email?.trim() || 'Team member'
}

function initialsFor(value: string): string {
  const tokens = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  if (tokens.length === 0) return 'FT'
  return tokens.map((token) => token[0]?.toUpperCase() ?? '').join('') || 'FT'
}

function ChatAvatar({
  label,
  avatarUrl,
  online,
  group,
  size = 'md',
}: {
  label: string
  avatarUrl?: string | null
  online?: boolean
  group?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClass =
    size === 'sm'
      ? 'h-8 w-8 text-[10px]'
      : size === 'lg'
        ? 'h-11 w-11 text-xs'
        : 'h-9 w-9 text-[11px]'

  return (
    <div className="relative shrink-0">
      <div
        className={`flex ${sizeClass} items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-violet-500/35 to-cyan-400/20 font-semibold text-white shadow-[0_8px_25px_rgba(76,29,149,0.18)]`}
        style={
          avatarUrl && !group
            ? {
                backgroundImage: `linear-gradient(rgba(7,12,25,.08),rgba(7,12,25,.08)),url("${avatarUrl.replaceAll('"', '%22')}")`,
                backgroundPosition: 'center',
                backgroundSize: 'cover',
              }
            : undefined
        }
        aria-hidden="true"
      >
        {group ? <UsersRound className="h-4 w-4" /> : avatarUrl ? null : initialsFor(label)}
      </div>
      {online !== undefined ? (
        <span
          className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0A1321] ${online ? 'bg-emerald-400' : 'bg-slate-500'}`}
          aria-label={online ? 'Online' : 'Offline'}
        />
      ) : null}
    </div>
  )
}

export default function TeamChatDock({
  organizationId,
  currentUserId,
  currentUserName,
  currentUserEmail,
  currentUserAvatarUrl,
  role,
}: TeamChatDockProps) {
  const [supabase] = useState(() => createClient())
  const [panelOpen, setPanelOpen] = useState(false)
  const [view, setView] = useState<ChatView>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [members, setMembers] = useState<TeamChatMember[]>([])
  const [conversations, setConversations] = useState<TeamChatConversation[]>([])
  const [messagesByConversation, setMessagesByConversation] = useState<
    Record<string, TeamChatMessage[]>
  >({})
  const [openConversationIds, setOpenConversationIds] = useState<string[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [presence, setPresence] = useState<Record<string, TeamChatPresence>>({})
  const [typingByConversation, setTypingByConversation] = useState<
    Record<string, TeamChatTyping[]>
  >({})
  const [loadingBootstrap, setLoadingBootstrap] = useState(true)
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null)
  const [sendingConversationId, setSendingConversationId] = useState<string | null>(null)
  const [composerMode, setComposerMode] = useState<ComposerMode>(null)
  const [newChatTab, setNewChatTab] = useState<'direct' | 'group'>('direct')
  const [groupName, setGroupName] = useState('')
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([])
  const [creatingConversation, setCreatingConversation] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [clockTick, setClockTick] = useState(() => Date.now())

  const activeConversationIdRef = useRef<string | null>(null)
  const panelOpenRef = useRef(false)
  const typingStopTimerRef = useRef<number | null>(null)
  const typingConversationRef = useRef<string | null>(null)
  const lastTypingSentRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    panelOpenRef.current = panelOpen
  }, [panelOpen])

  const memberByUserId = useMemo(() => {
    return new Map(members.map((member) => [member.userId, member]))
  }, [members])

  const currentMember = memberByUserId.get(currentUserId)
  const currentDisplayName = currentMember ? displayMemberName(currentMember) : currentUserName
  const currentDisplayEmail = currentMember?.email?.trim() || currentUserEmail
  const currentDisplayAvatarUrl = currentMember?.avatarUrl ?? currentUserAvatarUrl

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  )

  const currentMessages = activeConversationId
    ? messagesByConversation[activeConversationId] ?? []
    : []

  const isUserOnline = useCallback(
    (userId: string) => {
      const status = presence[userId]
      if (!status?.isOnline) return false
      const timestamp = new Date(status.lastSeenAt).getTime()
      return Number.isFinite(timestamp) && clockTick - timestamp <= ONLINE_WINDOW_MS
    },
    [clockTick, presence],
  )

  const getConversationDisplay = useCallback(
    (conversation: TeamChatConversation) => {
      if (conversation.kind === 'group') {
        return {
          label: conversation.name?.trim() || 'Group chat',
          avatarUrl: null,
          otherUserId: null,
        }
      }

      const otherUserId =
        conversation.memberUserIds.find((userId) => userId !== currentUserId) ?? null
      const member = otherUserId ? memberByUserId.get(otherUserId) : undefined

      return {
        label: displayMemberName(member),
        avatarUrl: member?.avatarUrl ?? null,
        otherUserId,
      }
    },
    [currentUserId, memberByUserId],
  )

  const totalUnread = useMemo(
    () => conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [conversations],
  )

  const filteredConversations = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase()

    return conversations.filter((conversation) => {
      if (view !== 'all' && conversation.kind !== view) return false
      if (!normalizedSearch) return true

      const display = getConversationDisplay(conversation)
      const haystack = [display.label, conversation.lastMessageBody ?? '']
        .join(' ')
        .toLocaleLowerCase()
      return haystack.includes(normalizedSearch)
    })
  }, [conversations, getConversationDisplay, searchQuery, view])

  const refreshMembers = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_current_organization_team_members')
    if (error) throw error

    const parsed = (Array.isArray(data) ? data : [])
      .map(parseMember)
      .filter((member): member is TeamChatMember => Boolean(member))
      .filter((member) => member.organizationId === organizationId)

    setMembers(parsed)
  }, [organizationId, supabase])

  const refreshConversations = useCallback(async () => {
    const { data, error } = await supabase.rpc('team_chat_list_conversations')
    if (error) throw error

    const parsed = (Array.isArray(data) ? data : [])
      .map(parseConversation)
      .filter((conversation): conversation is TeamChatConversation => Boolean(conversation))
      .filter((conversation) => conversation.organizationId === organizationId)

    setConversations(parsed)
    return parsed
  }, [organizationId, supabase])

  const refreshPresence = useCallback(async () => {
    const { data, error } = await supabase
      .from('team_chat_presence')
      .select('user_id,last_seen_at,is_online')
      .eq('organization_id', organizationId)

    if (error) throw error

    const nextPresence: Record<string, TeamChatPresence> = {}
    for (const row of Array.isArray(data) ? data : []) {
      const parsed = parsePresence(row)
      if (parsed) nextPresence[parsed.userId] = parsed
    }
    setPresence(nextPresence)
  }, [organizationId, supabase])

  const refreshTyping = useCallback(
    async (conversationId: string) => {
      const { data, error } = await supabase
        .from('team_chat_typing')
        .select('conversation_id,user_id,is_typing,expires_at')
        .eq('conversation_id', conversationId)

      if (error) return

      const rows = (Array.isArray(data) ? data : [])
        .map(parseTyping)
        .filter((typing): typing is TeamChatTyping => Boolean(typing))

      setTypingByConversation((current) => ({
        ...current,
        [conversationId]: rows,
      }))
    },
    [supabase],
  )

  const markConversationRead = useCallback(
    async (conversationId: string) => {
      const { error } = await supabase.rpc('team_chat_mark_read', {
        p_conversation_id: conversationId,
      })
      if (error) return

      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, unreadCount: 0 }
            : conversation,
        ),
      )
    },
    [supabase],
  )

  const loadMessages = useCallback(
    async (conversationId: string, showLoader = true) => {
      if (showLoader) setLoadingConversationId(conversationId)

      const { data, error } = await supabase.rpc('team_chat_get_messages', {
        p_conversation_id: conversationId,
        p_limit: 150,
      })

      if (showLoader) setLoadingConversationId(null)
      if (error) throw error

      const parsed = (Array.isArray(data) ? data : [])
        .map(parseMessage)
        .filter((message): message is TeamChatMessage => Boolean(message))
        .filter((message) => message.organizationId === organizationId)

      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: parsed,
      }))
    },
    [organizationId, supabase],
  )

  const touchPresence = useCallback(async () => {
    const { data, error } = await supabase.rpc('team_chat_touch_presence')
    if (error) return

    const timestamp = typeof data === 'string' ? data : new Date().toISOString()
    setPresence((current) => ({
      ...current,
      [currentUserId]: {
        userId: currentUserId,
        lastSeenAt: timestamp,
        isOnline: true,
      },
    }))
  }, [currentUserId, supabase])

  const setTypingState = useCallback(
    async (conversationId: string, isTyping: boolean) => {
      await supabase.rpc('team_chat_set_typing', {
        p_conversation_id: conversationId,
        p_is_typing: isTyping,
      })
    },
    [supabase],
  )

  const openConversation = useCallback(
    (conversationId: string) => {
      const previousConversationId = activeConversationIdRef.current
      if (
        previousConversationId &&
        previousConversationId !== conversationId &&
        lastTypingSentRef.current
      ) {
        lastTypingSentRef.current = false
        void setTypingState(previousConversationId, false)
      }

      setPanelOpen(true)
      setComposerMode(null)
      setActiveConversationId(conversationId)
      setOpenConversationIds((current) => {
        const next = [...current.filter((id) => id !== conversationId), conversationId]
        return next.slice(-MAX_OPEN_TABS)
      })
      setErrorMessage(null)
      void loadMessages(conversationId).catch((error: unknown) => {
        console.error('Unable to load team chat messages:', error)
        setErrorMessage('Unable to load this conversation. Please try again.')
      })
      void markConversationRead(conversationId)
      void refreshTyping(conversationId)
    },
    [loadMessages, markConversationRead, refreshTyping, setTypingState],
  )

  const bootstrap = useCallback(async () => {
    try {
      await Promise.all([refreshMembers(), refreshConversations(), refreshPresence()])
      await touchPresence()
    } catch (error) {
      console.error('Unable to initialize Team Chat:', error)
      setErrorMessage('Team Chat could not be loaded. Your other Flowtix modules are unaffected.')
    } finally {
      setLoadingBootstrap(false)
    }
  }, [refreshConversations, refreshMembers, refreshPresence, touchPresence])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void bootstrap()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [bootstrap])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockTick(Date.now())
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void touchPresence()
      }
    }, 60_000)

    const memberDirectoryRefresh = window.setInterval(() => {
      if (panelOpen && document.visibilityState === 'visible') {
        void refreshMembers()
      }
    }, 15_000)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void touchPresence()
        if (panelOpen) {
          void refreshMembers()
        }
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(heartbeat)
      window.clearInterval(memberDirectoryRefresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [panelOpen, refreshMembers, touchPresence])

  useEffect(() => {
    return () => {
      if (typingStopTimerRef.current) {
        window.clearTimeout(typingStopTimerRef.current)
      }
      const conversationId = typingConversationRef.current
      if (conversationId && lastTypingSentRef.current) {
        void setTypingState(conversationId, false)
      }
    }
  }, [setTypingState])

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        void touchPresence()
        return
      }

      if (event === 'SIGNED_OUT') {
        setPresence((current) => ({
          ...current,
          [currentUserId]: {
            userId: currentUserId,
            lastSeenAt: new Date().toISOString(),
            isOnline: false,
          },
        }))
      }
    })

    return () => {
      data.subscription.unsubscribe()
    }
  }, [currentUserId, supabase, touchPresence])

  useEffect(() => {
    const channel = supabase
      .channel(`flowtix-team-chat-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_chat_messages',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const message = parseMessage(payload.new)
          if (!message) return

          setMessagesByConversation((current) => {
            const existing = current[message.conversationId] ?? []
            if (existing.some((item) => item.id === message.id)) return current
            return {
              ...current,
              [message.conversationId]: [...existing, message],
            }
          })

          void refreshConversations()

          if (
            activeConversationIdRef.current === message.conversationId &&
            panelOpenRef.current
          ) {
            void markConversationRead(message.conversationId)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'team_chat_conversations',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          void refreshConversations()
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_chat_members',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          void refreshConversations()
          const conversationId =
            isRecord(payload.new) && typeof payload.new.conversation_id === 'string'
              ? payload.new.conversation_id
              : isRecord(payload.old) && typeof payload.old.conversation_id === 'string'
                ? payload.old.conversation_id
                : null
          if (conversationId && conversationId === activeConversationIdRef.current) {
            void loadMessages(conversationId, false)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_chat_presence',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const row = parsePresence(payload.new)
          if (!row) return
          setPresence((current) => ({
            ...current,
            [row.userId]: row,
          }))
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_chat_typing',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const typing = parseTyping(payload.new)
          if (!typing) return
          setTypingByConversation((current) => {
            const rows = current[typing.conversationId] ?? []
            return {
              ...current,
              [typing.conversationId]: [
                ...rows.filter((row) => row.userId !== typing.userId),
                typing,
              ],
            }
          })
        },
      )
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Team Chat Realtime channel error:', error)
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [
    loadMessages,
    markConversationRead,
    organizationId,
    refreshConversations,
    supabase,
  ])

  useEffect(() => {
    const end = messagesEndRef.current
    if (!end || !activeConversationId) return
    end.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [activeConversationId, currentMessages.length])

  const activeTypingMembers = useMemo(() => {
    if (!activeConversationId) return []
    const now = clockTick
    return (typingByConversation[activeConversationId] ?? [])
      .filter(
        (typing) =>
          typing.userId !== currentUserId &&
          typing.isTyping &&
          new Date(typing.expiresAt).getTime() > now,
      )
      .map((typing) => memberByUserId.get(typing.userId))
      .filter((member): member is TeamChatMember => Boolean(member))
  }, [
    activeConversationId,
    clockTick,
    currentUserId,
    memberByUserId,
    typingByConversation,
  ])

  const activeDisplay = activeConversation
    ? getConversationDisplay(activeConversation)
    : null

  const activeOnline = activeConversation
    ? activeConversation.kind === 'direct'
      ? activeDisplay?.otherUserId
        ? isUserOnline(activeDisplay.otherUserId)
        : false
      : activeConversation.memberUserIds.some(
          (userId) => userId !== currentUserId && isUserOnline(userId),
        )
    : false

  const activeOnlineCount =
    activeConversation?.kind === 'group'
      ? activeConversation.memberUserIds.filter((userId) => isUserOnline(userId)).length
      : 0

  const canManageActiveGroup = Boolean(
    activeConversation?.kind === 'group' &&
      (activeConversation.createdBy === currentUserId || role === 'owner' || role === 'admin'),
  )

  const mobileThreadOpen = Boolean(activeConversationId || composerMode)

  const beginNewConversation = () => {
    setComposerMode('direct')
    setNewChatTab('direct')
    setGroupName('')
    setSelectedGroupMembers([])
    setErrorMessage(null)
    setPanelOpen(true)
  }

  const createDirectConversation = async (targetUserId: string) => {
    setCreatingConversation(true)
    setErrorMessage(null)
    try {
      const { data, error } = await supabase.rpc('team_chat_create_direct', {
        target_user_id: targetUserId,
      })
      if (error) throw error
      if (typeof data !== 'string') throw new Error('Invalid direct conversation response.')

      await refreshConversations()
      setComposerMode(null)
      openConversation(data)
    } catch (error) {
      console.error('Unable to create direct Team Chat:', error)
      setErrorMessage('Unable to start this chat. Please try again.')
    } finally {
      setCreatingConversation(false)
    }
  }

  const createGroupConversation = async () => {
    const normalizedName = groupName.trim()
    if (!normalizedName || selectedGroupMembers.length === 0) {
      setErrorMessage('Enter a group name and select at least one teammate.')
      return
    }

    setCreatingConversation(true)
    setErrorMessage(null)
    try {
      const { data, error } = await supabase.rpc('team_chat_create_group', {
        p_name: normalizedName,
        p_member_user_ids: selectedGroupMembers,
      })
      if (error) throw error
      if (typeof data !== 'string') throw new Error('Invalid group conversation response.')

      await refreshConversations()
      setComposerMode(null)
      setGroupName('')
      setSelectedGroupMembers([])
      openConversation(data)
    } catch (error) {
      console.error('Unable to create Team Chat group:', error)
      setErrorMessage('Unable to create the group. Please try again.')
    } finally {
      setCreatingConversation(false)
    }
  }

  const beginManageGroup = () => {
    if (!activeConversation || activeConversation.kind !== 'group') return
    setGroupName(activeConversation.name ?? '')
    setSelectedGroupMembers(
      activeConversation.memberUserIds.filter((userId) => userId !== currentUserId && memberByUserId.has(userId)),
    )
    setComposerMode('manage-group')
    setErrorMessage(null)
  }

  const updateGroupConversation = async () => {
    if (!activeConversation || activeConversation.kind !== 'group') return
    const normalizedName = groupName.trim()
    if (!normalizedName) {
      setErrorMessage('Group name is required.')
      return
    }
    if (selectedGroupMembers.length === 0) {
      setErrorMessage('Select at least one teammate for this group.')
      return
    }

    setCreatingConversation(true)
    setErrorMessage(null)
    try {
      const { error } = await supabase.rpc('team_chat_update_group', {
        p_conversation_id: activeConversation.id,
        p_name: normalizedName,
        p_member_user_ids: selectedGroupMembers,
      })
      if (error) throw error

      await refreshConversations()
      setComposerMode(null)
    } catch (error) {
      console.error('Unable to update Team Chat group:', error)
      setErrorMessage('Unable to update this group. Please try again.')
    } finally {
      setCreatingConversation(false)
    }
  }

  const handleDraftChange = (conversationId: string, value: string) => {
    setDrafts((current) => ({ ...current, [conversationId]: value }))

    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current)
    }

    if (value.trim()) {
      if (
        typingConversationRef.current !== conversationId ||
        !lastTypingSentRef.current
      ) {
        typingConversationRef.current = conversationId
        lastTypingSentRef.current = true
        void setTypingState(conversationId, true)
      }

      typingStopTimerRef.current = window.setTimeout(() => {
        lastTypingSentRef.current = false
        void setTypingState(conversationId, false)
      }, 1_300)
    } else {
      lastTypingSentRef.current = false
      void setTypingState(conversationId, false)
    }
  }

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeConversationId) return

    const body = (drafts[activeConversationId] ?? '').trim()
    if (!body || sendingConversationId) return

    setSendingConversationId(activeConversationId)
    setErrorMessage(null)
    try {
      const { data, error } = await supabase.rpc('team_chat_send_message', {
        p_conversation_id: activeConversationId,
        p_body: body,
      })
      if (error) throw error

      const row = Array.isArray(data) ? data[0] : data
      const parsed = parseMessage(row)
      if (parsed) {
        setMessagesByConversation((current) => {
          const existing = current[activeConversationId] ?? []
          if (existing.some((message) => message.id === parsed.id)) return current
          return {
            ...current,
            [activeConversationId]: [...existing, parsed],
          }
        })
      }

      setDrafts((current) => ({ ...current, [activeConversationId]: '' }))
      lastTypingSentRef.current = false
      void setTypingState(activeConversationId, false)
      await refreshConversations()
    } catch (error) {
      console.error('Unable to send Team Chat message:', error)
      setErrorMessage('Message could not be sent. Please try again.')
    } finally {
      setSendingConversationId(null)
    }
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  const closeConversationTab = (conversationId: string) => {
    setOpenConversationIds((current) => current.filter((id) => id !== conversationId))
    if (activeConversationId === conversationId) {
      const remaining = openConversationIds.filter((id) => id !== conversationId)
      setActiveConversationId(remaining.at(-1) ?? null)
    }
  }

  const toggleMemberSelection = (userId: string) => {
    setSelectedGroupMembers((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    )
  }

  const otherMembers = members.filter((member) => member.userId !== currentUserId)

  const openTabs = openConversationIds
    .map((conversationId) =>
      conversations.find((conversation) => conversation.id === conversationId),
    )
    .filter((conversation): conversation is TeamChatConversation => Boolean(conversation))

  return (
    <>
      <button
        type="button"
        onClick={() => {
          const opening = !panelOpen
          setPanelOpen(opening)
          if (opening) {
            void touchPresence()
            void refreshMembers()
            void refreshConversations()
            void refreshPresence()
          }
        }}
        className="fixed bottom-5 right-28 z-[80] flex min-w-[154px] items-center justify-between gap-3 rounded-xl border border-violet-400/45 bg-[#0B1221]/95 px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-[0_16px_45px_rgba(0,0,0,.42)] backdrop-blur-2xl transition hover:border-violet-300/80 hover:bg-[#111A2E]"
        aria-label={panelOpen ? 'Close Team Chat' : 'Open Team Chat'}
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/20 text-violet-200">
            <MessageCircle className="h-4 w-4" />
          </span>
          Team Chat
        </span>
        {totalUnread > 0 ? (
          <span className="flex min-w-6 items-center justify-center rounded-full bg-violet-500 px-1.5 py-0.5 text-xs font-bold text-white">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        ) : (
          <span
            className={`h-2.5 w-2.5 rounded-full ${isUserOnline(currentUserId) ? 'bg-emerald-400' : 'bg-slate-500'}`}
            aria-label={isUserOnline(currentUserId) ? 'Online' : 'Offline'}
          />
        )}
      </button>

      {panelOpen ? (
        <section
          className="fixed bottom-20 right-4 z-[79] flex h-[580px] max-h-[calc(100vh-6.5rem)] w-[calc(100vw-2rem)] max-w-[840px] flex-col overflow-hidden rounded-2xl border border-violet-300/15 bg-[#08111E] text-white shadow-[0_28px_90px_rgba(0,0,0,.58)] backdrop-blur-2xl lg:right-6 lg:w-[min(840px,calc(100vw-2rem))]"
          aria-label="Flowtix Team Chat"
        >
          <header className="flex h-[56px] shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#0B1423]/98 px-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/20 text-violet-200">
                <MessageCircle className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-white">Team Chat</h2>
                  <span
                    className={`h-2 w-2 rounded-full ${isUserOnline(currentUserId) ? 'bg-emerald-400' : 'bg-slate-500'}`}
                    aria-label={isUserOnline(currentUserId) ? 'Online' : 'Offline'}
                  />
                </div>
                <p className="text-[10px] font-medium text-slate-400">Internal organization messaging</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={beginNewConversation}
                className="!rounded-lg !border !border-white/[0.06] !bg-transparent p-1.5 !text-slate-400 transition hover:!bg-white/[0.06] hover:!text-white"
                aria-label="Start a new team chat"
              >
                <Edit3 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="!rounded-lg !border !border-transparent !bg-transparent p-1.5 !text-slate-400 !shadow-none transition hover:!bg-white/[0.06] hover:!text-white focus-visible:!outline-none focus-visible:!ring-0"
                aria-label="Minimize Team Chat"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="!rounded-lg !border !border-transparent !bg-transparent p-1.5 !text-slate-400 !shadow-none transition hover:!bg-white/[0.06] hover:!text-white focus-visible:!outline-none focus-visible:!ring-0"
                aria-label="Close Team Chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <aside
              className={`flex w-[280px] shrink-0 flex-col border-r border-white/[0.08] bg-[#0A1322] max-md:w-[42%] ${mobileThreadOpen ? 'max-sm:hidden' : 'max-sm:w-full'}`}
            >
              <div className="space-y-2 border-b border-white/[0.07] px-3 py-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search people or groups..."
                    className="w-full rounded-lg border border-white/[0.09] bg-[#08111D] py-2 pl-9 pr-3 text-[12px] font-medium text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-violet-400/50"
                  />
                </div>
                <div className="flex gap-1 border-b border-white/[0.05] pb-0.5 text-[11px] font-medium">
                  {(
                    [
                      ['all', 'All'],
                      ['direct', 'Direct'],
                      ['group', 'Groups'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setView(value)}
                      className={`flex-1 !rounded-md !border-0 px-2 py-2 transition focus-visible:!outline-none focus-visible:!ring-0 ${
                        view === value
                          ? '!border-0 !bg-violet-500/15 !text-violet-100 shadow-[inset_0_-2px_0_rgba(139,92,246,.9)]'
                          : '!border-0 !bg-transparent !text-slate-400 hover:!bg-white/[0.04] hover:!text-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {loadingBootstrap ? (
                  <div className="flex h-28 items-center justify-center text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <MessageCircle className="mx-auto h-7 w-7 text-slate-700" />
                    <p className="mt-3 text-[13px] font-semibold text-slate-200">No chats yet</p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-400">
                      Start a direct message or create an organization group.
                    </p>
                    <button
                      type="button"
                      onClick={beginNewConversation}
                      className="mt-4 !rounded-lg !border !border-violet-400/25 !bg-violet-500/10 px-3 py-2 text-[11px] font-semibold !text-violet-100 hover:!bg-violet-500/20"
                    >
                      New chat
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredConversations.map((conversation) => {
                      const display = getConversationDisplay(conversation)
                      const online =
                        conversation.kind === 'direct' && display.otherUserId
                          ? isUserOnline(display.otherUserId)
                          : conversation.memberUserIds.some(
                              (userId) => userId !== currentUserId && isUserOnline(userId),
                            )

                      return (
                        <button
                          key={conversation.id}
                          type="button"
                          onClick={() => openConversation(conversation.id)}
                          className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${
                            activeConversationId === conversation.id
                              ? '!border-0 !bg-[#1A2437] ring-1 ring-violet-400/20'
                              : '!border-0 !bg-transparent hover:!bg-white/[0.045]'
                          }`}
                        >
                          <ChatAvatar
                            label={display.label}
                            avatarUrl={display.avatarUrl}
                            online={online}
                            group={conversation.kind === 'group'}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-[12px] font-semibold text-slate-100">
                                {display.label}
                              </span>
                              <span className="shrink-0 text-[10px] font-medium text-slate-500">
                                {formatRelativeTime(
                                  conversation.lastMessageAt ?? conversation.createdAt,
                                )}
                              </span>
                            </span>
                            <span className="mt-1 flex items-center justify-between gap-2">
                              <span className="truncate text-[11px] text-slate-400">
                                {conversation.lastMessageBody ||
                                  (conversation.kind === 'group'
                                    ? `${conversation.memberCount} members`
                                    : online
                                      ? 'Online'
                                      : 'Offline')}
                              </span>
                              {conversation.unreadCount > 0 ? (
                                <span className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-violet-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-white/[0.07] p-2">
                <button
                  type="button"
                  onClick={beginNewConversation}
                  className="flex w-full items-center justify-center gap-2 !rounded-lg !border !border-white/[0.08] !bg-transparent px-3 py-2.5 text-[11px] font-semibold !text-slate-300 transition hover:!bg-white/[0.05] hover:!text-white"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  New conversation
                </button>
              </div>
            </aside>

            <div
              className={`relative min-w-0 flex-1 flex-col bg-[#08111E] ${mobileThreadOpen ? 'flex' : 'flex max-sm:hidden'}`}
            >
              {composerMode ? (
                <div className="absolute inset-0 z-20 flex flex-col bg-[#08111E]/[0.995]">
                  <div className="flex h-[54px] items-center gap-3 border-b border-white/[0.08] px-3.5">
                    <button
                      type="button"
                      onClick={() => setComposerMode(null)}
                      className="!rounded-lg !border !border-white/[0.06] !bg-transparent p-1.5 !text-slate-400 hover:!bg-white/[0.05] hover:!text-white"
                      aria-label="Back to chat"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div>
                      <h3 className="text-[14px] font-semibold text-white">
                        {composerMode === 'manage-group' ? 'Group settings' : 'New conversation'}
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Only members of this organization are available.
                      </p>
                    </div>
                  </div>

                  {composerMode !== 'manage-group' ? (
                    <div className="mx-4 mt-3 flex gap-1 rounded-lg border border-white/[0.06] bg-[#0A1422] p-1 text-[12px] font-medium">
                      <button
                        type="button"
                        onClick={() => {
                          setNewChatTab('direct')
                          setComposerMode('direct')
                        }}
                        className={`flex-1 rounded-md px-3 py-2.5 ${
                          newChatTab === 'direct'
                            ? '!border-0 !bg-violet-500/20 !text-violet-100'
                            : '!border-0 !bg-transparent !text-slate-400'
                        }`}
                      >
                        Direct message
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewChatTab('group')
                          setComposerMode('group')
                        }}
                        className={`flex-1 !rounded-md !border-0 px-3 py-2.5 transition focus-visible:!outline-none focus-visible:!ring-0 ${
                          newChatTab === 'group'
                            ? '!bg-violet-500/20 !text-violet-100'
                            : '!bg-transparent !text-slate-400 hover:!bg-white/[0.04] hover:!text-slate-100'
                        }`}
                      >
                        Group chat
                      </button>
                    </div>
                  ) : null}

                  <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {composerMode === 'direct' ? (
                      <div className="space-y-1">
                        {otherMembers.length === 0 ? (
                          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5 text-center text-xs text-slate-500">
                            Invite another organization member to start a direct chat.
                          </div>
                        ) : (
                          otherMembers.map((member) => (
                            <button
                              key={member.userId}
                              type="button"
                              disabled={creatingConversation}
                              onClick={() => void createDirectConversation(member.userId)}
                              className="flex w-full items-center gap-3 !rounded-xl !border !border-transparent !bg-transparent px-3 py-3 text-left !shadow-none transition hover:!border-transparent hover:!bg-white/[0.04] focus-visible:!outline-none focus-visible:!ring-0 disabled:opacity-50"
                            >
                              <ChatAvatar
                                label={displayMemberName(member)}
                                avatarUrl={member.avatarUrl}
                                online={isUserOnline(member.userId)}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-semibold text-slate-100">
                                  {displayMemberName(member)}
                                </span>
                                <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                                  {isUserOnline(member.userId) ? 'Online' : 'Offline'}
                                  {member.email ? ` · ${member.email}` : ''}
                                </span>
                              </span>
                              <MessageCircle className="h-4 w-4 text-slate-500" />
                            </button>
                          ))
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <label className="block">
                          <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                            Group name
                          </span>
                          <input
                            value={groupName}
                            onChange={(event) => setGroupName(event.target.value)}
                            maxLength={80}
                            placeholder="e.g. Sales Team"
                            className="w-full rounded-lg border border-white/[0.10] bg-[#0A1422] px-3 py-2.5 text-[13px] font-medium text-white outline-none placeholder:text-slate-500 focus:border-violet-400/55"
                          />
                        </label>

                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                              Members
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {selectedGroupMembers.length + 1} selected
                            </span>
                          </div>
                          <div className="space-y-1 rounded-xl border border-white/[0.07] bg-[#0A1422]/80 p-2">
                            <div className="flex items-center gap-3 rounded-lg bg-violet-500/[0.10] px-3 py-2.5 ring-1 ring-violet-400/15">
                              <ChatAvatar
                                label={currentDisplayName}
                                avatarUrl={currentDisplayAvatarUrl}
                                online
                                size="sm"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[12px] font-semibold text-slate-100">
                                  {currentDisplayName}
                                </p>
                                <p className="truncate text-[10px] text-slate-500">You · {currentDisplayEmail}</p>
                              </div>
                              <Check className="h-4 w-4 text-violet-300" />
                            </div>
                            {otherMembers.map((member) => {
                              const requiredCreator =
                                composerMode === 'manage-group' &&
                                activeConversation?.createdBy === member.userId
                              const selected =
                                requiredCreator || selectedGroupMembers.includes(member.userId)
                              return (
                                <button
                                  key={member.userId}
                                  type="button"
                                  disabled={requiredCreator}
                                  onClick={() => toggleMemberSelection(member.userId)}
                                  className="flex w-full items-center gap-3 !rounded-lg !border !border-transparent !bg-transparent px-3 py-2.5 text-left !shadow-none hover:!border-transparent hover:!bg-white/[0.045] focus-visible:!outline-none focus-visible:!ring-0 disabled:cursor-default disabled:opacity-80"
                                >
                                  <ChatAvatar
                                    label={displayMemberName(member)}
                                    avatarUrl={member.avatarUrl}
                                    online={isUserOnline(member.userId)}
                                    size="sm"
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[12px] font-semibold text-slate-100">
                                      {displayMemberName(member)}
                                    </span>
                                    <span className="block truncate text-[10px] text-slate-500">
                                      {requiredCreator
                                        ? `Group creator · ${member.email ?? member.role}`
                                        : member.email ?? member.role}
                                    </span>
                                  </span>
                                  <span
                                    className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                                      selected
                                        ? 'border-violet-400 bg-violet-500 text-white'
                                        : 'border-white/15 text-transparent'
                                    }`}
                                  >
                                    <Check className="h-3 w-3" />
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {composerMode !== 'direct' ? (
                    <div className="border-t border-white/[0.08] p-4">
                      <button
                        type="button"
                        disabled={creatingConversation}
                        onClick={() =>
                          void (composerMode === 'manage-group'
                            ? updateGroupConversation()
                            : createGroupConversation())
                        }
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {creatingConversation ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : composerMode === 'manage-group' ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        {composerMode === 'manage-group' ? 'Save group' : 'Create group'}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeConversation && activeDisplay ? (
                <>
                  <div className="flex h-[56px] shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#0A1322] px-3.5">
                    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                      <button
                        type="button"
                        onClick={() => setActiveConversationId(null)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.05] hover:text-white sm:hidden"
                        aria-label="Back to conversation list"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <ChatAvatar
                        label={activeDisplay.label}
                        avatarUrl={activeDisplay.avatarUrl}
                        group={activeConversation.kind === 'group'}
                        online={activeOnline}
                      />
                      <div className="min-w-0">
                        <h3 className="truncate text-[13px] font-semibold text-white">
                          {activeDisplay.label}
                        </h3>
                        <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                          {activeConversation.kind === 'group'
                            ? `${activeConversation.memberCount} members · ${activeOnlineCount} online`
                            : activeOnline
                              ? 'Online now'
                              : 'Offline'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {activeConversation.kind === 'group' && canManageActiveGroup ? (
                        <button
                          type="button"
                          onClick={beginManageGroup}
                          className="!rounded-lg !border-0 !bg-transparent p-1.5 !text-slate-400 transition hover:!bg-white/[0.06] hover:!text-white"
                          aria-label="Manage group"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => closeConversationTab(activeConversation.id)}
                        className="rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.05] hover:text-white"
                        aria-label="Close this chat"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    {loadingConversationId === activeConversation.id && currentMessages.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-slate-500">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : currentMessages.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                        <ChatAvatar
                          label={activeDisplay.label}
                          avatarUrl={activeDisplay.avatarUrl}
                          group={activeConversation.kind === 'group'}
                          online={activeOnline}
                          size="lg"
                        />
                        <p className="mt-3 text-sm font-semibold text-slate-200">
                          {activeDisplay.label}
                        </p>
                        <p className="mt-1 max-w-sm text-[11px] leading-5 text-slate-400">
                          This is the beginning of this internal Flowtix conversation.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {currentMessages.map((message) => {
                          const isOwn = message.senderUserId === currentUserId
                          const sender = memberByUserId.get(message.senderUserId)
                          const senderName = isOwn
                            ? currentUserName.trim() || 'You'
                            : displayMemberName(sender)
                          const senderLabel = isOwn ? `${senderName} · You` : senderName
                          const readLabel =
                            message.readByCount > 0
                              ? activeConversation.kind === 'direct'
                                ? 'Seen'
                                : `Seen by ${message.readByCount}`
                              : 'Sent'

                          return (
                            <div
                              key={message.id}
                              className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}
                            >
                              {!isOwn ? (
                                <ChatAvatar
                                  label={senderName}
                                  avatarUrl={sender?.avatarUrl}
                                  online={isUserOnline(message.senderUserId)}
                                  size="sm"
                                />
                              ) : null}
                              <div className={`max-w-[78%] ${isOwn ? 'text-right' : 'text-left'}`}>
                                <p
                                  className={`mb-1 px-1 text-[10px] font-semibold ${
                                    isOwn
                                      ? 'text-right text-violet-200/90'
                                      : 'text-left text-slate-300'
                                  }`}
                                >
                                  {senderLabel}
                                </p>
                                <div
                                  className={`inline-block rounded-2xl px-3.5 py-2.5 text-left text-[13px] leading-[1.45] shadow-sm ${
                                    isOwn
                                      ? 'rounded-br-md bg-gradient-to-br from-violet-600 to-indigo-600 text-white'
                                      : 'rounded-bl-md border border-white/[0.08] bg-[#1A2434] text-slate-50'
                                  }`}
                                >
                                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                                  <div
                                    className={`mt-1.5 flex items-center gap-1 text-[9px] ${
                                      isOwn ? 'justify-end text-violet-100/80' : 'text-slate-400'
                                    }`}
                                  >
                                    <span>{formatMessageTime(message.createdAt)}</span>
                                    {isOwn ? (
                                      <>
                                        {message.readByCount > 0 ? (
                                          <CheckCheck className="h-3 w-3" />
                                        ) : (
                                          <Check className="h-3 w-3" />
                                        )}
                                        <span>{readLabel}</span>
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </div>

                  <div className="min-h-[28px] px-4 text-[10px] font-medium text-slate-400">
                    {activeTypingMembers.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="flex gap-0.5">
                          <Circle className="h-1.5 w-1.5 fill-current" />
                          <Circle className="h-1.5 w-1.5 fill-current opacity-70" />
                          <Circle className="h-1.5 w-1.5 fill-current opacity-40" />
                        </span>
                        <span>
                          {activeTypingMembers.length === 1
                            ? `${displayMemberName(activeTypingMembers[0])} is typing...`
                            : `${activeTypingMembers.length} people are typing...`}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <form onSubmit={sendMessage} className="border-t border-white/[0.08] bg-[#0A1322] px-3 py-2.5">
                    <div className="flex items-end gap-2 rounded-xl border border-white/[0.10] bg-[#111B2A] p-1.5 shadow-inner focus-within:border-violet-400/45">
                      <textarea
                        value={drafts[activeConversation.id] ?? ''}
                        onChange={(event) =>
                          handleDraftChange(activeConversation.id, event.target.value)
                        }
                        onKeyDown={handleComposerKeyDown}
                        rows={1}
                        maxLength={4000}
                        placeholder="Type a message..."
                        className="max-h-28 min-h-[38px] flex-1 resize-none bg-transparent px-2.5 py-2 text-[13px] leading-5 text-slate-50 outline-none placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleDraftChange(
                            activeConversation.id,
                            `${drafts[activeConversation.id] ?? ''}🙂`,
                          )
                        }
                        className="mb-1 !rounded-lg !border-0 !bg-transparent p-2 !text-slate-400 transition hover:!bg-white/[0.05] hover:!text-slate-200"
                        aria-label="Add emoji"
                      >
                        <Smile className="h-4 w-4" />
                      </button>
                      <button
                        type="submit"
                        disabled={
                          sendingConversationId === activeConversation.id ||
                          !(drafts[activeConversation.id] ?? '').trim()
                        }
                        className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white shadow-[0_6px_20px_rgba(124,58,237,.32)] transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Send message"
                      >
                        {sendingConversationId === activeConversation.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <p className="mt-1.5 px-2 text-[9px] text-slate-500">
                      Enter to send · Shift+Enter for a new line
                    </p>
                  </form>
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-400/15 bg-violet-500/[0.07] text-violet-300">
                    <MessageCircle className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-[14px] font-semibold text-slate-100">Your team, one click away</h3>
                  <p className="mt-2 max-w-sm text-[11px] leading-5 text-slate-400">
                    Open a direct chat or group. Team Chat stays available while you move between Flowtix modules.
                  </p>
                  <button
                    type="button"
                    onClick={beginNewConversation}
                    className="mt-4 inline-flex items-center gap-2 !rounded-xl !border-0 !bg-violet-600 px-4 py-2.5 text-[12px] font-semibold !text-white shadow-[0_8px_24px_rgba(124,58,237,.28)] hover:!bg-violet-500"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Start a chat
                  </button>
                </div>
              )}
            </div>
          </div>

          {errorMessage ? (
            <div className="absolute bottom-[52px] left-3 right-3 z-30 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <span>{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="text-rose-200/60 hover:text-rose-100"
                  aria-label="Dismiss error"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}

          <footer className="flex h-[48px] shrink-0 items-center gap-2 border-t border-white/[0.08] bg-[#0A1322] px-2.5">
            <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
              {openTabs.length === 0 ? (
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <UserRound className="h-3.5 w-3.5" />
                  Chats you open will stay here while you work.
                </div>
              ) : (
                openTabs.map((conversation) => {
                  const display = getConversationDisplay(conversation)
                  const isActive = conversation.id === activeConversationId
                  return (
                    <div
                      key={conversation.id}
                      className={`group flex min-w-[150px] max-w-[190px] items-center rounded-xl border transition ${
                        isActive
                          ? 'border-violet-400/30 bg-violet-500/[0.14]'
                          : 'border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openConversation(conversation.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                      >
                        <ChatAvatar
                          label={display.label}
                          avatarUrl={display.avatarUrl}
                          group={conversation.kind === 'group'}
                          online={
                            conversation.kind === 'direct' && display.otherUserId
                              ? isUserOnline(display.otherUserId)
                              : undefined
                          }
                          size="sm"
                        />
                        <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-slate-300">
                          {display.label}
                        </span>
                        {conversation.unreadCount > 0 ? (
                          <span className="rounded-full bg-violet-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            {conversation.unreadCount}
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => closeConversationTab(conversation.id)}
                        className="mr-1 rounded p-1 text-slate-500 opacity-0 transition hover:text-slate-300 group-hover:opacity-100 focus:opacity-100"
                        aria-label={`Close ${display.label} chat tab`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
            <button
              type="button"
              onClick={beginNewConversation}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-slate-400 transition hover:bg-violet-500/10 hover:text-violet-200"
              aria-label="Open another chat"
            >
              <Plus className="h-4 w-4" />
            </button>
          </footer>
        </section>
      ) : null}
    </>
  )
}
