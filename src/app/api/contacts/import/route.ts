import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import type { ContactLifecycleStage } from '@/types/contact'

type ImportContact = {
  first_name?: unknown
  last_name?: unknown
  preferred_name?: unknown
  email?: unknown
  phone_country_code?: unknown
  phone?: unknown
  mobile_country_code?: unknown
  mobile?: unknown
  company?: unknown
  title?: unknown
  status?: unknown
  lifecycle_stage?: unknown
  source?: unknown
  lead_score?: unknown
  timezone?: unknown
  locale?: unknown
  do_not_email?: unknown
  do_not_sms?: unknown
  do_not_call?: unknown
  next_follow_up_at?: unknown
  tags?: unknown
  notes?: unknown
  assigned_team_member_email?: unknown
  assigned_agent_email?: unknown
}

type TeamMemberAssignment = {
  membershipId: string
  userId: string
  fullName: string
}

const MAX_IMPORT_ROWS = 5000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const E164_PATTERN = /^\+[1-9]\d{7,14}$/

const LIFECYCLE_STAGES: readonly ContactLifecycleStage[] = [
  'lead',
  'marketing_qualified',
  'sales_qualified',
  'opportunity',
  'customer',
  'evangelist',
  'inactive',
]

function clean(
  value: unknown,
  maxLength: number,
): string {
  return typeof value === 'string'
    ? value.trim().slice(0, maxLength)
    : ''
}


type ScientificExpansion = {
  value: string
  exactForPhone: boolean
}

function expandScientificInteger(
  value: string,
): ScientificExpansion | null {
  const match = value
    .trim()
    .match(
      /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/,
    )

  if (!match) {
    return null
  }

  const sign =
    match[1] === '-' ? '-' : ''
  const whole = match[2]
  const fraction = match[3] ?? ''
  const exponent = Number.parseInt(
    match[4],
    10,
  )

  if (!Number.isFinite(exponent)) {
    return null
  }

  const digits =
    `${whole}${fraction}`.replace(
      /^0+(?=\d)/,
      '',
    )
  const decimalIndex =
    whole.length + exponent

  if (decimalIndex <= 0) {
    return {
      value: `${sign}0.${'0'.repeat(
        Math.abs(decimalIndex),
      )}${digits}`,
      exactForPhone: false,
    }
  }

  if (decimalIndex > digits.length) {
    return {
      value: `${sign}${digits}${'0'.repeat(
        decimalIndex - digits.length,
      )}`,
      exactForPhone: false,
    }
  }

  if (decimalIndex === digits.length) {
    return {
      value: `${sign}${digits}`,
      exactForPhone: true,
    }
  }

  return {
    value: `${sign}${digits.slice(
      0,
      decimalIndex,
    )}.${digits.slice(decimalIndex)}`,
    exactForPhone: false,
  }
}

function normalizeImportedPhone(
  value: unknown,
): string {
  let phone = clean(value, 120)

  const excelFormulaMatch = phone.match(
    /^=\s*"?(\+\d{8,15})"?$/,
  )
  if (excelFormulaMatch) {
    phone = excelFormulaMatch[1]
  }

  phone = phone
    .replace(/^'+/, '')
    .trim()

  const expanded =
    expandScientificInteger(phone)

  if (expanded) {
    if (!expanded.exactForPhone) {
      return `INVALID_SCIENTIFIC:${phone}`
    }

    phone = expanded.value
  }

  phone = phone.replace(
    /[\s().-]/g,
    '',
  )

  if (/^\d{8,15}$/.test(phone)) {
    phone = `+${phone}`
  }

  return phone
}


function combineCountryCodeAndPhone(
  countryCodeValue: unknown,
  phoneValue: unknown,
): string {
  const rawPhone = clean(phoneValue, 120)

  if (!rawPhone) {
    return ''
  }

  if (rawPhone.startsWith('+')) {
    return normalizeImportedPhone(rawPhone)
  }

  const countryCode = clean(
    countryCodeValue,
    20,
  )
    .replace(/[\s().-]/g, '')
    .replace(/^00/, '+')

  if (!countryCode) {
    return normalizeImportedPhone(rawPhone)
  }

  const normalizedCountryCode =
    countryCode.startsWith('+')
      ? countryCode
      : `+${countryCode.replace(/^\+/, '')}`

  const localDigits = rawPhone
    .replace(/^'+/, '')
    .replace(/[\s().-]/g, '')
    .replace(/^0+/, '')

  if (
    !/^\+\d{1,4}$/.test(
      normalizedCountryCode,
    ) ||
    !/^\d{6,14}$/.test(localDigits)
  ) {
    return normalizeImportedPhone(rawPhone)
  }

  return `${normalizedCountryCode}${localDigits}`
}

function normalizeStatus(
  value: unknown,
): 'active' | 'inactive' | 'archived' {
  const status = clean(
    value,
    20,
  ).toLowerCase()

  return status === 'inactive' ||
    status === 'archived'
    ? status
    : 'active'
}

function normalizeLifecycleStage(
  value: unknown,
): ContactLifecycleStage {
  const stage = clean(
    value,
    40,
  ).toLowerCase() as ContactLifecycleStage

  return LIFECYCLE_STAGES.includes(stage)
    ? stage
    : 'lead'
}

function normalizeTags(
  value: unknown,
): string[] {
  const raw = Array.isArray(value)
    ? value.join(',')
    : clean(value, 1000)

  return Array.from(
    new Set(
      raw
        .split(/[,;|]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ).slice(0, 50)
}

function normalizeBoolean(
  value: unknown,
): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  const normalized = clean(
    value,
    20,
  ).toLowerCase()

  return [
    'true',
    '1',
    'yes',
    'y',
    'on',
  ].includes(normalized)
}

function normalizeLeadScore(
  value: unknown,
): number {
  const parsed = Number.parseInt(
    clean(value, 10),
    10,
  )

  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.min(
    100,
    Math.max(0, parsed),
  )
}

function normalizeFollowUp(
  value: unknown,
): string | null | 'invalid' {
  const raw = clean(value, 80)

  if (!raw) {
    return null
  }

  const date = new Date(raw)

  return Number.isNaN(date.getTime())
    ? 'invalid'
    : date.toISOString()
}

function isOwnerOrAdmin(
  role: string,
): boolean {
  return role === 'owner' || role === 'admin'
}

export async function POST(
  request: Request,
) {
  try {
    const supabase = await createClient()
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      return NextResponse.json(
        {
          error: 'Authentication required.',
        },
        {
          status: 401,
        },
      )
    }

    const organization =
      await getCurrentOrganization()

    if (
      !organization ||
      !isOwnerOrAdmin(organization.role)
    ) {
      return NextResponse.json(
        {
          error:
            'Only organization owners and admins can import contacts from CSV.',
        },
        {
          status: 403,
        },
      )
    }

    const body =
      (await request.json()) as {
        contacts?: unknown
      }

    if (
      !Array.isArray(body.contacts) ||
      body.contacts.length === 0
    ) {
      return NextResponse.json(
        {
          error: 'No contacts were provided.',
        },
        {
          status: 400,
        },
      )
    }

    if (
      body.contacts.length >
      MAX_IMPORT_ROWS
    ) {
      return NextResponse.json(
        {
          error: `A single import is limited to ${MAX_IMPORT_ROWS.toLocaleString('en-US')} rows.`,
        },
        {
          status: 400,
        },
      )
    }

    const {
      data: teamData,
      error: teamError,
    } = await supabase.rpc(
      'get_current_organization_team_members',
    )

    if (teamError) {
      return NextResponse.json(
        {
          error: `Unable to resolve team-member assignments: ${teamError.message}`,
        },
        {
          status: 500,
        },
      )
    }

    const teamMembersByEmail =
      new Map<string, TeamMemberAssignment>()

    for (
      const teamMember of
      Array.isArray(teamData)
        ? teamData
        : []
    ) {
      if (
        !teamMember ||
        typeof teamMember !== 'object'
      ) {
        continue
      }

      const row =
        teamMember as Record<
          string,
          unknown
        >

      if (
        typeof row.id !== 'string' ||
        typeof row.user_id !== 'string' ||
        typeof row.email !== 'string'
      ) {
        continue
      }

      const email =
        row.email
          .trim()
          .toLowerCase()

      if (!email) {
        continue
      }

      const fullName =
        typeof row.full_name === 'string'
          ? row.full_name.trim()
          : ''

      teamMembersByEmail.set(
        email,
        {
          membershipId: row.id,
          userId: row.user_id,
          fullName:
            fullName ||
            row.email.trim(),
        },
      )
    }

    const rows =
      body.contacts as ImportContact[]
    const invalid: Array<{
      row: number
      reason: string
    }> = []

    const normalized = rows.flatMap(
      (row, index) => {
        const sourceRow = index + 2

        if (
          !row ||
          typeof row !== 'object'
        ) {
          invalid.push({
            row: sourceRow,
            reason:
              'The row is not a valid contact record.',
          })
          return []
        }

        const firstName = clean(
          row.first_name,
          120,
        )
        const lastName = clean(
          row.last_name,
          120,
        )
        const email = clean(
          row.email,
          320,
        ).toLowerCase()
        const phone =
          combineCountryCodeAndPhone(
            row.phone_country_code,
            row.phone,
          )
        const assignedTeamMemberEmail =
          clean(
            row.assigned_team_member_email ??
              row.assigned_agent_email,
            320,
          ).toLowerCase()

        if (
          !firstName &&
          !lastName
        ) {
          invalid.push({
            row: sourceRow,
            reason:
              'A first or last name is required.',
          })
          return []
        }

        if (
          !email ||
          !EMAIL_PATTERN.test(email)
        ) {
          invalid.push({
            row: sourceRow,
            reason:
              'A valid email address is required.',
          })
          return []
        }

        if (phone.startsWith('INVALID_SCIENTIFIC:')) {
          invalid.push({
            row: sourceRow,
            reason:
              'The spreadsheet rounded this phone number in scientific notation, so the original digits cannot be recovered safely. Use the sample CSV country-code and phone columns and enter the phone normally.',
          })
          return []
        }

        if (
          !phone ||
          !E164_PATTERN.test(phone)
        ) {
          invalid.push({
            row: sourceRow,
            reason:
              'A valid phone number is required. Use the sample CSV with Country Code (for example +63) and Phone (for example 9171234567), or provide a full E.164 number such as +639171234567.',
          })
          return []
        }

        if (
          !assignedTeamMemberEmail ||
          !EMAIL_PATTERN.test(
            assignedTeamMemberEmail,
          )
        ) {
          invalid.push({
            row: sourceRow,
            reason:
              'Assigned Team Member Email is required.',
          })
          return []
        }

        const teamMember =
          teamMembersByEmail.get(
            assignedTeamMemberEmail,
          )

        if (!teamMember) {
          invalid.push({
            row: sourceRow,
            reason:
              'Assigned Team Member Email does not match a current member of this organization.',
          })
          return []
        }

        const followUp =
          normalizeFollowUp(
            row.next_follow_up_at,
          )

        if (
          followUp === 'invalid'
        ) {
          invalid.push({
            row: sourceRow,
            reason:
              'Next Follow Up At must be a valid date/time.',
          })
          return []
        }

        return [
          {
            sourceRow,
            payload: {
              organization_id:
                organization.organization_id,
              first_name: firstName,
              last_name: lastName,
              preferred_name:
                clean(
                  row.preferred_name,
                  120,
                ) || null,
              email,
              phone,
              company:
                clean(
                  row.company,
                  200,
                ) || null,
              title:
                clean(
                  row.title,
                  200,
                ) || null,
              status:
                normalizeStatus(
                  row.status,
                ),
              lifecycle_stage:
                normalizeLifecycleStage(
                  row.lifecycle_stage,
                ),
              source:
                clean(
                  row.source,
                  120,
                ) || 'csv',
              lead_score:
                normalizeLeadScore(
                  row.lead_score,
                ),
              timezone:
                clean(
                  row.timezone,
                  120,
                ) || null,
              locale:
                clean(
                  row.locale,
                  50,
                ) || null,
              do_not_email:
                normalizeBoolean(
                  row.do_not_email,
                ),
              do_not_sms:
                normalizeBoolean(
                  row.do_not_sms,
                ),
              do_not_call:
                normalizeBoolean(
                  row.do_not_call,
                ),
              next_follow_up_at:
                followUp,
              owner_membership_id:
                teamMember.membershipId,
              metadata: {
                mobile:
                  combineCountryCodeAndPhone(
                    row.mobile_country_code,
                    row.mobile,
                  ) || null,
                tags:
                  normalizeTags(
                    row.tags,
                  ),
                notes:
                  clean(
                    row.notes,
                    5000,
                  ),
                owner_id:
                  teamMember.userId,
                owner_name:
                  teamMember.fullName,
                import_source: 'csv',
                imported_at:
                  new Date().toISOString(),
              },
              created_by:
                authData.user.id,
            },
          },
        ]
      },
    )

    const emails = [
      ...new Set(
        normalized.map(
          (item) =>
            item.payload.email,
        ),
      ),
    ]

    const existingEmails =
      new Set<string>()

    for (
      let index = 0;
      index < emails.length;
      index += 500
    ) {
      const batch =
        emails.slice(
          index,
          index + 500,
        )

      const {
        data,
        error,
      } = await supabase
        .from('contacts')
        .select('email')
        .eq(
          'organization_id',
          organization.organization_id,
        )
        .in(
          'email',
          batch,
        )

      if (error) {
        return NextResponse.json(
          {
            error: error.message,
          },
          {
            status: 500,
          },
        )
      }

      for (
        const contact of
        data ?? []
      ) {
        if (contact.email) {
          existingEmails.add(
            contact.email.toLowerCase(),
          )
        }
      }
    }

    const seen =
      new Set<string>()
    const duplicateRows: number[] = []

    const insertable =
      normalized.filter((item) => {
        const email =
          item.payload.email
        const duplicate =
          existingEmails.has(email) ||
          seen.has(email)

        seen.add(email)

        if (duplicate) {
          duplicateRows.push(
            item.sourceRow,
          )
        }

        return !duplicate
      })

    let imported = 0

    for (
      let index = 0;
      index < insertable.length;
      index += 500
    ) {
      const batch =
        insertable
          .slice(
            index,
            index + 500,
          )
          .map(
            (item) =>
              item.payload,
          )

      const { error } =
        await supabase
          .from('contacts')
          .insert(batch)

      if (error) {
        return NextResponse.json(
          {
            error: error.message,
            imported,
          },
          {
            status: 500,
          },
        )
      }

      imported += batch.length
    }

    return NextResponse.json({
      imported,
      duplicates:
        duplicateRows.length,
      invalid:
        invalid.length,
      errors:
        invalid.slice(0, 100),
      total:
        rows.length,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'The CSV import failed.',
      },
      {
        status: 500,
      },
    )
  }
}
