import type { ConfiguredTelephonyProviderName, TelephonyCallStatus } from '@/lib/telephony/provider'

export type NormalizedCallEventType = 'call.status' | 'recording.status'

export type NormalizedCallEvent = {
  provider: ConfiguredTelephonyProviderName
  eventId: string
  eventType: NormalizedCallEventType
  occurredAt: string
  providerCallId: string
  providerParentCallId: string | null
  providerRecordingId: string | null
  status: TelephonyCallStatus | null
  rawStatus: string
  direction: 'inbound' | 'outbound' | null
  fromNumber: string | null
  toNumber: string | null
  durationSeconds: number | null
  recordingUrl: string | null
  recordingChannels: number | null
  metadata: Record<string, unknown>
  rawPayload: Record<string, unknown>
}

export type NormalizeProviderWebhookInput = {
  provider: ConfiguredTelephonyProviderName
  rawBody: string
  contentType: string
  receivedAt?: string
}
