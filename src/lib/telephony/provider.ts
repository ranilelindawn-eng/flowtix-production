export type TelephonyProviderName =
  | 'unconfigured'
  | 'twilio'
  | 'telnyx'
  | 'signalwire'
  | 'plivo'

export type ConfiguredTelephonyProviderName = 'twilio' | 'telnyx' | 'signalwire' | 'plivo'

/** Providers retained in persisted historical data. New/live Flowtix telephony is SignalWire-only. */
export const TELEPHONY_PROVIDERS = ['signalwire'] as const

export type TelephonyProviderStatus =
  | 'unconfigured'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'error'

export type TelephonyCallDirection = 'outbound' | 'inbound'
export type TelephonyCallStatus =
  | 'idle' | 'validating' | 'queued' | 'initiating' | 'ringing'
  | 'connected' | 'on-hold' | 'completed' | 'failed' | 'cancelled'
export type TelephonyCallControl =
  | 'mute' | 'unmute' | 'hold' | 'resume' | 'hangup' | 'send-dtmf'
  | 'blind-transfer' | 'warm-transfer' | 'conference' | 'monitor' | 'whisper' | 'barge'
export type TelephonyProviderCapability =
  | 'outbound-calling' | 'inbound-calling' | 'call-recording' | 'dtmf'
  | 'mute' | 'hold' | 'conference' | 'blind-transfer' | 'warm-transfer'
  | 'supervisor-monitoring' | 'whisper' | 'barge' | 'webhooks' | 'number-management'

export type TelephonyProviderConfiguration = {
  provider: TelephonyProviderName
  displayName: string
  status: TelephonyProviderStatus
  capabilities: TelephonyProviderCapability[]
  configuredAt: string | null
  lastCheckedAt: string | null
}

export type TelephonyContact = {
  id: string
  firstName: string
  lastName: string
  phoneNumber: string
  email?: string | null
  company?: string | null
}

export type StartCallRequest = {
  organizationId: string
  userId: string
  phoneNumber: string
  direction: TelephonyCallDirection
  contactId?: string | null
  campaignId?: string | null
  campaignMemberId?: string | null
  callerId?: string | null
  notes?: string | null
  recordCall?: boolean
}
export type StartCallResult = { success: boolean; callId: string | null; providerCallId: string | null; status: TelephonyCallStatus; message: string; startedAt: string | null }
export type UpdateCallRequest = { callId: string; control: TelephonyCallControl; digits?: string }
export type UpdateCallResult = { success: boolean; status: TelephonyCallStatus; message: string }
export type EndCallRequest = { callId: string; disposition?: string | null; notes?: string | null }
export type EndCallResult = { success: boolean; status: Extract<TelephonyCallStatus, 'completed' | 'failed' | 'cancelled'>; message: string; endedAt: string }
export type TelephonyProviderHealth = { provider: TelephonyProviderName; status: TelephonyProviderStatus; message: string; checkedAt: string }

export interface TelephonyProvider {
  readonly name: TelephonyProviderName
  readonly displayName: string
  getConfiguration(): Promise<TelephonyProviderConfiguration>
  getHealth(): Promise<TelephonyProviderHealth>
  startCall(request: StartCallRequest): Promise<StartCallResult>
  updateCall(request: UpdateCallRequest): Promise<UpdateCallResult>
  endCall(request: EndCallRequest): Promise<EndCallResult>
}

export const PROVIDER_DISPLAY_NAMES: Record<ConfiguredTelephonyProviderName, string> = {
  twilio: 'Twilio (retired)',
  telnyx: 'Telnyx (retired)',
  signalwire: 'SignalWire',
  plivo: 'Plivo (retired)',
}

export function isTelephonyProvider(value: string): value is ConfiguredTelephonyProviderName {
  return value === 'signalwire'
}

export const DEFAULT_PROVIDER_CONFIGURATION: TelephonyProviderConfiguration = {
  provider: 'unconfigured',
  displayName: 'No calling provider',
  status: 'unconfigured',
  capabilities: [],
  configuredAt: null,
  lastCheckedAt: null,
}

export const PROVIDER_NOT_CONFIGURED_MESSAGE =
  'SignalWire calling is not configured for this workspace.'

export class ProviderNotConfiguredError extends Error {
  constructor(message = PROVIDER_NOT_CONFIGURED_MESSAGE) {
    super(message)
    this.name = 'ProviderNotConfiguredError'
  }
}
