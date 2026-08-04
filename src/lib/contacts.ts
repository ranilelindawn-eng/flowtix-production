import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import { resolveOwnerAssignment } from '@/lib/ownership'
import type { Contact, ContactProfile } from '@/types/contact'

export const CONTACTS_PER_PAGE = 12

type ContactStatus = Contact['status']


type ContactFormValues = {
  first_name: string
  last_name: string
  company: string
  email: string
  phone: string
  job_title: string
  status: ContactStatus
  mobile: string
  tags: string
  notes: string
  owner_membership_id: string
}

type ContactRow = {
  id: string
  organization_id: string
  first_name: string | null
  last_name: string | null
  company: string | null
  email: string | null
  phone: string | null
  title: string | null
  status: ContactStatus
  metadata: unknown
  owner_membership_id: string | null
  owner?: { user_id?: string | null } | null
  created_by: string | null
  created_at: string
  updated_at: string
}

const VALID_STATUSES: ContactStatus[] = [
  'active',
  'inactive',
  'archived',
]

const VALID_SORT_FIELDS = [
  'created_at',
  'first_name',
  'last_name',
  'company',
  'updated_at',
] as const

type ContactSortField = (typeof VALID_SORT_FIELDS)[number]

function normalizePage(page: number): number {
  if (!Number.isFinite(page) || page < 1) {
    return 1
  }

  return Math.floor(page)
}

function normalizeSearch(search: string): string {
  return search
    .trim()
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 150)
}

function normalizeSortField(sort: string): ContactSortField {
  if (
    VALID_SORT_FIELDS.includes(
      sort as ContactSortField,
    )
  ) {
    return sort as ContactSortField
  }

  return 'created_at'
}

function normalizeStatus(
  status: ContactStatus,
): ContactStatus {
  if (VALID_STATUSES.includes(status)) {
    return status
  }

  return 'active'
}

function normalizeTags(
  tags: string | null | undefined,
): string[] {
  if (!tags) {
    return []
  }

  return Array.from(
    new Set(
      tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  )
}

function normalizeMetadata(
  metadata: unknown,
): Contact['metadata'] {
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata)
  ) {
    return {}
  }

  const value = metadata as Record<string, unknown>

  return {
    mobile:
      typeof value.mobile === 'string'
        ? value.mobile
        : undefined,
    tags: Array.isArray(value.tags)
      ? value.tags.filter(
          (tag): tag is string =>
            typeof tag === 'string',
        )
      : undefined,
    owner_id:
      typeof value.owner_id === 'string'
        ? value.owner_id
        : undefined,
    owner_name:
      typeof value.owner_name === 'string'
        ? value.owner_name
        : undefined,
    notes:
      typeof value.notes === 'string'
        ? value.notes
        : undefined,
  }
}

function mapContact(row: ContactRow): Contact {
  return {
    id: row.id,
    organization_id: row.organization_id,
    first_name: row.first_name ?? '',
    last_name: row.last_name ?? '',
    company: row.company,
    email: row.email ?? '',
    phone: row.phone,
    title: row.title,
    status: row.status,
    metadata: normalizeMetadata(row.metadata),
    owner_membership_id: row.owner_membership_id,
    owner_user_id: row.owner?.user_id ?? null,
    owner_name: null,
    created_by: row.created_by ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function hydrateContactOwnerNames(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  rows: ContactRow[],
): Promise<Contact[]> {
  const contacts = rows.map(mapContact)
  const ownerUserIds = Array.from(
    new Set(
      contacts
        .map((contact) => contact.owner_user_id)
        .filter((userId): userId is string => Boolean(userId)),
    ),
  )

  if (ownerUserIds.length === 0) {
    return contacts
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id,full_name')
    .in('id', ownerUserIds)

  if (error) {
    throw new Error(`Failed to load contact owner profiles: ${error.message}`)
  }

  const names = new Map(
    (data ?? []).map((profile) => [
      profile.id,
      profile.full_name?.trim() || 'Unnamed member',
    ]),
  )

  return contacts.map((contact) => ({
    ...contact,
    owner_name: contact.owner_user_id
      ? names.get(contact.owner_user_id) ?? 'Unnamed member'
      : null,
  }))
}

async function requireSupabaseClient() {
  const supabase = await createServerSupabaseClient()

  if (!supabase) {
    throw new Error(
      'Missing Supabase environment variables or authentication context.',
    )
  }

  return supabase
}

async function requireAuthenticatedUser() {
  const supabase = await requireSupabaseClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error(
      'Unable to verify the authenticated user.',
    )
  }

  return {
    supabase,
    user,
  }
}

async function requireOrganization() {
  const { supabase, user } =
    await requireAuthenticatedUser()

  const organization = await getCurrentOrganization()

  if (!organization) {
    throw new Error(
      'Unable to determine the current organization.',
    )
  }

  return {
    supabase,
    user,
    organization,
  }
}

export async function getContacts(
  search: string,
  sort: string,
  page: number,
) {
  const supabase = await createServerSupabaseClient()

  const organization = await getCurrentOrganization()

  if (!organization) {
    return {
      contacts: [] as Contact[],
      count: 0,
    }
  }

  const normalizedPage = normalizePage(page)
  const normalizedSearch = normalizeSearch(search)
  const sortField = normalizeSortField(sort)

  const offset =
    (normalizedPage - 1) * CONTACTS_PER_PAGE

  let query = supabase
    .from('contacts')
    .select(
      `
        id,
        organization_id,
        first_name,
        last_name,
        company,
        email,
        phone,
        title,
        status,
        metadata,
        owner_membership_id,
        owner:organization_members!contacts_owner_membership_id_fkey(
          user_id
        ),
        created_by,
        created_at,
        updated_at
      `,
      {
        count: 'exact',
      },
    )
    .eq(
      'organization_id',
      organization.organization_id,
    )

  if (normalizedSearch) {
    const searchPattern = `%${normalizedSearch}%`

    query = query.or(
      [
        `first_name.ilike.${searchPattern}`,
        `last_name.ilike.${searchPattern}`,
        `email.ilike.${searchPattern}`,
        `phone.ilike.${searchPattern}`,
        `company.ilike.${searchPattern}`,
        `title.ilike.${searchPattern}`,
      ].join(','),
    )
  }

  const ascending =
    sortField === 'first_name' ||
    sortField === 'last_name' ||
    sortField === 'company'

  const {
    data,
    count,
    error,
  } = await query
    .order(sortField, {
      ascending,
      nullsFirst: false,
    })
    .range(
      offset,
      offset + CONTACTS_PER_PAGE - 1,
    )

  if (error) {
    throw new Error(
      `Failed to load contacts: ${error.message}`,
    )
  }

  return {
    contacts: await hydrateContactOwnerNames(
      supabase,
      (data ?? []) as ContactRow[],
    ),
    count: count ?? 0,
  }
}

export async function getContactById(
  id: string,
): Promise<Contact | null> {
  const contactId = id.trim()

  if (!contactId) {
    return null
  }

  const supabase = await createServerSupabaseClient()

  const organization = await getCurrentOrganization()

  if (!organization) {
    return null
  }

  const { data, error } = await supabase
    .from('contacts')
    .select(`
      id,
      organization_id,
      first_name,
      last_name,
      company,
      email,
      phone,
      title,
      status,
      metadata,
      owner_membership_id,
      owner:organization_members!contacts_owner_membership_id_fkey(
        user_id
      ),
      created_by,
      created_at,
      updated_at
    `)
    .eq('id', contactId)
    .eq(
      'organization_id',
      organization.organization_id,
    )
    .maybeSingle()

  if (error) {
    throw new Error(
      `Failed to load contact: ${error.message}`,
    )
  }

  if (!data) {
    return null
  }

  const [contact] = await hydrateContactOwnerNames(
    supabase,
    [data as ContactRow],
  )

  return contact ?? null
}

export async function getContact(
  id: string,
): Promise<Contact | null> {
  return getContactById(id)
}

export async function getContactOwners(): Promise<ContactProfile[]> {
  const organization = await getCurrentOrganization()

  if (!organization) {
    return []
  }

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc(
    'get_current_organization_team_members',
  )

  if (error) {
    throw new Error(`Failed to load contact owners: ${error.message}`)
  }

  const rows = Array.isArray(data) ? data : []

  return rows.flatMap((row): ContactProfile[] => {
    if (!row || typeof row !== 'object') return []
    const value = row as Record<string, unknown>

    if (
      typeof value.id !== 'string' ||
      typeof value.user_id !== 'string'
    ) {
      return []
    }

    const fullName =
      typeof value.full_name === 'string'
        ? value.full_name.trim()
        : ''
    const email =
      typeof value.email === 'string' ? value.email : ''

    return [{
      id: value.id,
      user_id: value.user_id,
      full_name: fullName || email || 'Unnamed member',
    }]
  })
}

export async function createContact(
  values: ContactFormValues,
): Promise<void> {
  const {
    supabase,
    user,
    organization,
  } = await requireOrganization()

  const firstName = values.first_name.trim()
  const lastName = values.last_name.trim()
  const email = values.email.trim().toLowerCase()

  if (!firstName && !lastName) {
    throw new Error(
      'A first name or last name is required.',
    )
  }

  if (!email) {
    throw new Error('Email is required.')
  }

  const owner = await resolveOwnerAssignment(
    organization,
    values.owner_membership_id,
  )

  const payload = {
    organization_id: organization.organization_id,
    first_name: firstName,
    last_name: lastName,
    company: values.company.trim() || null,
    email,
    phone: values.phone.trim() || null,
    title: values.job_title.trim() || null,
    status: normalizeStatus(values.status),
    metadata: {
      mobile: values.mobile.trim() || null,
      tags: normalizeTags(values.tags),
      notes: values.notes.trim() || null,
      owner_id: owner.ownerUserId,
    },
    owner_membership_id: owner.ownerMembershipId,
    created_by: user.id,
  }

  const { error } = await supabase
    .from('contacts')
    .insert(payload)

  if (error) {
    throw new Error(
      `Failed to create contact: ${error.message}`,
    )
  }
}

export async function updateContact(
  id: string,
  values: ContactFormValues,
): Promise<void> {
  const contactId = id.trim()

  if (!contactId) {
    throw new Error('A valid contact ID is required.')
  }

  const {
    supabase,
    organization,
  } = await requireOrganization()

  const firstName = values.first_name.trim()
  const lastName = values.last_name.trim()
  const email = values.email.trim().toLowerCase()

  if (!firstName && !lastName) {
    throw new Error(
      'A first name or last name is required.',
    )
  }

  if (!email) {
    throw new Error('Email is required.')
  }

  const owner = await resolveOwnerAssignment(
    organization,
    values.owner_membership_id,
  )

  const payload = {
    first_name: firstName,
    last_name: lastName,
    company: values.company.trim() || null,
    email,
    phone: values.phone.trim() || null,
    title: values.job_title.trim() || null,
    status: normalizeStatus(values.status),
    metadata: {
      mobile: values.mobile.trim() || null,
      tags: normalizeTags(values.tags),
      notes: values.notes.trim() || null,
      owner_id: owner.ownerUserId,
    },
    owner_membership_id: owner.ownerMembershipId,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('contacts')
    .update(payload)
    .eq('id', contactId)
    .eq(
      'organization_id',
      organization.organization_id,
    )
    .select('id')
    .maybeSingle()

  if (error) {
    throw new Error(
      `Failed to update contact: ${error.message}`,
    )
  }

  if (!data) {
    throw new Error(
      'Contact not found or you do not have permission to update it.',
    )
  }
}

export async function deleteContact(
  id: string,
): Promise<void> {
  const contactId = id.trim()

  if (!contactId) {
    throw new Error('A valid contact ID is required.')
  }

  const {
    supabase,
    organization,
  } = await requireOrganization()

  const { data, error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', contactId)
    .eq(
      'organization_id',
      organization.organization_id,
    )
    .select('id')
    .maybeSingle()

  if (error) {
    throw new Error(
      `Failed to delete contact: ${error.message}`,
    )
  }

  if (!data) {
    throw new Error(
      'Contact not found or you do not have permission to delete it.',
    )
  }
}