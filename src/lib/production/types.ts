export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown'
export type ProductionMetric = { key: string; label: string; value: number; status: HealthStatus; detail?: string }
export type ProductionReadinessOverview = {
  generatedAt: string
  score: number
  status: HealthStatus
  metrics: ProductionMetric[]
  latestValidation: { id: string; status: string; score: number; createdAt: string } | null
  latestLaunchAudit: { id: string; status: string; score: number; createdAt: string } | null
  incidents: Array<{ id: string; title: string; severity: string; status: string; createdAt: string }>
  backups: Array<{ id: string; status: string; backupType: string; createdAt: string }>
}
