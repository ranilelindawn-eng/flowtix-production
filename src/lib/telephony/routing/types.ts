export type InboundRouteType = 'ring_group' | 'queue' | 'organization_fallback'
export type InboundRoutingStrategy = 'simultaneous' | 'sequential'

export type RoutingTarget = {
  userId: string
  priority: number
}

export type InboundRoutingPlan = {
  organizationId: string
  phoneNumberId: string | null
  ringGroupId: string | null
  queueId: string | null
  routeType: InboundRouteType
  strategy: InboundRoutingStrategy
  timeoutSeconds: number
  targets: RoutingTarget[]
  metadata: Record<string, unknown>
}

export type CreatedInboundRoute = InboundRoutingPlan & {
  callId: string
  routingAttemptId: string
  duplicate: boolean
}
