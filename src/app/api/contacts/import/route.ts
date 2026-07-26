import { NextResponse } from 'next/server'

import { hasPermission } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

type ImportContact = {
  first_name?: unknown
  last_name?: unknown
  email?: unknown
  phone?: unknown
  company?: unknown
  title?: unknown
  status?: unknown
  tags?: unknown
  notes?: unknown
}

const MAX_IMPORT_ROWS = 5000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function clean(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.trim().slice(0, maxLength)
    : ''
}

function normalizeStatus(value: unknown): 'active' | 'inactive' | 'archived' {
  const status = clean(value, 20).toLowerCase()
  return status === 'inactive' || status === 'archived' ? status : 'active'
}

function normalizeTags(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(',') : clean(value, 1000)
  return raw
    .split(/[,;|]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 50)
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const organization = await getCurrentOrganization()
    if (!organization || !hasPermission(organization.role, 'contacts.create')) {
      return NextResponse.json({ error: 'You do not have permission to import contacts.' }, { status: 403 })
    }

    const body = (await request.json()) as { contacts?: unknown }
    if (!Array.isArray(body.contacts) || body.contacts.length === 0) {
      return NextResponse.json({ error: 'No contacts were provided.' }, { status: 400 })
    }

    if (body.contacts.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `A single import is limited to ${MAX_IMPORT_ROWS.toLocaleString('en-US')} rows.` },
        { status: 400 },
      )
    }

    const rows = body.contacts as ImportContact[]
    const invalid: Array<{ row: number; reason: string }> = []
    const normalized = rows.flatMap((row, index) => {
      const firstName = clean(row.first_name, 120)
      const lastName = clean(row.last_name, 120)
      const email = clean(row.email, 320).toLowerCase()
      const phone = clean(row.phone, 80)

      if (!firstName && !lastName) {
        invalid.push({ row: index + 2, reason: 'A first or last name is required.' })
        return []
      }

      if (!email || !EMAIL_PATTERN.test(email)) {
        invalid.push({ row: index + 2, reason: 'A valid email address is required.' })
        return []
      }

      return [{
        organization_id: organization.organization_id,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        company: clean(row.company, 200) || null,
        title: clean(row.title, 200) || null,
        status: normalizeStatus(row.status),
        metadata: {
          tags: normalizeTags(row.tags),
          notes: clean(row.notes, 5000),
          import_source: 'csv',
          imported_at: new Date().toISOString(),
        },
        created_by: authData.user.id,
      }]
    })

    const emails = [...new Set(normalized.map((row) => row.email))]
    const existingEmails = new Set<string>()

    for (let index = 0; index < emails.length; index += 500) {
      const batch = emails.slice(index, index + 500)
      const { data, error } = await supabase
        .from('contacts')
        .select('email')
        .eq('organization_id', organization.organization_id)
        .in('email', batch)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      for (const contact of data ?? []) {
        if (contact.email) existingEmails.add(contact.email.toLowerCase())
      }
    }

    const seen = new Set<string>()
    const duplicateRows: number[] = []
    const insertable = normalized.filter((row, index) => {
      const duplicate = existingEmails.has(row.email) || seen.has(row.email)
      seen.add(row.email)
      if (duplicate) duplicateRows.push(index + 2)
      return !duplicate
    })

    let imported = 0
    for (let index = 0; index < insertable.length; index += 500) {
      const batch = insertable.slice(index, index + 500)
      const { error } = await supabase.from('contacts').insert(batch)
      if (error) {
        return NextResponse.json({ error: error.message, imported }, { status: 500 })
      }
      imported += batch.length
    }

    return NextResponse.json({
      imported,
      duplicates: duplicateRows.length,
      invalid: invalid.length,
      errors: invalid.slice(0, 100),
      total: rows.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The CSV import failed.' },
      { status: 500 },
    )
  }
}
