export type TelephonyAlertSeverity = 'info' | 'warning' | 'critical'

export type TelephonyAlertStatus = 'open' | 'acknowledged' | 'resolved'

export type TelephonyQueueDiagnostic = Record<string, unknown>

export type TelephonyMonitoringSnapshot = {
  id: string
  capturedAt: string
  activeCalls: number
  ringingCalls: number
  connectedCalls: number
  queuedCalls: number
  waitingQueueEntries: number
  oldestQueueWaitSeconds: number
  availableAgents: number
  busyAgents: number
  offlineAgents: number
  routingFailuresLastHour: number
  providerErrorsLastHour: number
  callsLastHour: number
  answeredCallsLastHour: number
  failedCallsLastHour: number
  averageAnswerSeconds: number | null
  answerRate: number
  providerBreakdown: Record<string, number>
  routingBreakdown: Record<string, number>
  queueBreakdown: TelephonyQueueDiagnostic[]
}

export type TelephonyAlert = {
  id: string
  ruleKey: string
  severity: TelephonyAlertSeverity
  status: TelephonyAlertStatus
  title: string
  message: string
  metric: string
  metricValue: number | null
  threshold: number | null
  openedAt: string
  lastObservedAt: string
  occurrenceCount: number
}
