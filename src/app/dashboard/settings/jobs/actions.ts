'use server'

import { revalidatePath } from 'next/cache'

import { requirePermission } from '@/lib/auth'
import { writeAuditLog } from '@/lib/security/audit'
import { createClient } from '@/lib/supabase/server'

function readJobId(formData: FormData) {
  const jobId = String(formData.get('jobId') ?? '').trim()

  if (!jobId) {
    throw new Error('Background job ID is required.')
  }

  return jobId
}

export async function retryBackgroundJob(formData: FormData) {
  const organization = await requirePermission('jobs.manage')
  const jobId = readJobId(formData)
  const supabase = await createClient()

  const { data, error } = await supabase.rpc(
    'retry_background_job',
    { p_job_id: jobId },
  )

  if (error) {
    throw new Error(`Unable to retry background job: ${error.message}`)
  }

  await writeAuditLog('background_job.retry', 'background_job', jobId, {
    organizationId: organization.organization_id,
    resultingStatus:
      data && typeof data === 'object' && 'status' in data
        ? data.status
        : null,
  })

  revalidatePath('/dashboard/settings/jobs')
}

export async function cancelBackgroundJob(formData: FormData) {
  const organization = await requirePermission('jobs.manage')
  const jobId = readJobId(formData)
  const supabase = await createClient()

  const { data, error } = await supabase.rpc(
    'cancel_background_job',
    { p_job_id: jobId },
  )

  if (error) {
    throw new Error(`Unable to cancel background job: ${error.message}`)
  }

  await writeAuditLog('background_job.cancel', 'background_job', jobId, {
    organizationId: organization.organization_id,
    resultingStatus:
      data && typeof data === 'object' && 'status' in data
        ? data.status
        : null,
  })

  revalidatePath('/dashboard/settings/jobs')
}
