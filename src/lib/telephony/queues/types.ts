export type QueueEntryStatus =
  | 'waiting'
  | 'reserved'
  | 'connecting'
  | 'answered'
  | 'completed'
  | 'abandoned'
  | 'overflowed'
  | 'failed'

export type QueueEnqueueResult = {
  accepted: boolean
  entryId: string | null
  position: number
  estimatedWaitSeconds: number
  maxWaitSeconds: number
  announcePosition: boolean
  announceEstimatedWait: boolean
  overflowQueueId: string | null
  overflowNumber: string | null
  reason: string | null
}

export type QueueReservationResult = {
  reserved: boolean
  reservationId: string | null
  entryId: string | null
  callId: string | null
  providerCallId: string | null
  reason: string | null
}
