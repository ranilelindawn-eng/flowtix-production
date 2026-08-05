import type { ReportRange } from '@/lib/reports'

export type SalesAnalyticsPeriod = ReportRange

export type SalesStageMetric = {
  stageId: string | null
  stageName: string
  stageType: 'open' | 'won' | 'lost'
  position: number
  dealCount: number
  totalValue: number
  weightedValue: number
  averageAgeDays: number
  averageDaysInStage: number
}

export type SalesOwnerMetric = {
  membershipId: string | null
  userId: string | null
  name: string
  openDeals: number
  wonDeals: number
  lostDeals: number
  pipelineValue: number
  weightedValue: number
  wonRevenue: number
  conversionRate: number
  averageDealSize: number
}

export type SalesSourceMetric = {
  source: string
  dealCount: number
  pipelineValue: number
  wonRevenue: number
}

export type SalesForecastMetric = {
  category: string
  dealCount: number
  totalValue: number
  weightedValue: number
}

export type SalesTrendPoint = {
  date: string
  label: string
  createdDeals: number
  wonDeals: number
  lostDeals: number
  wonRevenue: number
}

export type SalesAnalyticsSnapshot = {
  id: string
  period: SalesAnalyticsPeriod
  periodStart: string
  periodEnd: string
  capturedAt: string
  currencyCode: string
  createdDeals: number
  openDeals: number
  wonDeals: number
  lostDeals: number
  pipelineValue: number
  weightedPipelineValue: number
  wonRevenue: number
  averageDealSize: number
  winRate: number
  averageSalesCycleDays: number
  staleDeals: number
  overdueNextSteps: number
  stages: SalesStageMetric[]
  owners: SalesOwnerMetric[]
  sources: SalesSourceMetric[]
  forecasts: SalesForecastMetric[]
  trend: SalesTrendPoint[]
}

export type SalesAnalyticsOverview = {
  snapshot: SalesAnalyticsSnapshot
  history: Array<Pick<SalesAnalyticsSnapshot, 'id' | 'period' | 'periodStart' | 'periodEnd' | 'capturedAt'>>
}
