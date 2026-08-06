export type TelephonyAcceptanceStatus = 'pass' | 'warning' | 'fail'

export type TelephonyAcceptanceCheck = {
  key: string
  label: string
  status: TelephonyAcceptanceStatus
  detail: string
}

export type TelephonyAcceptanceReport = {
  generatedAt: string
  organizationId: string
  status: TelephonyAcceptanceStatus
  score: number
  checks: TelephonyAcceptanceCheck[]
}
