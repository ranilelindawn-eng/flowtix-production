export type CallOwnershipLease = {
  acquired: boolean
  leaseId: string | null
  leaseToken: string | null
  expiresAt: string | null
  reason: string | null
}

export type CallOwnershipTransferResult = {
  transferred: boolean
  ownerUserId: string | null
  version: number | null
  reason: string | null
}
