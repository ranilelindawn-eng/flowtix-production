'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createPayMongoCheckoutSession, retrievePayMongoCheckoutSession } from '@/lib/paymongo/client'
import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type EnterpriseActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
  checkoutUrl?: string
}

function formString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function optionalUuid(value: string): string | null {
  return value.trim() || null
}

function optionalInteger(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN
}

function pesosToCents(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return Number.NaN
  const cents = Math.round(parsed * 100)
  return Number.isSafeInteger(cents) ? cents : Number.NaN
}

function gbToBytes(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return Number.NaN
  const bytes = Math.round(parsed * 1024 * 1024 * 1024)
  return Number.isSafeInteger(bytes) ? bytes : Number.NaN
}

function refreshEnterprise(accountId?: string, organizationId?: string | null) {
  revalidatePath('/platform')
  revalidatePath('/platform/enterprise')
  revalidatePath('/platform/subscriptions')
  revalidatePath('/platform/customers')
  if (accountId) revalidatePath(`/platform/enterprise/${accountId}`)
  if (organizationId) {
    revalidatePath(`/platform/customers/${organizationId}`)
    revalidatePath(`/platform/organizations/${organizationId}`)
  }
}

function actionError(prefix: string, error: unknown): EnterpriseActionState {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : 'The request could not be completed.'
  return { status: 'error', message: `${prefix}: ${message}` }
}

export async function createEnterpriseAccount(
  formData: FormData,
): Promise<void> {
  await requirePlatformPermission('platform.enterprise.manage')

  const contactName = formString(formData, 'contactName')
  const contactEmail = formString(formData, 'contactEmail')
  const companyName = formString(formData, 'companyName')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_create_enterprise_account',
    {
      p_contact_name: contactName,
      p_contact_email: contactEmail,
      p_company_name: companyName || null,
    },
  )

  if (error || typeof data !== 'string') {
    throw new Error(error?.message ?? 'Enterprise account could not be created.')
  }

  redirect(`/platform/enterprise/${data}`)
}

export async function saveEnterpriseAccount(
  _previousState: EnterpriseActionState,
  formData: FormData,
): Promise<EnterpriseActionState> {
  await requirePlatformPermission('platform.enterprise.manage')

  const accountId = formString(formData, 'accountId')
  const organizationIdInput = formString(formData, 'organizationId')
  if (organizationIdInput && !UUID_PATTERN.test(organizationIdInput)) {
    return {
      status: 'error',
      message: 'Flowtix organization ID must be a valid UUID.',
    }
  }
  const organizationId = optionalUuid(organizationIdInput)
  const proposedPrice = pesosToCents(formString(formData, 'proposedMonthlyPricePhp'))
  const memberLimit = optionalInteger(formString(formData, 'customMemberLimit'))
  const contactLimit = optionalInteger(formString(formData, 'customContactLimit'))
  const campaignLimit = optionalInteger(formString(formData, 'customActiveCampaignLimit'))
  const sequenceLimit = optionalInteger(formString(formData, 'customActiveSequenceLimit'))
  const storageBytes = gbToBytes(formString(formData, 'customStorageGb'))
  const retentionDays = optionalInteger(formString(formData, 'customRecordingRetentionDays'))
  const aiLimit = optionalInteger(formString(formData, 'customAiRequestsPerMonth'))
  const transcriptionLimit = optionalInteger(formString(formData, 'customTranscriptionMinutesPerMonth'))

  const numericValues = [
    proposedPrice,
    memberLimit,
    contactLimit,
    campaignLimit,
    sequenceLimit,
    storageBytes,
    retentionDays,
    aiLimit,
    transcriptionLimit,
  ]

  if (numericValues.some((value) => typeof value === 'number' && Number.isNaN(value))) {
    return {
      status: 'error',
      message: 'Price and custom limits must contain valid numbers.',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_save_enterprise_account',
    {
      p_account_id: accountId,
      p_contact_name: formString(formData, 'contactName'),
      p_contact_email: formString(formData, 'contactEmail'),
      p_company_name: formString(formData, 'companyName') || null,
      p_organization_id: organizationId,
      p_onboarding_status: formString(formData, 'onboardingStatus'),
      p_proposed_monthly_price_cents: proposedPrice,
      p_custom_member_limit: memberLimit,
      p_custom_contact_limit: contactLimit,
      p_custom_active_campaign_limit: campaignLimit,
      p_custom_active_sequence_limit: sequenceLimit,
      p_custom_storage_bytes: storageBytes,
      p_custom_recording_retention_days: retentionDays,
      p_custom_ai_requests_per_month: aiLimit,
      p_custom_transcription_minutes_per_month: transcriptionLimit,
      p_contract_reference_notes: formString(formData, 'contractReferenceNotes') || null,
    },
  )

  if (error || data !== true) {
    return actionError('Enterprise account could not be saved', error ?? new Error('No update was applied.'))
  }

  refreshEnterprise(accountId, organizationId)
  return { status: 'success', message: 'Enterprise proposal, limits, onboarding status, and notes were saved.' }
}

export async function createEnterpriseCheckout(
  _previousState: EnterpriseActionState,
  formData: FormData,
): Promise<EnterpriseActionState> {
  await requirePlatformPermission('platform.enterprise.manage')

  const accountId = formString(formData, 'accountId')
  let creationToken: string | null = null

  try {
    const supabase = await createClient()
    const { data: lease, error: leaseError } = await supabase.rpc(
      'platform_begin_enterprise_checkout',
      { p_account_id: accountId },
    )

    if (leaseError || !lease || typeof lease !== 'object') {
      throw new Error(leaseError?.message ?? 'Enterprise checkout could not be reserved.')
    }

    const row = lease as Record<string, unknown>
    creationToken =
      typeof row.creationToken === 'string' ? row.creationToken : null
    const amountCents =
      typeof row.amountCents === 'number' ? row.amountCents : Number(row.amountCents)
    const contactEmail =
      typeof row.contactEmail === 'string' ? row.contactEmail : null
    const companyName =
      typeof row.companyName === 'string' && row.companyName.trim()
        ? row.companyName.trim()
        : 'Flowtix Enterprise'

    if (!creationToken || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw new Error('Enterprise checkout reservation returned invalid pricing data.')
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      'https://www.flowtix.work'

    const checkout = await createPayMongoCheckoutSession({
      amount: amountCents,
      name: 'Flowtix Enterprise',
      description: `${companyName} — Flowtix Enterprise monthly subscription`,
      customerEmail: contactEmail,
      metadata: {
        enterprise_account_id: accountId,
        ...(typeof row.organizationId === 'string' && row.organizationId.trim()
          ? { organization_id: row.organizationId.trim() }
          : {}),
        plan_code: 'enterprise',
        billing_provider: 'paymongo',
        enterprise_assisted_onboarding: 'true',
      },
      successUrl: `${appUrl}/enterprise/checkout?status=success`,
      cancelUrl: `${appUrl}/enterprise/checkout?status=cancelled`,
    })

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { data: finalized, error: finalizeError } = await supabase.rpc(
      'platform_finalize_enterprise_checkout',
      {
        p_account_id: accountId,
        p_creation_token: creationToken,
        p_checkout_id: checkout.checkoutId,
        p_checkout_url: checkout.checkoutUrl,
        p_expires_at: expiresAt,
      },
    )

    if (finalizeError || finalized !== true) {
      throw new Error(finalizeError?.message ?? 'Enterprise checkout could not be finalized.')
    }

    creationToken = null
    refreshEnterprise(accountId)

    return {
      status: 'success',
      message: 'Enterprise PayMongo checkout created. Copy the secure checkout link and send it to the customer.',
      checkoutUrl: checkout.checkoutUrl,
    }
  } catch (error) {
    if (creationToken) {
      try {
        const supabase = await createClient()
        await supabase.rpc('platform_abandon_enterprise_checkout', {
          p_account_id: accountId,
          p_creation_token: creationToken,
        })
      } catch {
        // Preserve the original checkout error.
      }
    }

    return actionError('Enterprise checkout could not be created', error)
  }
}

export async function syncEnterprisePayment(
  _previousState: EnterpriseActionState,
  formData: FormData,
): Promise<EnterpriseActionState> {
  await requirePlatformPermission('platform.enterprise.manage')

  const accountId = formString(formData, 'accountId')
  const checkoutId = formString(formData, 'checkoutId')

  if (!checkoutId) {
    return { status: 'error', message: 'No Enterprise PayMongo checkout exists yet.' }
  }

  try {
    const checkout = await retrievePayMongoCheckoutSession(checkoutId)
    const payment = checkout.payments[0]
    const paymentId = payment?.id?.trim() ?? ''
    const paymentStatus = payment?.attributes?.status?.trim().toLowerCase() ?? checkout.status?.trim().toLowerCase() ?? ''
    const amount = payment?.attributes?.amount
    const currency = payment?.attributes?.currency?.trim().toUpperCase() ?? ''
    const paidAt =
      checkout.paidAt === null || checkout.paidAt === undefined
        ? null
        : typeof checkout.paidAt === 'number'
          ? new Date(checkout.paidAt * 1000).toISOString()
          : new Date(checkout.paidAt).toISOString()

    const supabase = await createClient()
    const { data, error } = await supabase.rpc(
      'platform_sync_enterprise_payment',
      {
        p_account_id: accountId,
        p_checkout_id: checkoutId,
        p_payment_id: paymentId || null,
        p_payment_status: paymentStatus || null,
        p_amount: typeof amount === 'number' ? amount : null,
        p_currency: currency || null,
        p_paid_at: paidAt,
      },
    )

    if (error || data !== true) {
      throw new Error(error?.message ?? 'Enterprise payment status could not be synchronized.')
    }

    refreshEnterprise(accountId)
    return {
      status: 'success',
      message:
        paymentStatus === 'paid'
          ? 'PayMongo payment is verified as paid. Enterprise can now be activated after onboarding and limits are ready.'
          : `PayMongo checkout synchronized. Current provider status: ${paymentStatus || 'pending'}.`,
    }
  } catch (error) {
    return actionError('Enterprise payment could not be synchronized', error)
  }
}

export async function activateEnterpriseAccount(
  _previousState: EnterpriseActionState,
  formData: FormData,
): Promise<EnterpriseActionState> {
  await requirePlatformPermission('platform.enterprise.manage')

  const accountId = formString(formData, 'accountId')
  const organizationId = formString(formData, 'organizationId')
  const reason = formString(formData, 'reason')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_activate_enterprise_account',
    {
      p_account_id: accountId,
      p_reason: reason,
    },
  )

  if (error || data !== true) {
    return actionError('Enterprise could not be activated', error ?? new Error('Activation was not applied.'))
  }

  refreshEnterprise(accountId, organizationId || null)
  return {
    status: 'success',
    message: 'Enterprise is active. The linked organization now uses the negotiated Enterprise limits and Business+ feature entitlements.',
  }
}

export async function suspendEnterpriseAccount(
  _previousState: EnterpriseActionState,
  formData: FormData,
): Promise<EnterpriseActionState> {
  await requirePlatformPermission('platform.enterprise.manage')

  const accountId = formString(formData, 'accountId')
  const organizationId = formString(formData, 'organizationId')
  const reason = formString(formData, 'reason')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_suspend_enterprise_account',
    {
      p_account_id: accountId,
      p_reason: reason,
    },
  )

  if (error || data !== true) {
    return actionError('Enterprise could not be suspended', error ?? new Error('Suspension was not applied.'))
  }

  refreshEnterprise(accountId, organizationId || null)
  return {
    status: 'success',
    message: 'Enterprise subscription access is suspended. Customer data remains stored and custom limits remain configured.',
  }
}
