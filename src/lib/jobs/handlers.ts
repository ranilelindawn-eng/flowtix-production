import { executeCalendarSync } from '@/lib/calendar/sync'
import { executeIntegrationMaintenance } from '@/lib/integrations/maintenance'
import { executeCampaignMember } from '@/lib/campaigns/engine'
import { executePostCallDispatch } from '@/lib/automation/post-call/dispatcher'
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

registerJobHandler('campaign.execute_member', async ({ job, heartbeat }) => {
  await heartbeat()
  return executeCampaignMember(job.payload)
})


registerJobHandler('calendar.sync_event', async ({ job, heartbeat }) => {
  await heartbeat()
  return executeCalendarSync(job.payload)
})


registerJobHandler('integration.refresh', async ({ job, heartbeat }) => {
  await heartbeat()
  return executeIntegrationMaintenance(job.payload)
})

registerJobHandler('integration.health_check', async ({ job, heartbeat }) => {
  await heartbeat()
  return executeIntegrationMaintenance(job.payload)
})

registerJobHandler('exports.generate', async ({ job, heartbeat }) => {
  await heartbeat()
  const { processExport } = await import('@/lib/exports/processor')
  return processExport(job.payload)
})

registerJobHandler('automation.post_call.dispatch', async ({ job, heartbeat }) => {
  await heartbeat()
  return executePostCallDispatch({
    dispatchJobId: job.id,
    payload: job.payload,
  })
})
