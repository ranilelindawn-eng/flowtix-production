import { NextRequest, NextResponse } from 'next/server'

import { hasPermission } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

type SearchResult = {
  id: string
  type:
    | 'contact'
    | 'company'
    | 'opportunity'
    | 'call'
    | 'campaign'
    | 'task'
    | 'activity'
    | 'module'
  title: string
  subtitle: string
  href: string
  group: string
}

const MAX_RESULTS_PER_GROUP = 5

function normalizeQuery(value: string | null): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').slice(0, 100)
}

function postgrestSearchValue(value: string): string {
  return value
    .replace(/[,%()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fullName(
  firstName: string | null,
  lastName: string | null,
): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim()
}

function nonEmpty(...values: Array<string | null | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? ''
}

const MODULES: Array<{
  title: string
  keywords: string
  subtitle: string
  href: string
  permission:
    | 'contacts.view'
    | 'companies.view'
    | 'opportunities.view'
    | 'calls.view'
    | 'campaigns.view'
    | 'tasks.view'
}> = [
  {
    title: 'Contacts',
    keywords: 'contacts people leads customers crm',
    subtitle: 'Open the Contacts workspace',
    href: '/dashboard/contacts',
    permission: 'contacts.view',
  },
  {
    title: 'Companies',
    keywords: 'companies accounts organizations businesses',
    subtitle: 'Open the Companies workspace',
    href: '/dashboard/companies',
    permission: 'companies.view',
  },
  {
    title: 'Pipelines',
    keywords: 'pipelines deals opportunities revenue',
    subtitle: 'Open Pipelines and opportunities',
    href: '/dashboard/pipelines',
    permission: 'opportunities.view',
  },
  {
    title: 'Calls',
    keywords: 'calls phone dialer call history',
    subtitle: 'Open call history',
    href: '/dashboard/calls',
    permission: 'calls.view',
  },
  {
    title: 'Campaigns',
    keywords: 'campaigns outreach sequences calling',
    subtitle: 'Open campaigns',
    href: '/dashboard/campaigns',
    permission: 'campaigns.view',
  },
  {
    title: 'Email & SMS',
    keywords: 'email emails sms message messages communication communications inbox',
    subtitle: 'Open Email & SMS',
    href: '/dashboard/communications',
    permission: 'campaigns.view',
  },
  {
    title: 'Tasks',
    keywords: 'tasks follow up reminders work',
    subtitle: 'Open tasks',
    href: '/dashboard/tasks',
    permission: 'tasks.view',
  },
]

export async function GET(request: NextRequest) {
  const membership = await getCurrentOrganization()

  if (!membership) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
      },
      {
        status: 401,
      },
    )
  }

  const query = normalizeQuery(request.nextUrl.searchParams.get('q'))

  if (query.length < 2) {
    return NextResponse.json({
      results: [],
    })
  }

  const safeQuery = postgrestSearchValue(query)

  if (safeQuery.length < 2) {
    return NextResponse.json({
      results: [],
    })
  }

  const supabase = await createClient()
  const organizationId = membership.organization_id
  const role = membership.role

  const searches: Array<Promise<SearchResult[]>> = []

  if (hasPermission(role, 'contacts.view')) {
    searches.push(
      (async () => {
        const { data, error } = await supabase
          .from('contacts')
          .select(
            'id,first_name,last_name,email,phone,company,status',
          )
          .eq('organization_id', organizationId)
          .is('merged_into_contact_id', null)
          .or(
            `first_name.ilike.%${safeQuery}%,last_name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%,phone.ilike.%${safeQuery}%,company.ilike.%${safeQuery}%`,
          )
          .order('updated_at', {
            ascending: false,
          })
          .limit(MAX_RESULTS_PER_GROUP)

        if (error) {
          throw new Error(`Contact search failed: ${error.message}`)
        }

        return (data ?? []).map((contact): SearchResult => {
          const name =
            fullName(contact.first_name, contact.last_name) ||
            nonEmpty(contact.email, contact.phone) ||
            'Unnamed contact'

          const details = [
            nonEmpty(contact.email, contact.phone),
            contact.company,
            contact.status,
          ].filter(Boolean)

          return {
            id: contact.id,
            type: 'contact',
            title: name,
            subtitle: details.join(' · ') || 'Contact',
            href: `/dashboard/contacts/${contact.id}`,
            group: 'Contacts',
          }
        })
      })(),
    )
  }

  if (hasPermission(role, 'companies.view')) {
    searches.push(
      (async () => {
        const { data, error } = await supabase
          .from('companies')
          .select('id,name,domain,industry,email,phone,status')
          .eq('organization_id', organizationId)
          .or(
            `name.ilike.%${safeQuery}%,domain.ilike.%${safeQuery}%,industry.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%,phone.ilike.%${safeQuery}%`,
          )
          .order('updated_at', {
            ascending: false,
          })
          .limit(MAX_RESULTS_PER_GROUP)

        if (error) {
          throw new Error(`Company search failed: ${error.message}`)
        }

        return (data ?? []).map((company): SearchResult => ({
          id: company.id,
          type: 'company',
          title: company.name,
          subtitle:
            [company.domain, company.industry, company.status]
              .filter(Boolean)
              .join(' · ') || 'Company',
          href: `/dashboard/companies/${company.id}`,
          group: 'Companies',
        }))
      })(),
    )
  }

  if (hasPermission(role, 'opportunities.view')) {
    searches.push(
      (async () => {
        const { data, error } = await supabase
          .from('opportunities')
          .select(
            'id,pipeline_id,name,status,value,currency,forecast_category,next_step',
          )
          .eq('organization_id', organizationId)
          .or(
            `name.ilike.%${safeQuery}%,next_step.ilike.%${safeQuery}%`,
          )
          .order('updated_at', {
            ascending: false,
          })
          .limit(MAX_RESULTS_PER_GROUP)

        if (error) {
          throw new Error(
            `Opportunity search failed: ${error.message}`,
          )
        }

        return (data ?? []).map((opportunity): SearchResult => {
          const value =
            opportunity.value != null
              ? `${opportunity.currency ?? ''} ${Number(
                  opportunity.value,
                ).toLocaleString('en-US')}`.trim()
              : ''

          return {
            id: opportunity.id,
            type: 'opportunity',
            title: opportunity.name,
            subtitle:
              [opportunity.status, value].filter(Boolean).join(' · ') ||
              'Opportunity',
            href: `/dashboard/pipelines/${opportunity.pipeline_id}/opportunities/${opportunity.id}/edit`,
            group: 'Deals / Opportunities',
          }
        })
      })(),
    )
  }

  if (hasPermission(role, 'calls.view')) {
    searches.push(
      (async () => {
        const { data, error } = await supabase
          .from('calls')
          .select(
            'id,contact_id,direction,status,started_at,duration_seconds,metadata',
          )
          .eq('organization_id', organizationId)
          .order('started_at', {
            ascending: false,
          })
          .limit(100)

        if (error) {
          throw new Error(`Call search failed: ${error.message}`)
        }

        const normalizedSearch = safeQuery.toLowerCase()
        const matchingCalls = (data ?? [])
          .filter((call) => {
            const metadata =
              call.metadata &&
              typeof call.metadata === 'object' &&
              !Array.isArray(call.metadata)
                ? (call.metadata as Record<string, unknown>)
                : {}

            const searchable = [
              call.id,
              call.status,
              call.direction,
              typeof metadata.phone_number === 'string'
                ? metadata.phone_number
                : '',
              typeof metadata.from === 'string' ? metadata.from : '',
              typeof metadata.to === 'string' ? metadata.to : '',
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()

            return searchable.includes(normalizedSearch)
          })
          .slice(0, MAX_RESULTS_PER_GROUP)

        return matchingCalls.map((call): SearchResult => {
          const metadata =
            call.metadata &&
            typeof call.metadata === 'object' &&
            !Array.isArray(call.metadata)
              ? (call.metadata as Record<string, unknown>)
              : {}

          const phone =
            typeof metadata.phone_number === 'string'
              ? metadata.phone_number
              : ''

          return {
            id: call.id,
            type: 'call',
            title: phone || `${call.direction} call`,
            subtitle:
              [call.status, call.direction]
                .filter(Boolean)
                .join(' · ') || 'Call',
            href: `/dashboard/calls/${call.id}`,
            group: 'Calls',
          }
        })
      })(),
    )
  }

  if (hasPermission(role, 'campaigns.view')) {
    searches.push(
      (async () => {
        const { data, error } = await supabase
          .from('campaigns')
          .select('id,name,description,status')
          .eq('organization_id', organizationId)
          .or(
            `name.ilike.%${safeQuery}%,description.ilike.%${safeQuery}%`,
          )
          .order('updated_at', {
            ascending: false,
          })
          .limit(MAX_RESULTS_PER_GROUP)

        if (error) {
          throw new Error(`Campaign search failed: ${error.message}`)
        }

        return (data ?? []).map((campaign): SearchResult => ({
          id: campaign.id,
          type: 'campaign',
          title: campaign.name,
          subtitle:
            [campaign.status, campaign.description]
              .filter(Boolean)
              .join(' · ') || 'Campaign',
          href: `/dashboard/campaigns/${campaign.id}`,
          group: 'Campaigns',
        }))
      })(),
    )
  }

  if (hasPermission(role, 'tasks.view')) {
    searches.push(
      (async () => {
        const { data, error } = await supabase
          .from('contact_tasks')
          .select('id,title,description,status,priority,task_type')
          .eq('organization_id', organizationId)
          .or(
            `title.ilike.%${safeQuery}%,description.ilike.%${safeQuery}%`,
          )
          .order('updated_at', {
            ascending: false,
          })
          .limit(MAX_RESULTS_PER_GROUP)

        if (error) {
          throw new Error(`Task search failed: ${error.message}`)
        }

        return (data ?? []).map((task): SearchResult => ({
          id: task.id,
          type: 'task',
          title: task.title,
          subtitle:
            [task.status, task.priority, task.task_type]
              .filter(Boolean)
              .join(' · ') || 'Task',
          href: `/dashboard/tasks?search=${encodeURIComponent(
            task.title,
          )}`,
          group: 'Tasks',
        }))
      })(),
    )
  }

  if (hasPermission(role, 'contacts.view')) {
    searches.push(
      (async () => {
        const { data, error } = await supabase
          .from('crm_activities')
          .select(
            'id,subject,body,activity_type,status,occurred_at',
          )
          .eq('organization_id', organizationId)
          .or(
            `subject.ilike.%${safeQuery}%,body.ilike.%${safeQuery}%`,
          )
          .order('occurred_at', {
            ascending: false,
          })
          .limit(MAX_RESULTS_PER_GROUP)

        if (error) {
          throw new Error(`Activity search failed: ${error.message}`)
        }

        return (data ?? []).map((activity): SearchResult => ({
          id: activity.id,
          type: 'activity',
          title: activity.subject || 'Activity',
          subtitle:
            [activity.activity_type, activity.status]
              .filter(Boolean)
              .join(' · ') || 'Activity',
          href: `/dashboard/activities?q=${encodeURIComponent(
            activity.subject || query,
          )}`,
          group: 'Activities',
        }))
      })(),
    )
  }

  const moduleResults: SearchResult[] = MODULES.filter(
    (module) =>
      hasPermission(role, module.permission) &&
      `${module.title} ${module.keywords}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )
    .slice(0, 4)
    .map((module) => ({
      id: module.href,
      type: 'module',
      title: module.title,
      subtitle: module.subtitle,
      href: module.href,
      group: 'Flowtix',
    }))

  const settledSearches = await Promise.allSettled(searches)
  const groupedResults: SearchResult[][] = []

  for (const result of settledSearches) {
    if (result.status === 'fulfilled') {
      groupedResults.push(result.value)
      continue
    }

    console.error('Global search source failed:', result.reason)
  }

  return NextResponse.json({
    results: [...moduleResults, ...groupedResults.flat()].slice(
      0,
      30,
    ),
  })
}
