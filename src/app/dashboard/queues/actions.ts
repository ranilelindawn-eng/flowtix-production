'use server'

function inboundRetired(): never {
  throw new Error('Inbound calling is not supported. Flowtix is outbound-only.')
}

export async function createCallQueue() {
  inboundRetired()
}

export async function updateCallQueue() {
  inboundRetired()
}

export async function deleteCallQueue() {
  inboundRetired()
}
