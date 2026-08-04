import { deliverCommunication } from '@/lib/communications/delivery'
import type { JobHandler } from '@/lib/jobs/types'
import { executeSequenceStep } from '@/lib/sequences/engine'

const handlers = new Map<string, JobHandler>()

export function registerJobHandler(jobType: string, handler: JobHandler) {
  const normalized = jobType.trim()
  if (!normalized) throw new Error('A job handler type is required.')
  handlers.set(normalized, handler)
}

export function getJobHandler(jobType: string) {
  return handlers.get(jobType)
}

registerJobHandler('system.noop', async ({ job }) => ({
  ok: true,
  jobId: job.id,
  processedAt: new Date().toISOString(),
}))

registerJobHandler('sequence.execute_step', async ({ job, heartbeat }) => {
  await heartbeat()
  return executeSequenceStep(job.payload)
})

registerJobHandler('communications.send', async ({ job, heartbeat }) => {
  await heartbeat()
  return deliverCommunication(job.payload)
})
