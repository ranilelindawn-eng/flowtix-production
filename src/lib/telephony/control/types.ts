export type CallControlAction =
  | 'hold'
  | 'resume'
  | 'hangup'
  | 'start-recording'
  | 'stop-recording'
  | 'conference'
  | 'blind-transfer'
  | 'warm-transfer'

export type SupervisorMode = 'monitor' | 'whisper' | 'barge'

export type CallControlSession = {
  id: string
  organizationId: string
  callId: string
  provider: string
  conferenceName: string | null
  conferenceSid: string | null
  customerParticipantSid: string | null
  agentParticipantSid: string | null
  consultParticipantSid: string | null
  state: string
}
