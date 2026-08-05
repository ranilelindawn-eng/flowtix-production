export type AgentAvailability = 'available' | 'away' | 'offline' | 'dnd'
export type AgentActivityState = 'idle' | 'ringing' | 'busy' | 'wrap_up'
export type AgentDeviceStatus = 'online' | 'offline' | 'error'

export type AgentPresenceSnapshot = {
  organizationId: string
  userId: string
  availability: AgentAvailability
  activityState: AgentActivityState
  activeCallId: string | null
  wrapUpUntil: string | null
  lastSeenAt: string | null
  onlineDeviceCount: number
  routable: boolean
}
