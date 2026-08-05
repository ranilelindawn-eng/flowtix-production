export type InboundRouteType = 'ring_group' | 'queue' | 'organization_fallback'
export type InboundRoutingStrategy =
  | 'simultaneous'
  | 'sequential'
  | 'round_robin'
  | 'least_recently_called'
  | 'longest_idle'
  | 'weighted'

export type RoutingTarget = {
  kind: 'user' | 'number'
  userId: string | null
  phoneNumber: string | null
  priority: number
  weight: number
  tier: number
  sourceRingGroupId: string | null
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
  queueEntryId: string | null
  queueAccepted: boolean
  duplicate: boolean
}
