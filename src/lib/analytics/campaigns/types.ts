import type { ReportRange } from '@/lib/reports'

export type CampaignAnalyticsPeriod = ReportRange

export type CampaignMetric = {
  campaignId: string
  name: string
  status: string
  enrollments: number
  completedEnrollments: number
  deliveryAttempts: number
  delivered: number
  failed: number
  emailSent: number
  emailDelivered: number
  emailOpened: number
  emailClicked: number
  emailReplied: number
  emailBounced: number
  smsSent: number
  smsDelivered: number
  smsReplied: number
  calls: number
  connectedCalls: number
  conversions: number
  revenue: number
  cost: number
  deliveryRate: number
  openRate: number
  clickRate: number
  replyRate: number
  bounceRate: number
  smsDeliveryRate: number
  smsReplyRate: number
  callConnectRate: number
  conversionRate: number
  roi: number
}

export type CampaignTrendPoint = {
  date: string
  label: string
  enrollments: number
  delivered: number
  opens: number
  clicks: number
  replies: number
  calls: number
  conversions: number
  revenue: number
}

export type CampaignFunnelStage = { key: string; label: string; value: number; rate: number }

export type CampaignAnalyticsSnapshot = {
  id: string
  period: CampaignAnalyticsPeriod
  periodStart: string
  periodEnd: string
  capturedAt: string
  totalCampaigns: number
  activeCampaigns: number
  enrollments: number
  completedEnrollments: number
  deliveryAttempts: number
  delivered: number
  failed: number
  emailSent: number
  emailOpened: number
  emailClicked: number
  emailReplied: number
  emailBounced: number
  smsSent: number
  smsDelivered: number
  smsReplied: number
  calls: number
  connectedCalls: number
  conversions: number
  revenue: number
  cost: number
  deliveryRate: number
  openRate: number
  clickRate: number
  replyRate: number
  bounceRate: number
  smsDeliveryRate: number
  smsReplyRate: number
  callConnectRate: number
  conversionRate: number
  roi: number
  campaigns: CampaignMetric[]
  funnel: CampaignFunnelStage[]
  trend: CampaignTrendPoint[]
  metadata: Record<string, unknown>
}

export type CampaignAnalyticsOverview = {
  snapshot: CampaignAnalyticsSnapshot
  history: Array<Pick<CampaignAnalyticsSnapshot, 'id' | 'period' | 'periodStart' | 'periodEnd' | 'capturedAt'>>
}
