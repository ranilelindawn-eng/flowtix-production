export type AIConversationMemoryType = 'fact' | 'preference' | 'goal' | 'constraint' | 'context'

export type AIConversationMemory = {
  id: string
  conversationId: string
  memoryKey: string
  memoryType: AIConversationMemoryType
  value: string
  importance: number
  sourceMessageId: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export type AIConversationContext = {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  memoryContext: string
  includedMessageCount: number
  includedMemoryCount: number
  estimatedTokens: number
  lastSequence: number
}
