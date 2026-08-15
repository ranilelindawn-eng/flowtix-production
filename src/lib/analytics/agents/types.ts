import type { ReportRange } from '@/lib/reports'

export type AgentAnalyticsPeriod = ReportRange

export type AgentPerformanceMetric = {
  membershipId: string
  userId: string
  name: string
  role: string
  availability: 'available' | 'away' | 'offline' | 'dnd'
  activityState: 'idle' | 'ringing' | 'busy' | 'wrap_up'
  onDuty: boolean
  totalCalls: number
  connectedCalls: number
  failedCalls: number
  connectRate: number
  talkSeconds: number
  averageCallSeconds: number
  assignedTasks: number
  completedTasks: number
  overdueTasks: number
  taskCompletionRate: number
  completedActivities: number
  attendanceSeconds: number
  utilizationRate: number
  coachingCount: number
  coachingScore: number | null
  productivityScore: number
}

export type AgentTrendPoint = {
  date: string
  label: string
  calls: number
  connectedCalls: number
  talkSeconds: number
  completedTasks: number
  completedActivities: number
}

export type AgentAnalyticsSnapshot = {
  id: string
  period: AgentAnalyticsPeriod
  periodStart: string
  periodEnd: string
  capturedAt: string
  totalAgents: number
  availableAgents: number
  busyAgents: number
  awayAgents: number
  offlineAgents: number
  totalCalls: number
  connectedCalls: number
  connectRate: number
  totalTalkSeconds: number
  completedTasks: number
  overdueTasks: number
  completedActivities: number
  attendanceSeconds: number
  averageCoachingScore: number | null
  averageProductivityScore: number
  agents: AgentPerformanceMetric[]
  trend: AgentTrendPoint[]
  metadata: Record<string, unknown>
}

export type AgentAnalyticsOverview = {
  snapshot: AgentAnalyticsSnapshot
  history: Array<Pick<AgentAnalyticsSnapshot, 'id' | 'period' | 'periodStart' | 'periodEnd' | 'capturedAt'>>
}
