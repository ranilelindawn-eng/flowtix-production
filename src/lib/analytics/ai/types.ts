import type { ReportRange } from '@/lib/reports'

export type AIAnalyticsPeriod = ReportRange
export type AIDimensionMetric = { key: string; label: string; requests: number; completed: number; failed: number; inputTokens: number; outputTokens: number; costMicros: number; averageLatencyMs: number; successRate: number }
export type AITrendPoint = { date: string; label: string; requests: number; completed: number; failed: number; tokens: number; costMicros: number; averageLatencyMs: number }
export type AIAnalyticsSnapshot = {
  id: string; period: AIAnalyticsPeriod; periodStart: string; periodEnd: string; capturedAt: string
  totalRequests: number; completedRequests: number; failedRequests: number; cancelledRequests: number
  inputTokens: number; outputTokens: number; totalTokens: number; costMicros: number; averageLatencyMs: number; successRate: number
  conversations: number; assistantMessages: number; summaries: number; sentimentAnalyses: number; coachingAnalyses: number; transcriptRuns: number
  featureAdoption: AIDimensionMetric[]; promptMetrics: AIDimensionMetric[]; modelMetrics: AIDimensionMetric[]; providerMetrics: AIDimensionMetric[]; trend: AITrendPoint[]
  metadata: Record<string, unknown>
}
export type AIAnalyticsOverview = { snapshot: AIAnalyticsSnapshot; history: Array<Pick<AIAnalyticsSnapshot, 'id' | 'period' | 'periodStart' | 'periodEnd' | 'capturedAt'>> }
