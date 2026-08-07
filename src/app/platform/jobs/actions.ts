'use server'

import { revalidatePath } from 'next/cache'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type PlatformJobActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
}

function formString(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

async function runJobAction(
  rpc:
    | 'platform_retry_background_job'
    | 'platform_cancel_background_job'
    | 'platform_recover_stale_background_job',
  jobId: string,
  reason: string,
): Promise<PlatformJobActionState> {
  await requirePlatformPermission('platform.jobs.manage')

  if (!jobId) {
    return { status: 'error', message: 'Background job ID is required.' }
  }

  if (reason.length < 10) {
    return {
      status: 'error',
      message: 'Enter an action reason of at least 10 characters.',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(rpc, {
    p_job_id: jobId,
    p_reason: reason,
  })

  if (error) {
    return {
      status: 'error',
      message: `Unable to update background job: ${error.message}`,
    }
  }

  if (data !== true) {
    return {
      status: 'error',
      message: 'The background job was not updated.',
    }
  }

  revalidatePath('/platform')
  revalidatePath('/platform/health')
  revalidatePath('/platform/jobs')
  revalidatePath(`/platform/jobs/${jobId}`)

  if (rpc === 'platform_retry_background_job') {
    return {
      status: 'success',
      message: 'Background job requeued with its attempt counter reset.',
    }
  }

  if (rpc === 'platform_cancel_background_job') {
    return {
      status: 'success',
      message: 'Background job cancelled before worker execution.',
    }
  }

  return {
    status: 'success',
    message: 'Expired worker lease recovered using the durable job retry rules.',
  }
}

export async function retryPlatformBackgroundJob(
  _previousState: PlatformJobActionState,
  formData: FormData,
): Promise<PlatformJobActionState> {
  return runJobAction(
    'platform_retry_background_job',
    formString(formData, 'jobId'),
    formString(formData, 'reason'),
  )
}

export async function cancelPlatformBackgroundJob(
  _previousState: PlatformJobActionState,
  formData: FormData,
): Promise<PlatformJobActionState> {
  return runJobAction(
    'platform_cancel_background_job',
    formString(formData, 'jobId'),
    formString(formData, 'reason'),
  )
}

export async function recoverPlatformStaleBackgroundJob(
  _previousState: PlatformJobActionState,
  formData: FormData,
): Promise<PlatformJobActionState> {
  return runJobAction(
    'platform_recover_stale_background_job',
    formString(formData, 'jobId'),
    formString(formData, 'reason'),
  )
}
