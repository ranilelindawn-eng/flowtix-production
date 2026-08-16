'use server'

export async function retryBackgroundJob() {
  throw new Error('Background job controls are restricted to the Flowtix Platform team.')
}

export async function cancelBackgroundJob() {
  throw new Error('Background job controls are restricted to the Flowtix Platform team.')
}
