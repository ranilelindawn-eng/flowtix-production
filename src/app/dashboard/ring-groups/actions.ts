'use server'

function inboundRetired(): never {
  throw new Error('Inbound calling is not supported. Flowtix is outbound-only.')
}

export async function createRingGroup() {
  inboundRetired()
}

export async function updateRingGroup() {
  inboundRetired()
}

export async function deleteRingGroup() {
  inboundRetired()
}
