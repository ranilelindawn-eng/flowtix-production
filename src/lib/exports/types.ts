export const EXPORT_FORMATS = ['csv', 'excel', 'pdf'] as const

export const EXPORT_RESOURCES = [
  'contacts',
  'companies',
  'opportunities',
  'calls',
  'campaigns',
  'tasks',
  'activities',
  'recordings',
  'transcripts',
  'sales_analytics',
  'call_analytics',
  'agent_analytics',
  'campaign_analytics',
] as const

export const EXPORT_RESOURCE_LABELS: Record<ExportResource, string> = {
  contacts: 'Contacts',
  companies: 'Companies',
  opportunities: 'Deals / Opportunities',
  calls: 'Calls',
  campaigns: 'Campaigns',
  tasks: 'Tasks',
  activities: 'Activities',
  recordings: 'Call Recordings',
  transcripts: 'Call Transcripts',
  sales_analytics: 'Sales Analytics',
  call_analytics: 'Call Analytics',
  agent_analytics: 'Agent Analytics',
  campaign_analytics: 'Campaign Analytics',
}

export type ExportFormat = (typeof EXPORT_FORMATS)[number]
export type ExportResource = (typeof EXPORT_RESOURCES)[number]
export type ExportStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ExportJobRecord = {
  id: string
  organizationId: string
  resource: ExportResource
  format: ExportFormat
  status: ExportStatus
  fileName: string | null
  rowCount: number
  fileSizeBytes: number
  createdAt: string
  completedAt: string | null
  expiresAt: string | null
  errorMessage: string | null
  createdBy: string
  createdByName: string | null
  createdByEmail: string | null
}

export type ExportScheduleRecord = {
  id: string
  organizationId: string
  name: string
  resource: ExportResource
  format: ExportFormat
  frequency: 'daily' | 'weekly' | 'monthly'
  timezone: string
  nextRunAt: string
  isActive: boolean
  filters: Record<string, unknown>
  createdAt: string
  updatedAt: string
  createdBy: string
  createdByName: string | null
  createdByEmail: string | null
}

export type CreateExportInput = {
  resource: ExportResource
  format: ExportFormat
  filters?: Record<string, unknown>
}

export type CreateExportScheduleInput = CreateExportInput & {
  name: string
  frequency: 'daily' | 'weekly' | 'monthly'
  timezone?: string
  nextRunAt: string
  isActive?: boolean
}

export type UpdateExportScheduleInput = {
  isActive?: boolean
  name?: string
}
