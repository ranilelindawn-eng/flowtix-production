'use server'

import { revalidatePath } from 'next/cache'

import { requirePermission } from '@/lib/auth'
import { writeAuditEvent } from '@/lib/security/audit'
import { createClient } from '@/lib/supabase/server'

function checked(formData: FormData, name: string) {
  return formData.get(name) === 'on'
}

export async function updateAutomationControls(
  formData: FormData,
): Promise<void> {
  const organization = await requirePermission('automation.manage')
  const supabase = await createClient()
  const pauseReason = String(
    formData.get('pauseReason') ?? '',
  ).trim()

  const nextValues = {
    global_paused: checked(formData, 'globalPaused'),
    communications_paused: checked(
      formData,
      'communicationsPaused',
    ),
    sequences_paused: checked(formData, 'sequencesPaused'),
    campaigns_paused: checked(formData, 'campaignsPaused'),
    pause_reason: pauseReason || null,
    updated_by: organization.user_id,
    updated_at: new Date().toISOString(),
  }

  const { data: previous } = await supabase
    .from('automation_controls')
    .select(
      'global_paused,communications_paused,sequences_paused,campaigns_paused,pause_reason',
    )
    .eq('organization_id', organization.organization_id)
    .maybeSingle()

  const { error } = await supabase
    .from('automation_controls')
    .upsert(
      {
        organization_id: organization.organization_id,
        ...nextValues,
      },
      { onConflict: 'organization_id' },
    )

  if (error) {
    throw new Error(
      `Unable to update automation controls: ${error.message}`,
    )
  }

  await writeAuditEvent({
    action: 'automation.controls.updated',
    resourceType: 'automation_control',
    resourceId: organization.organization_id,
    outcome: 'success',
    source: 'application',
    oldValues: previous ?? {},
    newValues: nextValues,
  })

  revalidatePath('/dashboard/settings/automation')
  revalidatePath('/dashboard/settings/jobs')
}

export async function retryAllFailedAutomationJobs(): Promise<void> {
  const organization = await requirePermission('automation.manage')
  const supabase = await createClient()

  const { data, error } = await supabase.rpc(
    'retry_failed_automation_jobs',
    {
      p_organization_id: organization.organization_id,
      p_limit: 100,
    },
  )

  if (error) {
    throw new Error(
      `Unable to retry failed automation jobs: ${error.message}`,
    )
  }

  await writeAuditEvent({
    action: 'automation.failed_jobs.retried',
    resourceType: 'background_job',
    resourceId: organization.organization_id,
    outcome: 'success',
    source: 'application',
    metadata: {
      retried: Number(data ?? 0),
    },
  })

  revalidatePath('/dashboard/settings/automation')
  revalidatePath('/dashboard/settings/jobs')
}

export async function releaseExpiredCampaignReservations(): Promise<void> {
  const organization = await requirePermission('automation.manage')
  const supabase = await createClient()

  const { data, error } = await supabase.rpc(
    'recover_expired_campaign_reservations',
    { p_limit: 500 },
  )

  if (error) {
    throw new Error(
      `Unable to recover campaign reservations: ${error.message}`,
    )
  }

  await writeAuditEvent({
    action: 'automation.campaign_reservations.recovered',
    resourceType: 'campaign_member',
    resourceId: organization.organization_id,
    outcome: 'success',
    source: 'application',
    metadata:
      data && typeof data === 'object'
        ? (data as Record<string, string | number | boolean | null>)
        : {},
  })

  revalidatePath('/dashboard/settings/automation')
}
