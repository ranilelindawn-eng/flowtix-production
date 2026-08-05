export type KpiValueFormat = 'number' | 'currency' | 'percentage' | 'duration'
export type KpiDirection = 'higher_is_better' | 'lower_is_better' | 'neutral'
export type KpiPeriod = '7d' | '30d' | '90d' | '365d'

export type KpiDefinition = {
  id: string
  key: string
  name: string
  description: string | null
  category: string
  valueFormat: KpiValueFormat
  direction: KpiDirection
  targetValue: number | null
  isActive: boolean
  position: number
}

export type KpiValue = {
  definitionId: string
  key: string
  name: string
  category: string
  valueFormat: KpiValueFormat
  direction: KpiDirection
  targetValue: number | null
  value: number
  previousValue: number | null
  changePercent: number | null
}

export type KpiSnapshot = {
  id: string
  period: KpiPeriod
  periodStart: string
  periodEnd: string
  capturedAt: string
  values: KpiValue[]
}

export type KpiOverview = {
  snapshot: KpiSnapshot | null
  history: Array<Pick<KpiSnapshot, 'id' | 'period' | 'periodStart' | 'periodEnd' | 'capturedAt'>>
}
