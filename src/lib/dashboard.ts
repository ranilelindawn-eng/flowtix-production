import {
  createClient as createServerSupabaseClient,
} from '@/lib/supabase/server'

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

type MembershipRow = {
  organization_id: string
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
  created_at: string
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
  userName: string
  organizationName: string

  totalContacts: number
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
  overdueFollowUps: DashboardFollowUp[]
  todayFollowUps: DashboardFollowUp[]
  upcomingFollowUps: DashboardFollowUp[]

  error?: string
}

function createEmptyDashboardData(
  error?: string,
): DashboardData {
  return {
    userName: 'there',
    organizationName: 'CallFlow workspace',

    totalContacts: 0,
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
    callsOverTime: createEmptyCallsOverTime(),
    callOutcomes: [],
    recentActivity: [],
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
  supabase: SupabaseServerClient,
  userId: string,
  profile: ProfileRow | null,
): Promise<string> {
  if (profile?.organization_id) {
    return profile.organization_id
  }

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error(
      'Organization membership lookup failed:',
      error,
    )

    throw new Error(
      'Unable to determine the current organization.',
    )
  }

  const membership = data as MembershipRow | null

  if (membership?.organization_id) {
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
    'CallFlow workspace'
  )
}

function getStartOfToday(): Date {
  const now = new Date()

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  )
}

function getStartOfTodayIso(): string {
  return getStartOfToday().toISOString()
}

function getStartOfTomorrow(): Date {
  const tomorrow = getStartOfToday()

  tomorrow.setDate(tomorrow.getDate() + 1)

  return tomorrow
}

function getStartOfSevenDayWindowIso(): string {
  const start = getStartOfToday()

  start.setDate(start.getDate() - 6)

  return start.toISOString()
}

function getDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(
    date.getMonth() + 1,
  ).padStart(2, '0')
  const day = String(date.getDate()).padStart(
    2,
    '0',
  )

  return `${year}-${month}-${day}`
}

function createEmptyCallsOverTime(): CallsOverTimePoint[] {
  const start = getStartOfToday()
  const formatter = new Intl.DateTimeFormat('en', {
    weekday: 'short',
  })

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)

    date.setDate(start.getDate() - (6 - index))

    return {
      date: getDateKey(date),
      label: formatter.format(date),
      calls: 0,
    }
  })
}

function createCallsOverTime(
  calls: DashboardCallRow[],
): CallsOverTimePoint[] {
  const points = createEmptyCallsOverTime()
  const pointMap = new Map(
    points.map((point) => [point.date, point]),
  )

  for (const call of calls) {
    const startedAt = new Date(call.started_at)

    if (Number.isNaN(startedAt.getTime())) {
      continue
    }

    const key = getDateKey(startedAt)
    const point = pointMap.get(key)

    if (point) {
      point.calls += 1
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

function calculateTotalDurationSeconds(
  calls: DashboardCallRow[],
): number {
  return calls.reduce(
    (total, call) =>
      total +
      Math.max(call.duration_seconds ?? 0, 0),
    0,
  )
}

function calculateAverageDurationSeconds(
  calls: DashboardCallRow[],
): number {
  const callsWithDuration = calls.filter(
    (call) =>
      typeof call.duration_seconds === 'number' &&
      call.duration_seconds > 0,
  )

  if (callsWithDuration.length === 0) {
    return 0
  }

  const totalDuration = calculateTotalDurationSeconds(
    callsWithDuration,
  )

  return Math.round(
    totalDuration / callsWithDuration.length,
  )
}

function isConnectedCall(
  call: DashboardCallRow,
): boolean {
  /*
   * A positive call duration is used as the provider-neutral
   * connected-call signal until a telephony provider supplies
   * a dedicated answered/connected event.
   */
  return (
    typeof call.duration_seconds === 'number' &&
    call.duration_seconds > 0
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
): {
  overdue: DashboardFollowUp[]
  today: DashboardFollowUp[]
  upcoming: DashboardFollowUp[]
} {
  const startOfToday = getStartOfToday().getTime()
  const startOfTomorrow = getStartOfTomorrow().getTime()

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
    overdue: followUps.filter(
      (task) => new Date(task.dueAt).getTime() < startOfToday,
    ),
    today: followUps.filter((task) => {
      const dueAt = new Date(task.dueAt).getTime()

      return dueAt >= startOfToday && dueAt < startOfTomorrow
    }),
    upcoming: followUps.filter(
      (task) => new Date(task.dueAt).getTime() >= startOfTomorrow,
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

export async function getDashboardData(): Promise<DashboardData> {
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
      await getCurrentOrganizationId(
        supabase,
        userId,
        profile,
      )

    const organizationName =
      await getOrganizationName(
        supabase,
        organizationId,
      )

    const todayIso = getStartOfTodayIso()
    const sevenDayWindowIso =
      getStartOfSevenDayWindowIso()

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
        .gte('started_at', todayIso),

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
        durationSeconds: call.duration_seconds,
        direction: call.direction,
        status: call.status,
        started_at: call.started_at,
      }))

    const followUps = createDashboardFollowUps(
      pendingTasks,
      contactNames,
    )

    const connectedCalls = allCalls.filter(
      isConnectedCall,
    ).length

    const totalDurationSeconds =
      calculateTotalDurationSeconds(allCalls)

    const totalCalls = allCalls.length

    return {
      userName:
        profile?.full_name?.trim() || 'there',
      organizationName,

      totalContacts:
        contactsCountResult.count ?? 0,
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
        createCallsOverTime(sevenDayCalls),
      callOutcomes:
        createCallOutcomes(allCalls),
      recentActivity: createRecentActivity(
        recentContacts,
        recentCalls,
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

