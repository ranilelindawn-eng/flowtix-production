import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import { resolveOwnerAssignment } from '@/lib/ownership'
import { assertActiveCampaignCapacity } from '@/lib/usage-limits'

export const CAMPAIGNS_PER_PAGE = 12

export type CampaignStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'

export type Campaign = {
  id: string
  organization_id: string
  name: string
  description: string | null
  status: CampaignStatus
  start_date: string | null
  end_date: string | null
  owner_membership_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export type CampaignFormValues = {
  name: string
  description: string
  status: CampaignStatus
  start_date: string
  end_date: string
  owner_membership_id: string
}

export type CampaignFilters = {
  search?: string
  status?: CampaignStatus | 'all'
  sort?: 'created_at' | 'name' | 'start_date'
  page?: number
}

type CampaignContext = {
  supabase: NonNullable<
    Awaited<ReturnType<typeof createServerSupabaseClient>>
  >
  userId: string
  organizationId: string
}

async function getCampaignContext(): Promise<CampaignContext> {
  const supabase = await createServerSupabaseClient()

  if (!supabase) {
    throw new Error(
      'Missing Supabase environment variables or authentication context.'
    )
  }

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()

  if (claimsError) {
    throw new Error(claimsError.message)
  }

  const userId = claimsData?.claims?.sub

  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('Unable to verify authenticated user.')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    console.error('Unable to load user profile:', profileError)
  }

  let organizationId: string | null =
    profile?.organization_id ?? null

  if (!organizationId) {
    const { data: membership, error: membershipError } =
      await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()

    if (membershipError) {
      throw new Error(membershipError.message)
    }

    organizationId = membership?.organization_id ?? null
  }

  if (!organizationId) {
    throw new Error(
      'Unable to determine organization for the current user.'
    )
  }

  return {
    supabase,
    userId,
    organizationId,
  }
}

function normalizeOptionalValue(value: string): string | null {
  const normalizedValue = value.trim()

  return normalizedValue.length > 0 ? normalizedValue : null
}

function normalizePage(page: number | undefined): number {
  if (!page || !Number.isInteger(page) || page < 1) {
    return 1
  }

  return page
}

export async function getCampaigns(
  filters: CampaignFilters = {}
): Promise<{
  campaigns: Campaign[]
  count: number
}> {
  const { supabase, organizationId } =
    await getCampaignContext()

  const page = normalizePage(filters.page)
  const offset = (page - 1) * CAMPAIGNS_PER_PAGE

  let query = supabase
    .from('campaigns')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .range(offset, offset + CAMPAIGNS_PER_PAGE - 1)

  const search = filters.search?.trim()

  if (search) {
    const sanitizedSearch = search
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_')
      .replace(/,/g, '\\,')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')

    query = query.or(
      `name.ilike.%${sanitizedSearch}%,description.ilike.%${sanitizedSearch}%`
    )
  }

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  switch (filters.sort) {
    case 'name':
      query = query.order('name', { ascending: true })
      break

    case 'start_date':
      query = query.order('start_date', {
        ascending: true,
        nullsFirst: false,
      })
      break

    case 'created_at':
    default:
      query = query.order('created_at', { ascending: false })
      break
  }

  const { data, count, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return {
    campaigns: (data ?? []) as Campaign[],
    count: count ?? 0,
  }
}

export async function getCampaign(
  id: string
): Promise<Campaign | null> {
  const normalizedId = id.trim()

  if (!normalizedId) {
    return null
  }

  const { supabase, organizationId } =
    await getCampaignContext()

  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', normalizedId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as Campaign | null
}

export async function createCampaign(
  values: CampaignFormValues
): Promise<Campaign> {
  const { supabase, userId, organizationId } =
    await getCampaignContext()
  const membership = await getCurrentOrganization()
  if (!membership || membership.organization_id !== organizationId) {
    throw new Error('Unable to resolve the campaign owner.')
  }
  const owner = await resolveOwnerAssignment(
    membership,
    values.owner_membership_id,
  )

  const name = values.name.trim()

  if (!name) {
    throw new Error('Campaign name is required.')
  }

  const startDate = normalizeOptionalValue(values.start_date)
  const endDate = normalizeOptionalValue(values.end_date)

  if (
    startDate &&
    endDate &&
    new Date(endDate).getTime() < new Date(startDate).getTime()
  ) {
    throw new Error(
      'The campaign end date cannot be earlier than its start date.'
    )
  }

  if (values.status === 'active') {
    await assertActiveCampaignCapacity(organizationId)
  }

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      organization_id: organizationId,
      name,
      description: normalizeOptionalValue(values.description),
      status: values.status,
      start_date: startDate,
      end_date: endDate,
      owner_membership_id: owner.ownerMembershipId,
      created_by: userId,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as Campaign
}

export async function updateCampaign(
  id: string,
  values: CampaignFormValues
): Promise<Campaign> {
  const normalizedId = id.trim()

  if (!normalizedId) {
    throw new Error('A valid campaign ID is required.')
  }

  const { supabase, organizationId } =
    await getCampaignContext()
  const membership = await getCurrentOrganization()
  if (!membership || membership.organization_id !== organizationId) {
    throw new Error('Unable to resolve the campaign owner.')
  }
  const owner = await resolveOwnerAssignment(
    membership,
    values.owner_membership_id,
  )

  const name = values.name.trim()

  if (!name) {
    throw new Error('Campaign name is required.')
  }

  const startDate = normalizeOptionalValue(values.start_date)
  const endDate = normalizeOptionalValue(values.end_date)

  if (
    startDate &&
    endDate &&
    new Date(endDate).getTime() < new Date(startDate).getTime()
  ) {
    throw new Error(
      'The campaign end date cannot be earlier than its start date.'
    )
  }

  const { data: currentCampaign, error: currentCampaignError } =
    await supabase
      .from('campaigns')
      .select('status')
      .eq('id', normalizedId)
      .eq('organization_id', organizationId)
      .maybeSingle()

  if (currentCampaignError) {
    throw new Error(currentCampaignError.message)
  }

  if (!currentCampaign) {
    throw new Error('Campaign not found.')
  }

  if (
    currentCampaign.status !== 'active' &&
    values.status === 'active'
  ) {
    await assertActiveCampaignCapacity(organizationId)
  }

  const { data, error } = await supabase
    .from('campaigns')
    .update({
      name,
      description: normalizeOptionalValue(values.description),
      status: values.status,
      start_date: startDate,
      end_date: endDate,
      owner_membership_id: owner.ownerMembershipId,
    })
    .eq('id', normalizedId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as Campaign
}

export async function deleteCampaign(id: string): Promise<void> {
  const normalizedId = id.trim()

  if (!normalizedId) {
    throw new Error('A valid campaign ID is required.')
  }

  const { supabase, organizationId } =
    await getCampaignContext()

  const { error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', normalizedId)
    .eq('organization_id', organizationId)

  if (error) {
    throw new Error(error.message)
  }
}