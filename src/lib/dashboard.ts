import {
  createClient as createServerSupabaseClient,
} from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import {
  normalizeTimeZone,
  organizationLocalDateTimeToUtc,
} from '@/lib/timezone'

type SupabaseServerClient = Awaited<
  ReturnType<typeof createServerSupabaseClient>
>

type ProfileRow = {
  full_name: string | null
  organization_id: string | null
}

type OrganizationRow = {
  id: string
  name: string
}

type RecentContact = {
  id: string
  first_name: string | null
  last_name: string | null
  company: string | null
  status: string
  created_at: string
}

type ContactName = {
  id: string
  first_name: string | null
  last_name: string | null
}

type DashboardTaskRow = {
  id: string
  contact_id: string
  title: string
  description: string | null
  due_at: string
  status: 'pending' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high'
}

type DashboardCallRow = {
  id: string
  contact_id: string | null
  direction: string
  status: string
  duration_seconds: number | null
  started_at: string
  ended_at: string | null
  created_at: string
}

type DashboardOpportunityRow = {
  id: string
  status: string
  value: number | string | null
  currency: string | null
  won_at: string | null
  closed_at: string | null
  updated_at: string
}

export type DashboardSalesTrendPoint = {
  label: string
  currentRevenue: number
  previousRevenue: number
}

export type RecentCallWithContact = {
  id: string
  contactName: string
  durationSeconds: number | null
  direction: string
  status: string
  started_at: string
}

export type CallsOverTimePoint = {
  date: string
  label: string
  calls: number
}

export type CallOutcomePoint = {
  status: string
  count: number
}

export type DashboardActivity = {
  id: string
  title: string
  description: string
  createdAt: string
  type: 'contact' | 'call'
}

export type DashboardFollowUp = {
  id: string
  contactId: string
  contactName: string
  title: string
  description: string | null
  dueAt: string
  priority: 'low' | 'medium' | 'high'
}

export type DashboardData = {
  organizationId: string
  userName: string
  organizationName: string
  currencyCode: string

  totalContacts: number
  openDeals: number
  wonDeals: number
  pipelineValue: number
  wonRevenue: number
  emailsToday: number
  meetingsToday: number
  tasksCompletedToday: number
  totalCalls: number
  callsToday: number
  connectedCalls: number
  connectedRate: number
  activeCampaigns: number
  totalCallMinutes: number
  averageCallDurationSeconds: number
  overdueTasksCount: number
  todayTasksCount: number
  upcomingTasksCount: number

  recentContacts: RecentContact[]
  recentCalls: RecentCallWithContact[]
  callsOverTime: CallsOverTimePoint[]
  callOutcomes: CallOutcomePoint[]
  recentActivity: DashboardActivity[]
  salesTrend: DashboardSalesTrendPoint[]
  overdueFollowUps: DashboardFollowUp[]
  todayFollowUps: DashboardFollowUp[]
  upcomingFollowUps: DashboardFollowUp[]

  error?: string
}

function createEmptyDashboardData(
  error?: string,
): DashboardData {
  return {
    organizationId: '',
    userName: 'there',
    organizationName: 'Flowtix workspace',
    currencyCode: 'USD',

    totalContacts: 0,
    openDeals: 0,
    wonDeals: 0,
    pipelineValue: 0,
    wonRevenue: 0,
    emailsToday: 0,
    meetingsToday: 0,
    tasksCompletedToday: 0,
    totalCalls: 0,
    callsToday: 0,
    connectedCalls: 0,
    connectedRate: 0,
    activeCampaigns: 0,
    totalCallMinutes: 0,
    averageCallDurationSeconds: 0,
    overdueTasksCount: 0,
    todayTasksCount: 0,
    upcomingTasksCount: 0,

    recentContacts: [],
    recentCalls: [],
    callsOverTime: createEmptyCallsOverTime('UTC'),
    callOutcomes: [],
    recentActivity: [],
    salesTrend: createEmptySalesTrend('UTC'),
    overdueFollowUps: [],
    todayFollowUps: [],
    upcomingFollowUps: [],

    ...(error ? { error } : {}),
  }
}

async function getAuthenticatedUserId(
  supabase: SupabaseServerClient,
): Promise<string> {
  const { data, error } = await supabase.auth.getClaims()

  if (error) {
    console.error(
      'Unable to read authenticated claims:',
      error,
    )

    throw new Error(
      'Unable to verify the authenticated user.',
    )
  }

  const userId = data?.claims?.sub

  if (
    typeof userId !== 'string' ||
    userId.length === 0
  ) {
    throw new Error(
      'No authenticated user was found.',
    )
  }

  return userId
}

async function getProfile(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, organization_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error(
      'Unable to load the current profile:',
      error,
    )

    throw new Error(
      'Unable to load the current profile.',
    )
  }

  return data as ProfileRow | null
}

async function getCurrentOrganizationId(
  userId: string,
): Promise<string> {
  const membership = await getCurrentOrganization()

  if (
    membership?.user_id === userId &&
    membership.organization_id
  ) {
    return membership.organization_id
  }

  throw new Error(
    'Unable to determine the current organization.',
  )
}

async function getOrganizationName(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', organizationId)
    .maybeSingle()

  if (error) {
    console.error(
      'Unable to load organization:',
      error,
    )

    throw new Error(
      'Unable to load the current organization.',
    )
  }

  const organization = data as OrganizationRow | null

  return (
    organization?.name?.trim() ||
    'Flowtix workspace'
  )
}

function getDatePartsInTimeZone(
  value: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: normalizeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)

  const values = new Map(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
  }
}

function formatDateKey(
  year: number,
  month: number,
  day: number,
): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function getDateKeyInTimeZone(
  value: Date,
  timeZone: string,
): string {
  const parts = getDatePartsInTimeZone(value, timeZone)
  return formatDateKey(parts.year, parts.month, parts.day)
}

function addDaysToDateKey(
  dateKey: string,
  days: number,
): string {
  const [year, month, day] = dateKey
    .split('-')
    .map(Number)
  const value = new Date(Date.UTC(year, month - 1, day))
  value.setUTCDate(value.getUTCDate() + days)
  return formatDateKey(
    value.getUTCFullYear(),
    value.getUTCMonth() + 1,
    value.getUTCDate(),
  )
}

function getTodayDateKey(timeZone: string): string {
  return getDateKeyInTimeZone(new Date(), timeZone)
}

function getStartOfLocalDateIso(
  dateKey: string,
  timeZone: string,
): string {
  return (
    organizationLocalDateTimeToUtc(
      `${dateKey}T00:00`,
      timeZone,
    ) ?? new Date(`${dateKey}T00:00:00.000Z`).toISOString()
  )
}

function createEmptyCallsOverTime(
  timeZone: string,
): CallsOverTimePoint[] {
  const todayKey = getTodayDateKey(timeZone)
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: 'UTC',
    weekday: 'short',
  })

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDaysToDateKey(
      todayKey,
      -(6 - index),
    )
    const labelDate = new Date(`${date}T12:00:00.000Z`)

    return {
      date,
      label: formatter.format(labelDate),
      calls: 0,
    }
  })
}

function createCallsOverTime(
  calls: DashboardCallRow[],
  timeZone: string,
): CallsOverTimePoint[] {
  const points = createEmptyCallsOverTime(timeZone)
  const pointMap = new Map(
    points.map((point) => [point.date, point]),
  )

  for (const call of calls) {
    const startedAt = new Date(call.started_at)

    if (Number.isNaN(startedAt.getTime())) {
      continue
    }

    const key = getDateKeyInTimeZone(startedAt, timeZone)
    const point = pointMap.get(key)

    if (point) {
      point.calls += 1
    }
  }

  return points
}

function createEmptySalesTrend(
  timeZone: string,
): DashboardSalesTrendPoint[] {
  const todayKey = getTodayDateKey(timeZone)
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: 'UTC',
    weekday: 'short',
  })

  return Array.from({ length: 7 }, (_, index) => {
    const currentDateKey = addDaysToDateKey(todayKey, -(6 - index))
    const labelDate = new Date(`${currentDateKey}T12:00:00.000Z`)

    return {
      label: formatter.format(labelDate),
      currentRevenue: 0,
      previousRevenue: 0,
    }
  })
}

function getOpportunityValue(value: DashboardOpportunityRow['value']): number {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

function createSalesTrend(
  opportunities: DashboardOpportunityRow[],
  timeZone: string,
): DashboardSalesTrendPoint[] {
  const normalizedTimeZone = normalizeTimeZone(timeZone)
  const todayKey = getTodayDateKey(normalizedTimeZone)
  const points = createEmptySalesTrend(normalizedTimeZone)
  const currentDateKeys = points.map((_, index) =>
    addDaysToDateKey(todayKey, -(6 - index)),
  )
  const previousDateKeys = points.map((_, index) =>
    addDaysToDateKey(todayKey, -(13 - index)),
  )
  const currentIndexByDate = new Map(
    currentDateKeys.map((dateKey, index) => [dateKey, index]),
  )
  const previousIndexByDate = new Map(
    previousDateKeys.map((dateKey, index) => [dateKey, index]),
  )

  for (const opportunity of opportunities) {
    if (opportunity.status.trim().toLowerCase() !== 'won') continue

    const closedAtValue =
      opportunity.won_at || opportunity.closed_at || opportunity.updated_at
    const closedAt = new Date(closedAtValue)
    if (Number.isNaN(closedAt.getTime())) continue

    const dateKey = getDateKeyInTimeZone(closedAt, normalizedTimeZone)
    const value = getOpportunityValue(opportunity.value)
    const currentIndex = currentIndexByDate.get(dateKey)
    if (currentIndex !== undefined) {
      points[currentIndex].currentRevenue += value
      continue
    }

    const previousIndex = previousIndexByDate.get(dateKey)
    if (previousIndex !== undefined) {
      points[previousIndex].previousRevenue += value
    }
  }

  return points
}

function createCallOutcomes(
  calls: DashboardCallRow[],
): CallOutcomePoint[] {
  const counts = new Map<string, number>()

  for (const call of calls) {
    const status =
      call.status.trim().toLowerCase() || 'unknown'

    counts.set(status, (counts.get(status) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([status, count]) => ({
      status,
      count,
    }))
    .sort((first, second) => second.count - first.count)
}

const connectedCallStatuses = new Set([
  'answered',
  'completed',
  'connected',
  'in-progress',
  'in_progress',
  'bridged',
])

const failedCallStatuses = new Set([
  'failed',
  'busy',
  'no-answer',
  'no_answer',
  'cancelled',
  'canceled',
  'missed',
])

function getCallDurationSeconds(
  call: DashboardCallRow,
): number {
  if (
    typeof call.duration_seconds === 'number' &&
    Number.isFinite(call.duration_seconds) &&
    call.duration_seconds > 0
  ) {
    return call.duration_seconds
  }

  if (!call.ended_at) {
    return 0
  }

  const startedAt = new Date(call.started_at)
  const endedAt = new Date(call.ended_at)

  if (
    Number.isNaN(startedAt.getTime()) ||
    Number.isNaN(endedAt.getTime())
  ) {
    return 0
  }

  return Math.max(
    0,
    Math.round(
      (endedAt.getTime() - startedAt.getTime()) / 1000,
    ),
  )
}

function isConnectedCall(
  call: DashboardCallRow,
): boolean {
  const status = call.status.trim().toLowerCase()

  if (connectedCallStatuses.has(status)) {
    return true
  }

  return (
    getCallDurationSeconds(call) > 0 &&
    !failedCallStatuses.has(status)
  )
}

function calculateTotalDurationSeconds(
  calls: DashboardCallRow[],
): number {
  return calls.reduce(
    (total, call) =>
      total +
      (isConnectedCall(call)
        ? getCallDurationSeconds(call)
        : 0),
    0,
  )
}

function calculateAverageDurationSeconds(
  calls: DashboardCallRow[],
): number {
  const connectedCalls = calls.filter(isConnectedCall)

  if (connectedCalls.length === 0) {
    return 0
  }

  return Math.round(
    calculateTotalDurationSeconds(connectedCalls) /
      connectedCalls.length,
  )
}

function createContactName(
  contact: ContactName,
): string {
  const fullName = [
    contact.first_name,
    contact.last_name,
  ]
    .filter(
      (value): value is string =>
        typeof value === 'string' &&
        value.trim().length > 0,
    )
    .join(' ')
    .trim()

  return fullName || 'Unnamed contact'
}

function createContactNameMap(
  contacts: ContactName[],
): Map<string, string> {
  return new Map(
    contacts.map((contact) => [
      contact.id,
      createContactName(contact),
    ]),
  )
}

function createDashboardFollowUps(
  tasks: DashboardTaskRow[],
  contactNames: Map<string, string>,
  timeZone: string,
): {
  overdue: DashboardFollowUp[]
  today: DashboardFollowUp[]
  upcoming: DashboardFollowUp[]
} {
  const todayKey = getTodayDateKey(timeZone)
  const tomorrowKey = addDaysToDateKey(todayKey, 1)

  const followUps = tasks
    .map((task): DashboardFollowUp | null => {
      const dueAt = new Date(task.due_at)

      if (Number.isNaN(dueAt.getTime())) {
        return null
      }

      return {
        id: task.id,
        contactId: task.contact_id,
        contactName:
          contactNames.get(task.contact_id) ??
          'Unknown contact',
        title: task.title,
        description: task.description,
        dueAt: task.due_at,
        priority: task.priority,
      }
    })
    .filter(
      (task): task is DashboardFollowUp => task !== null,
    )

  return {
    overdue: followUps.filter((task) =>
      getDateKeyInTimeZone(new Date(task.dueAt), timeZone) <
      todayKey,
    ),
    today: followUps.filter((task) =>
      getDateKeyInTimeZone(new Date(task.dueAt), timeZone) ===
      todayKey,
    ),
    upcoming: followUps.filter((task) =>
      getDateKeyInTimeZone(new Date(task.dueAt), timeZone) >=
      tomorrowKey,
    ),
  }
}

function createRecentActivity(
  contacts: RecentContact[],
  calls: RecentCallWithContact[],
): DashboardActivity[] {
  const contactActivity: DashboardActivity[] =
    contacts.map((contact) => ({
      id: `contact-${contact.id}`,
      title: 'Contact added',
      description: `${createContactName(
        contact,
      )} was added to the workspace.`,
      createdAt: contact.created_at,
      type: 'contact',
    }))

  const callActivity: DashboardActivity[] =
    calls.map((call) => ({
      id: `call-${call.id}`,
      title: 'Call activity',
      description: `${call.contactName} had a ${call.status.toLowerCase()} ${call.direction.toLowerCase()} call.`,
      createdAt: call.started_at,
      type: 'call',
    }))

  return [...contactActivity, ...callActivity]
    .sort(
      (first, second) =>
        new Date(second.createdAt).getTime() -
        new Date(first.createdAt).getTime(),
    )
    .slice(0, 6)
}

export async function getDashboardData(
  timeZone = 'UTC',
): Promise<DashboardData> {
  try {
    const supabase =
      await createServerSupabaseClient()

    const userId = await getAuthenticatedUserId(
      supabase,
    )

    const profile = await getProfile(
      supabase,
      userId,
    )

    const organizationId =
      await getCurrentOrganizationId(userId)

    const organizationName =
      await getOrganizationName(
        supabase,
        organizationId,
      )

    const normalizedTimeZone = normalizeTimeZone(timeZone)
    const todayKey = getTodayDateKey(normalizedTimeZone)
    const todayIso = getStartOfLocalDateIso(
      todayKey,
      normalizedTimeZone,
    )
    const tomorrowIso = getStartOfLocalDateIso(
      addDaysToDateKey(todayKey, 1),
      normalizedTimeZone,
    )
    const sevenDayWindowIso = getStartOfLocalDateIso(
      addDaysToDateKey(todayKey, -6),
      normalizedTimeZone,
    )

    const [
      contactsCountResult,
      callsTodayCountResult,
      activeCampaignsCountResult,
      allCallsResult,
      recentContactsResult,
      recentCallsResult,
      sevenDayCallsResult,
      pendingTasksResult,
    ] = await Promise.all([
      supabase
        .from('contacts')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('organization_id', organizationId),

      supabase
        .from('calls')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('organization_id', organizationId)
        .gte('started_at', todayIso)
        .lt('started_at', tomorrowIso),

      supabase
        .from('campaigns')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('organization_id', organizationId)
        .eq('status', 'active'),

      supabase
        .from('calls')
        .select(
          `
            id,
            contact_id,
            direction,
            status,
            duration_seconds,
            started_at,
            ended_at,
            created_at
          `,
        )
        .eq('organization_id', organizationId),

      supabase
        .from('contacts')
        .select(
          `
            id,
            first_name,
            last_name,
            company,
            status,
            created_at
          `,
        )
        .eq('organization_id', organizationId)
        .order('created_at', {
          ascending: false,
        })
        .limit(5),

      supabase
        .from('calls')
        .select(
          `
            id,
            contact_id,
            direction,
            status,
            duration_seconds,
            started_at,
            ended_at,
            created_at
          `,
        )
        .eq('organization_id', organizationId)
        .order('started_at', {
          ascending: false,
        })
        .limit(5),

      supabase
        .from('calls')
        .select(
          `
            id,
            contact_id,
            direction,
            status,
            duration_seconds,
            started_at,
            ended_at,
            created_at
          `,
        )
        .eq('organization_id', organizationId)
        .gte('started_at', sevenDayWindowIso)
        .order('started_at', {
          ascending: true,
        }),

      supabase
        .from('contact_tasks')
        .select(
          `
            id,
            contact_id,
            title,
            description,
            due_at,
            status,
            priority
          `,
        )
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .not('due_at', 'is', null)
        .order('due_at', {
          ascending: true,
        })
        .limit(200),

    ])

    const queryErrors = [
      contactsCountResult.error,
      callsTodayCountResult.error,
      activeCampaignsCountResult.error,
      allCallsResult.error,
      recentContactsResult.error,
      recentCallsResult.error,
      sevenDayCallsResult.error,
      pendingTasksResult.error,
    ].filter(
      (error): error is NonNullable<typeof error> =>
        Boolean(error),
    )

    if (queryErrors.length > 0) {
      throw queryErrors[0]
    }

    const [
      opportunitiesResult,
      emailsTodayCountResult,
      meetingsTodayCountResult,
      tasksCompletedTodayCountResult,
    ] = await Promise.all([
      supabase
        .from('opportunities')
        .select('id,status,value,currency,won_at,closed_at,updated_at')
        .eq('organization_id', organizationId),
      supabase
        .from('communication_messages')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('channel', 'email')
        .eq('direction', 'outbound')
        .in('status', ['sent', 'delivered'])
        .gte('created_at', todayIso)
        .lt('created_at', tomorrowIso),
      supabase
        .from('calendar_events')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .in('event_type', ['meeting', 'demo'])
        .neq('status', 'cancelled')
        .gte('starts_at', todayIso)
        .lt('starts_at', tomorrowIso),
      supabase
        .from('contact_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'completed')
        .gte('completed_at', todayIso)
        .lt('completed_at', tomorrowIso),
    ])

    if (opportunitiesResult.error) {
      console.warn('Dashboard sales metrics unavailable:', opportunitiesResult.error)
    }
    if (emailsTodayCountResult.error) {
      console.warn('Dashboard email metric unavailable:', emailsTodayCountResult.error)
    }
    if (meetingsTodayCountResult.error) {
      console.warn('Dashboard meeting metric unavailable:', meetingsTodayCountResult.error)
    }
    if (tasksCompletedTodayCountResult.error) {
      console.warn('Dashboard completed-task metric unavailable:', tasksCompletedTodayCountResult.error)
    }

    const recentContacts =
      (recentContactsResult.data ??
        []) as RecentContact[]

    const recentCallRows =
      (recentCallsResult.data ??
        []) as DashboardCallRow[]

    const allCalls =
      (allCallsResult.data ??
        []) as DashboardCallRow[]

    const sevenDayCalls =
      (sevenDayCallsResult.data ??
        []) as DashboardCallRow[]

    const pendingTasks =
      (pendingTasksResult.data ??
        []) as DashboardTaskRow[]

    const opportunities =
      (opportunitiesResult.data ??
        []) as DashboardOpportunityRow[]

    const openOpportunities = opportunities.filter((opportunity) => {
      const status = opportunity.status.trim().toLowerCase()
      return status !== 'won' && status !== 'lost'
    })
    const wonOpportunities = opportunities.filter(
      (opportunity) => opportunity.status.trim().toLowerCase() === 'won',
    )
    const pipelineValue = openOpportunities.reduce(
      (total, opportunity) => total + getOpportunityValue(opportunity.value),
      0,
    )
    const wonRevenue = wonOpportunities.reduce(
      (total, opportunity) => total + getOpportunityValue(opportunity.value),
      0,
    )
    const currencyCode =
      opportunities.find((opportunity) => opportunity.currency?.trim())?.currency?.trim().toUpperCase() ||
      'USD'

    const contactIds = Array.from(
      new Set([
        ...recentCallRows
          .map((call) => call.contact_id)
          .filter(
            (contactId): contactId is string =>
              typeof contactId === 'string' &&
              contactId.length > 0,
          ),
        ...pendingTasks.map((task) => task.contact_id),
      ]),
    )

    let contactNames = new Map<string, string>()

    if (contactIds.length > 0) {
      const {
        data: contactData,
        error: contactsError,
      } = await supabase
        .from('contacts')
        .select('id, first_name, last_name')
        .eq('organization_id', organizationId)
        .in('id', contactIds)

      if (contactsError) {
        throw contactsError
      }

      contactNames = createContactNameMap(
        (contactData ?? []) as ContactName[],
      )
    }

    const recentCalls =
      recentCallRows.map((call) => ({
        id: call.id,
        contactName: call.contact_id
          ? contactNames.get(call.contact_id) ??
            'Unknown contact'
          : 'Unknown contact',
        durationSeconds: getCallDurationSeconds(call),
        direction: call.direction,
        status: call.status,
        started_at: call.started_at,
      }))

    const followUps = createDashboardFollowUps(
      pendingTasks,
      contactNames,
      normalizedTimeZone,
    )

    const connectedCalls = allCalls.filter(
      isConnectedCall,
    ).length

    const totalDurationSeconds =
      calculateTotalDurationSeconds(allCalls)

    const totalCalls = allCalls.length

    return {
      organizationId,
      userName:
        profile?.full_name?.trim() || 'there',
      organizationName,
      currencyCode,

      totalContacts:
        contactsCountResult.count ?? 0,
      openDeals: openOpportunities.length,
      wonDeals: wonOpportunities.length,
      pipelineValue,
      wonRevenue,
      emailsToday: emailsTodayCountResult.count ?? 0,
      meetingsToday: meetingsTodayCountResult.count ?? 0,
      tasksCompletedToday: tasksCompletedTodayCountResult.count ?? 0,
      totalCalls,
      callsToday:
        callsTodayCountResult.count ?? 0,
      connectedCalls,
      connectedRate:
        totalCalls > 0
          ? Math.round(
              (connectedCalls / totalCalls) * 100,
            )
          : 0,
      activeCampaigns:
        activeCampaignsCountResult.count ?? 0,
      totalCallMinutes: Math.round(
        totalDurationSeconds / 60,
      ),
      averageCallDurationSeconds:
        calculateAverageDurationSeconds(allCalls),
      overdueTasksCount: followUps.overdue.length,
      todayTasksCount: followUps.today.length,
      upcomingTasksCount: followUps.upcoming.length,

      recentContacts,
      recentCalls,
      callsOverTime:
        createCallsOverTime(
          sevenDayCalls,
          normalizedTimeZone,
        ),
      callOutcomes:
        createCallOutcomes(allCalls),
      recentActivity: createRecentActivity(
        recentContacts,
        recentCalls,
      ),
      salesTrend: createSalesTrend(
        opportunities,
        normalizedTimeZone,
      ),
      overdueFollowUps: followUps.overdue,
      todayFollowUps: followUps.today,
      upcomingFollowUps: followUps.upcoming,
    }
  } catch (error) {
    console.error('Dashboard data error:', error)

    return createEmptyDashboardData(
      error instanceof Error
        ? error.message
        : 'Unable to load dashboard data.',
    )
  }
}

