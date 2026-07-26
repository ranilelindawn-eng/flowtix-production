export type TelephonyProviderName =
  | 'unconfigured'
  | 'twilio'
  | 'telnyx'
  | 'custom'

export type TelephonyProviderStatus =
  | 'unconfigured'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'error'

export type TelephonyCallDirection =
  | 'outbound'
  | 'inbound'

export type TelephonyCallStatus =
  | 'idle'
  | 'validating'
  | 'queued'
  | 'initiating'
  | 'ringing'
  | 'connected'
  | 'on-hold'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type TelephonyCallControl =
  | 'mute'
  | 'unmute'
  | 'hold'
  | 'resume'
  | 'hangup'
  | 'send-dtmf'

export type TelephonyProviderCapability =
  | 'outbound-calling'
  | 'inbound-calling'
  | 'call-recording'
  | 'dtmf'
  | 'mute'
  | 'hold'
  | 'conference'
  | 'webhooks'
  | 'number-management'

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

export type StartCallResult = {
  success: boolean
  callId: string | null
  providerCallId: string | null
  status: TelephonyCallStatus
  message: string
  startedAt: string | null
}

export type UpdateCallRequest = {
  callId: string
  control: TelephonyCallControl
  digits?: string
}

export type UpdateCallResult = {
  success: boolean
  status: TelephonyCallStatus
  message: string
}

export type EndCallRequest = {
  callId: string
  disposition?: string | null
  notes?: string | null
}

export type EndCallResult = {
  success: boolean
  status: Extract<
    TelephonyCallStatus,
    'completed' | 'failed' | 'cancelled'
  >
  message: string
  endedAt: string
}

export type TelephonyProviderHealth = {
  provider: TelephonyProviderName
  status: TelephonyProviderStatus
  message: string
  checkedAt: string
}

export interface TelephonyProvider {
  readonly name: TelephonyProviderName
  readonly displayName: string

  getConfiguration(): Promise<TelephonyProviderConfiguration>

  getHealth(): Promise<TelephonyProviderHealth>

  startCall(
    request: StartCallRequest,
  ): Promise<StartCallResult>

  updateCall(
    request: UpdateCallRequest,
  ): Promise<UpdateCallResult>

  endCall(
    request: EndCallRequest,
  ): Promise<EndCallResult>
}

export const DEFAULT_PROVIDER_CONFIGURATION: TelephonyProviderConfiguration =
  {
    provider: 'unconfigured',
    displayName: 'No calling provider',
    status: 'unconfigured',
    capabilities: [],
    configuredAt: null,
    lastCheckedAt: null,
  }

export const PROVIDER_NOT_CONFIGURED_MESSAGE =
  'A calling provider has not been configured for this workspace. Connect Telnyx, Twilio, or another supported provider before placing live calls.'

export class ProviderNotConfiguredError extends Error {
  constructor(message = PROVIDER_NOT_CONFIGURED_MESSAGE) {
    super(message)
    this.name = 'ProviderNotConfiguredError'
  }
}

class UnconfiguredTelephonyProvider
  implements TelephonyProvider
{
  readonly name = 'unconfigured' as const
  readonly displayName = 'No calling provider'

  async getConfiguration(): Promise<TelephonyProviderConfiguration> {
    return DEFAULT_PROVIDER_CONFIGURATION
  }

  async getHealth(): Promise<TelephonyProviderHealth> {
    return {
      provider: this.name,
      status: 'unconfigured',
      message: PROVIDER_NOT_CONFIGURED_MESSAGE,
      checkedAt: new Date().toISOString(),
    }
  }

  async startCall(
    request: StartCallRequest,
  ): Promise<StartCallResult> {
    void request

    return {
      success: false,
      callId: null,
      providerCallId: null,
      status: 'failed',
      message: PROVIDER_NOT_CONFIGURED_MESSAGE,
      startedAt: null,
    }
  }

  async updateCall(
    request: UpdateCallRequest,
  ): Promise<UpdateCallResult> {
    void request

    return {
      success: false,
      status: 'failed',
      message: PROVIDER_NOT_CONFIGURED_MESSAGE,
    }
  }

  async endCall(
    request: EndCallRequest,
  ): Promise<EndCallResult> {
    void request

    return {
      success: false,
      status: 'cancelled',
      message: PROVIDER_NOT_CONFIGURED_MESSAGE,
      endedAt: new Date().toISOString(),
    }
  }
}

const unconfiguredProvider =
  new UnconfiguredTelephonyProvider()

export function getTelephonyProvider(): TelephonyProvider {
  return unconfiguredProvider
}

export function isProviderConfigured(
  configuration: TelephonyProviderConfiguration,
): boolean {
  return (
    configuration.provider !== 'unconfigured' &&
    configuration.status === 'connected'
  )
}

export function normalizePhoneNumber(
  value: string,
): string {
  return value
    .trim()
    .replace(/[^\d+]/g, '')
    .replace(/(?!^)\+/g, '')
}

export function isValidPhoneNumber(
  value: string,
): boolean {
  const normalizedValue = normalizePhoneNumber(value)

  return /^\+?[1-9]\d{6,14}$/.test(normalizedValue)
}

export function formatPhoneNumberForDisplay(
  value: string,
): string {
  const normalizedValue = normalizePhoneNumber(value)

  if (!normalizedValue) {
    return ''
  }

  if (normalizedValue.startsWith('+')) {
    return normalizedValue
  }

  return `+${normalizedValue}`
}