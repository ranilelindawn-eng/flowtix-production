import type { ReportRange } from '@/lib/reports'

export type CallAnalyticsPeriod = ReportRange

export type CallProviderMetric = {
  provider: string
  totalCalls: number
  connectedCalls: number
  failedCalls: number
  connectRate: number
  averageDurationSeconds: number
}

export type CallDirectionMetric = {
  direction: 'inbound' | 'outbound' | 'unknown'
  totalCalls: number
  connectedCalls: number
  failedCalls: number
  connectRate: number
  totalTalkSeconds: number
}

export type CallAgentMetric = {
  membershipId: string | null
  userId: string | null
  name: string
  totalCalls: number
  connectedCalls: number
  failedCalls: number
  connectRate: number
  totalTalkSeconds: number
  averageDurationSeconds: number
}

export type CallQueueMetric = {
  queueId: string
  queueName: string
  entered: number
  answered: number
  abandoned: number
  overflowed: number
  answerRate: number
  averageWaitSeconds: number
  longestWaitSeconds: number
}

export type CallRoutingMetric = {
  strategy: string
  attempts: number
  answered: number
  failed: number
  noAgents: number
  answerRate: number
  averageAnswerSeconds: number
}

export type CallTrendPoint = {
  date: string
  label: string
  totalCalls: number
  inboundCalls: number
  outboundCalls: number
  connectedCalls: number
  failedCalls: number
  talkSeconds: number
}

export type CallAnalyticsSnapshot = {
  id: string
  period: CallAnalyticsPeriod
  periodStart: string
  periodEnd: string
  capturedAt: string
  totalCalls: number
  inboundCalls: number
  outboundCalls: number
  connectedCalls: number
  failedCalls: number
  missedCalls: number
  connectRate: number
  totalTalkSeconds: number
  averageDurationSeconds: number
  averageAnswerSeconds: number
  recordedCalls: number
  recordingRate: number
  queueEntries: number
  queueAnswered: number
  queueAbandoned: number
  queueAbandonRate: number
  routingAttempts: number
  routingFailures: number
  providers: CallProviderMetric[]
  directions: CallDirectionMetric[]
  agents: CallAgentMetric[]
  queues: CallQueueMetric[]
  routing: CallRoutingMetric[]
  trend: CallTrendPoint[]
}

export type CallAnalyticsOverview = {
  snapshot: CallAnalyticsSnapshot
  history: Array<Pick<CallAnalyticsSnapshot, 'id' | 'period' | 'periodStart' | 'periodEnd' | 'capturedAt'>>
}
