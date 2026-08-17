'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'

import { requireOwner } from '@/lib/auth'
import { normalizeSmsNumber } from '@/lib/communications/sms-sender'
import { encryptIntegrationSecret } from '@/lib/integrations/crypto'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'

export type BusinessSmsActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
}

const BUCKET = 'sms-provisioning-documents'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_FILE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

const stringValue = (formData: FormData, key: string) => {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

const fileValue = (formData: FormData, key: string) => {
  const value = formData.get(key)
  return value instanceof File && value.size > 0 ? value : null
}

function validateFile(value: File | null, label: string) {
  if (!value) throw new Error(`${label} is required.`)
  if (value.size > MAX_FILE_SIZE) throw new Error(`${label} must be 10 MB or smaller.`)
  if (!ALLOWED_FILE_TYPES.has(value.type)) {
    throw new Error(`${label} must be a PDF, JPG, or PNG file.`)
  }
  return value
}

function safeName(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 160) || 'document'
  )
}

function bounded(value: string, label: string, min: number, max: number) {
  if (value.length < min || value.length > max) {
    throw new Error(`${label} must contain between ${min} and ${max} characters.`)
  }
  return value
}

function optionalBounded(value: string, label: string, max: number) {
  if (!value) return null
  if (value.length > max) throw new Error(`${label} must be ${max} characters or fewer.`)
  return value
}

function email(value: string) {
  const normalized = value.toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 320) {
    throw new Error('Enter a valid authorized contact email address.')
  }
  return normalized
}

function website(value: string) {
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
    return parsed.toString()
  } catch {
    throw new Error('Company website must be a valid http:// or https:// URL.')
  }
}

function accountType(value: string): 'business' | 'residential' {
  if (value === 'business' || value === 'residential') return value
  throw new Error('Select a valid current-provider account type.')
}

function campaignId(value: string, numberType: string) {
  if (numberType === 'toll_free') return 'N/A'
  const normalized = value.trim().toUpperCase()
  if (!normalized) throw new Error('Enter the 10DLC Campaign ID or N/A when it does not apply.')
  if (normalized === 'N/A') return normalized
  if (!/^C[A-Z0-9_-]{5,79}$/.test(normalized)) {
    throw new Error('Enter a valid 10DLC Campaign ID beginning with C, or N/A when not applicable.')
  }
  return normalized
}

async function cleanupStorage(paths: string[]) {
  if (!paths.length) return
  try {
    await createTelephonyAdminClient().storage.from(BUCKET).remove(paths)
  } catch {
    // Best-effort cleanup only. The originating error is returned to the owner.
  }
}

export async function submitExistingCompanySmsNumber(
  _previousState: BusinessSmsActionState,
  formData: FormData,
): Promise<BusinessSmsActionState> {
  void _previousState
  let requestId: string | null = null
  const uploadedPaths: string[] = []

  try {
    const membership = await requireOwner()
    const phoneNumber = normalizeSmsNumber(stringValue(formData, 'phone_number'))
    const numberType = stringValue(formData, 'number_type')

    if (!['10dlc', 'toll_free'].includes(numberType)) {
      throw new Error('Select either Local VoIP / 10DLC or Toll-Free for the company number.')
    }

    const voiceProviderName = bounded(
      stringValue(formData, 'voice_provider_name'),
      'Current voice provider',
      2,
      120,
    )
    const authorizedContactName = bounded(
      stringValue(formData, 'authorized_contact_name'),
      'Authorized contact name',
      2,
      160,
    )
    const authorizedContactEmail = email(stringValue(formData, 'authorized_contact_email'))
    const companyWebsite = website(stringValue(formData, 'company_website'))

    const providerAccountNumber = bounded(
      stringValue(formData, 'provider_account_number'),
      'Provider account number',
      1,
      120,
    )
    const currentAccountType = accountType(stringValue(formData, 'account_type'))
    const authorizedNameOnAccount = bounded(
      stringValue(formData, 'authorized_name_on_account'),
      'Authorized name on account',
      2,
      160,
    )
    const billingPhoneNumber = bounded(
      stringValue(formData, 'billing_phone_number'),
      'Billing phone number',
      7,
      40,
    )
    const endUserName = bounded(
      stringValue(formData, 'end_user_name'),
      'End user / business name',
      2,
      200,
    )
    const phoneServiceAddress = bounded(
      stringValue(formData, 'phone_service_address'),
      'Phone service address',
      5,
      500,
    )
    const tcrCampaignId = campaignId(stringValue(formData, 'tcr_campaign_id'), numberType)
    const providerAccountPin = bounded(
      stringValue(formData, 'provider_account_pin'),
      'Provider account PIN',
      1,
      128,
    )

    const useCase = bounded(stringValue(formData, 'use_case'), 'SMS use case', 10, 2000)
    const sampleMessage = bounded(
      stringValue(formData, 'sample_message'),
      'Sample SMS message',
      5,
      1600,
    )
    const optInDescription = bounded(
      stringValue(formData, 'opt_in_description'),
      'Opt-in description',
      10,
      2000,
    )

    if (formData.get('ownership_authorized') !== 'on') {
      throw new Error('Confirm that your organization owns or is authorized to use this number.')
    }
    if (formData.get('provider_split_authorized') !== 'on') {
      throw new Error(
        'Confirm that your current voice provider permits messaging to be hosted separately.',
      )
    }

    const loa = validateFile(fileValue(formData, 'loa_document'), 'Signed Letter of Authorization')
    const invoice = validateFile(fileValue(formData, 'provider_invoice'), 'Recent provider invoice')

    // Encrypt before any upload or database write. This also fails early if the
    // deployment does not have Flowtix's existing INTEGRATION_ENCRYPTION_KEY.
    const encryptedCarrierSecret = encryptIntegrationSecret({
      providerAccountPin,
    })

    const admin = createTelephonyAdminClient()
    const { data: existing, error: existingError } = await admin
      .from('organization_sms_sender_requests')
      .select('id,status,phone_number')
      .eq('organization_id', membership.organization_id)
      .in('status', ['provider_submission_required', 'provider_processing', 'action_required'])
      .limit(1)
      .maybeSingle()

    if (existingError && existingError.code !== '42P01') {
      throw new Error(`Unable to check the current SMS request: ${existingError.message}`)
    }
    if (existing) {
      return {
        status: 'error',
        message: `A company-number request for ${existing.phone_number} is already in progress. Cancel or complete it before submitting another number.`,
      }
    }

    requestId = randomUUID()
    const loaPath = `${membership.organization_id}/${requestId}/loa-${safeName(loa.name)}`
    const invoicePath = `${membership.organization_id}/${requestId}/invoice-${safeName(invoice.name)}`

    let uploadResult = await admin.storage.from(BUCKET).upload(loaPath, loa, {
      contentType: loa.type,
      upsert: false,
    })
    if (uploadResult.error) {
      throw new Error(`Unable to upload the authorization document: ${uploadResult.error.message}`)
    }
    uploadedPaths.push(loaPath)

    uploadResult = await admin.storage.from(BUCKET).upload(invoicePath, invoice, {
      contentType: invoice.type,
      upsert: false,
    })
    if (uploadResult.error) {
      throw new Error(`Unable to upload the provider invoice: ${uploadResult.error.message}`)
    }
    uploadedPaths.push(invoicePath)

    const { error: insertError } = await admin.from('organization_sms_sender_requests').insert({
      id: requestId,
      organization_id: membership.organization_id,
      phone_number: phoneNumber,
      number_type: numberType,
      voice_provider_name: voiceProviderName,
      authorized_contact_name: authorizedContactName,
      authorized_contact_email: authorizedContactEmail,
      company_website: companyWebsite,
      provider_account_number: providerAccountNumber,
      account_type: currentAccountType,
      authorized_name_on_account: authorizedNameOnAccount,
      billing_phone_number: billingPhoneNumber,
      end_user_name: endUserName,
      phone_service_address: phoneServiceAddress,
      tcr_campaign_id: optionalBounded(tcrCampaignId, '10DLC Campaign ID', 80),
      use_case: useCase,
      sample_message: sampleMessage,
      opt_in_description: optInDescription,
      ownership_authorized: true,
      provider_split_authorized: true,
      loa_file_name: loa.name,
      loa_storage_path: loaPath,
      invoice_file_name: invoice.name,
      invoice_storage_path: invoicePath,
      status: 'provider_submission_required',
      provider: 'signalwire',
      submitted_by: membership.user_id,
    })

    if (insertError) {
      if (insertError.code === '23505') {
        throw new Error('This number already has an active or in-progress SMS provisioning request.')
      }
      throw new Error(`Unable to create the SMS provisioning request: ${insertError.message}`)
    }

    const { error: secretError } = await admin
      .from('organization_sms_sender_request_secrets')
      .insert({
        request_id: requestId,
        encrypted_credentials: encryptedCarrierSecret,
      })

    if (secretError) {
      await admin.from('organization_sms_sender_requests').delete().eq('id', requestId)
      throw new Error(`Unable to securely store the carrier account PIN: ${secretError.message}`)
    }

    revalidatePath('/dashboard/organization')
    revalidatePath('/dashboard/settings/automation')

    return {
      status: 'success',
      message:
        'Company SMS number request saved. Flowtix Platform will review the carrier details and submit the Messaging Services Only request to SignalWire.',
    }
  } catch (error) {
    if (uploadedPaths.length) await cleanupStorage(uploadedPaths)

    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unable to submit the company SMS number.',
    }
  }
}

export async function cancelExistingCompanySmsNumberRequest(
  _previousState: BusinessSmsActionState,
  formData: FormData,
): Promise<BusinessSmsActionState> {
  void _previousState
  try {
    const membership = await requireOwner()
    const requestId = stringValue(formData, 'request_id')
    if (!requestId) throw new Error('SMS request ID is required.')

    const admin = createTelephonyAdminClient()
    const { data, error } = await admin
      .from('organization_sms_sender_requests')
      .update({
        status: 'cancelled',
        provider_status: 'cancelled_by_owner',
        provider_note: 'Cancelled by the workspace owner before activation.',
      })
      .eq('id', requestId)
      .eq('organization_id', membership.organization_id)
      .in('status', ['provider_submission_required', 'action_required'])
      .select('id')
      .maybeSingle()

    if (error) throw new Error(`Unable to cancel the SMS request: ${error.message}`)
    if (!data) {
      return {
        status: 'error',
        message:
          'This request can no longer be cancelled from the workspace. Contact Flowtix support if it is already processing.',
      }
    }

    revalidatePath('/dashboard/organization')
    return { status: 'success', message: 'The SMS provisioning request was cancelled.' }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unable to cancel the SMS request.',
    }
  }
}
