import type { TeamRole } from '@/lib/team'

export type DashboardKind = 'executive' | 'sales' | 'agent' | 'campaign' | 'ai' | 'operations' | 'telephony' | 'custom'
export type DashboardWidgetType = 'kpi' | 'link' | 'status' | 'trend'
export type DashboardWidgetConfig = {
  id: string
  type: DashboardWidgetType
  title: string
  metric: string
  description?: string
  href?: string
  format?: 'number' | 'percent' | 'currency' | 'duration'
  position: { x: number; y: number; w: number; h: number }
}
export type SavedDashboard = {
  id: string
  organizationId: string
  name: string
  slug: string
  description: string | null
  kind: DashboardKind
  isDefault: boolean
  isSystem: boolean
  allowedRoles: TeamRole[]
  layout: DashboardWidgetConfig[]
  createdBy: string
  createdAt: string
  updatedAt: string
}
export type DashboardMetricValue = number | string
export type DashboardView = { dashboard: SavedDashboard; metrics: Record<string, DashboardMetricValue> }
export type DashboardInput = { name: string; slug?: string; description?: string | null; kind?: DashboardKind; isDefault?: boolean; allowedRoles?: TeamRole[]; layout?: DashboardWidgetConfig[] }
