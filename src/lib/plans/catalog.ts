export const FLOWTIX_PLAN_CODES = [
  'starter',
  'pro',
  'business',
  'enterprise',
] as const

export type PlanCode = (typeof FLOWTIX_PLAN_CODES)[number]

export const FEATURE_ENTITLEMENTS = [
  'crm.core',
  'calendar.core',
  'communications.manual',
  'campaigns.basic',
  'reports.basic',
  'reports.advanced',
  'reports.export',
  'dialer.cloud',
  'ai.limited',
  'ai.chat',
  'ai.call_analysis',
  'ai.email',
  'ai.tasks',
  'ai.transcription',
  'ai.insights',
  'ai.advanced',
  'automation.sequences',
  'automation.campaigns',
  'automation.advanced',
  'integrations.google',
  'integrations.premium',
  'api.access',
  'team.advanced',
  'security.advanced',
  'analytics.dashboards',
  'analytics.kpi',
  'analytics.sales',
  'analytics.calls',
  'analytics.agents',
  'analytics.campaigns',
  'analytics.ai',
  'workforce.attendance',
] as const

export type FeatureEntitlement =
  (typeof FEATURE_ENTITLEMENTS)[number]

export const FEATURE_LABELS = {
  'crm.core': 'Core CRM',
  'calendar.core': 'Calendar',
  'communications.manual': 'Email & SMS',
  'campaigns.basic': 'Campaigns',
  'reports.basic': 'Reports',
  'reports.advanced': 'Advanced Reports',
  'reports.export': 'Data Exports',
  'dialer.cloud': 'Cloud Dialer',
  'ai.limited': 'Limited AI',
  'ai.chat': 'AI Workspace',
  'ai.call_analysis': 'AI Call Analysis',
  'ai.email': 'AI Email',
  'ai.tasks': 'AI Task Generation',
  'ai.transcription': 'Transcripts',
  'ai.insights': 'AI Insights',
  'ai.advanced': 'Advanced AI',
  'automation.sequences': 'Sequences',
  'automation.campaigns': 'Campaign Automation',
  'automation.advanced': 'Advanced Automation',
  'integrations.google': 'Google Integration',
  'integrations.premium': 'Premium Integrations',
  'api.access': 'API Access',
  'team.advanced': 'Advanced Roles & Permissions',
  'security.advanced': 'Advanced Security',
  'analytics.dashboards': 'Dashboards',
  'analytics.kpi': 'KPI Engine',
  'analytics.sales': 'Sales Analytics',
  'analytics.calls': 'Call Analytics',
  'analytics.agents': 'Agent Analytics',
  'analytics.campaigns': 'Campaign Analytics',
  'analytics.ai': 'AI Analytics',
  'workforce.attendance': 'Time & Attendance',
} as const satisfies Record<FeatureEntitlement, string>

export type PlanLimitValue = number | null

export type PlanLimits = {
  members: PlanLimitValue
  contacts: PlanLimitValue
  activeCampaigns: PlanLimitValue
  activeSequences: PlanLimitValue
  recordingRetentionDays: PlanLimitValue
  storageBytes: PlanLimitValue
  aiRequestsPerMonth: PlanLimitValue
  transcriptionMinutesPerMonth: PlanLimitValue
}

export type FlowtixPlanDefinition = {
  code: PlanCode
  publicSlug: 'starter' | 'professional' | 'business' | 'enterprise'
  name: 'Starter' | 'Professional' | 'Business' | 'Enterprise'
  positioning: string
  description: string
  publicPriceUsdCents: number
  priceStartsAt: boolean
  selfService: boolean
  limits: PlanLimits
  marketingFeatures: readonly string[]
  entitlements: readonly FeatureEntitlement[]
}

const GIB = 1024 ** 3

const STARTER_ENTITLEMENTS = [
  'crm.core',
  'calendar.core',
  'communications.manual',
  'campaigns.basic',
  'reports.basic',
  'reports.export',
  'dialer.cloud',
  'ai.limited',
  'automation.sequences',
  'integrations.google',
] as const satisfies readonly FeatureEntitlement[]

const PROFESSIONAL_ENTITLEMENTS = [
  ...STARTER_ENTITLEMENTS,
  'reports.advanced',
  'ai.email',
  'ai.tasks',
  'ai.chat',
  'ai.call_analysis',
  'ai.transcription',
  'ai.insights',
  'automation.campaigns',
  'integrations.premium',
  'analytics.dashboards',
  'analytics.kpi',
  'analytics.sales',
  'analytics.calls',
] as const satisfies readonly FeatureEntitlement[]

const BUSINESS_ENTITLEMENTS = [
  ...PROFESSIONAL_ENTITLEMENTS,
  'ai.advanced',
  'automation.advanced',
  'api.access',
  'team.advanced',
  'security.advanced',
  'analytics.agents',
  'analytics.campaigns',
  'analytics.ai',
  'workforce.attendance',
] as const satisfies readonly FeatureEntitlement[]

export const FLOWTIX_PLANS = {
  starter: {
    code: 'starter',
    publicSlug: 'starter',
    name: 'Starter',
    positioning: 'Core CRM + outbound calling',
    description:
      'For small sales teams that need the core Flowtix CRM, outbound calling, and practical day-to-day automation.',
    publicPriceUsdCents: 4_900,
    priceStartsAt: false,
    selfService: true,
    limits: {
      members: 2,
      contacts: 2_500,
      activeCampaigns: 1,
      activeSequences: 2,
      recordingRetentionDays: 30,
      storageBytes: 2 * GIB,
      aiRequestsPerMonth: 100,
      transcriptionMinutesPerMonth: 0,
    },
    marketingFeatures: [
      '2 users',
      '2,500 contacts',
      '1 active campaign',
      '2 active sequences',
      '30-day recording retention',
      '2 GB storage',
      '100 AI requests per month',
      'Core CRM, outbound dialer, Email & SMS, reports, and basic automation',
    ],
    entitlements: STARTER_ENTITLEMENTS,
  },
  pro: {
    code: 'pro',
    publicSlug: 'professional',
    name: 'Professional',
    positioning: 'Sales automation + core analytics + AI',
    description:
      'For active sales teams that need deeper automation, transcripts, core analytics, and the full AI workspace.',
    publicPriceUsdCents: 9_900,
    priceStartsAt: false,
    selfService: true,
    limits: {
      members: 5,
      contacts: 10_000,
      activeCampaigns: 10,
      activeSequences: 20,
      recordingRetentionDays: 90,
      storageBytes: 10 * GIB,
      aiRequestsPerMonth: 1_000,
      transcriptionMinutesPerMonth: 500,
    },
    marketingFeatures: [
      'Everything in Starter',
      '5 users and 10,000 contacts',
      '10 active campaigns and 20 active sequences',
      '90-day recording retention and 10 GB storage',
      '1,000 AI requests per month',
      '500 transcription minutes per month',
      'Transcripts, Dashboards, KPI Engine, Sales Analytics, and Call Analytics',
      'AI Workspace, AI Insights, and full automation',
    ],
    entitlements: PROFESSIONAL_ENTITLEMENTS,
  },
  business: {
    code: 'business',
    publicSlug: 'business',
    name: 'Business',
    positioning: 'Advanced analytics + workforce + advanced AI',
    description:
      'For growing operations that need advanced analytics, workforce controls, advanced AI, and higher automation capacity.',
    publicPriceUsdCents: 19_900,
    priceStartsAt: false,
    selfService: true,
    limits: {
      members: 15,
      contacts: 50_000,
      activeCampaigns: 50,
      activeSequences: 100,
      recordingRetentionDays: 365,
      storageBytes: 50 * GIB,
      aiRequestsPerMonth: 5_000,
      transcriptionMinutesPerMonth: 2_500,
    },
    marketingFeatures: [
      'Everything in Professional',
      '15 users and 50,000 contacts',
      '50 active campaigns and 100 active sequences',
      '365-day recording retention and 50 GB storage',
      '5,000 AI requests per month',
      '2,500 transcription minutes per month',
      'Agent, Campaign, and AI Analytics plus Time & Attendance',
      'Advanced Roles & Permissions, advanced AI, and higher automation capacity',
    ],
    entitlements: BUSINESS_ENTITLEMENTS,
  },
  enterprise: {
    code: 'enterprise',
    publicSlug: 'enterprise',
    name: 'Enterprise',
    positioning: 'Scale + custom limits/support',
    description:
      'For larger organizations that need Business capabilities with custom capacity, onboarding, policy support, and priority support.',
    publicPriceUsdCents: 39_900,
    priceStartsAt: true,
    selfService: false,
    limits: {
      members: null,
      contacts: null,
      activeCampaigns: null,
      activeSequences: null,
      recordingRetentionDays: null,
      storageBytes: null,
      aiRequestsPerMonth: null,
      transcriptionMinutesPerMonth: null,
    },
    marketingFeatures: [
      'Everything in Business',
      '25+ users with custom team limits',
      'Custom contacts, campaigns, and sequences',
      'Custom storage and recording retention',
      'Custom AI and transcription quotas',
      'Higher export and automation limits',
      'Priority support and assisted onboarding',
      'Enterprise/custom policy support',
    ],
    entitlements: BUSINESS_ENTITLEMENTS,
  },
} as const satisfies Record<PlanCode, FlowtixPlanDefinition>

export const FLOWTIX_PLAN_ORDER: readonly PlanCode[] = [
  'starter',
  'pro',
  'business',
  'enterprise',
]

export function normalizePlanCode(value: string): PlanCode | null {
  const normalized = value.trim().toLowerCase()
  const alias = normalized === 'professional' ? 'pro' : normalized

  return FLOWTIX_PLAN_CODES.includes(alias as PlanCode)
    ? (alias as PlanCode)
    : null
}

export function getPlanDefinition(
  value: string,
): FlowtixPlanDefinition | null {
  const code = normalizePlanCode(value)
  return code ? FLOWTIX_PLANS[code] : null
}

export function planIncludesFeature(
  planCode: PlanCode,
  feature: FeatureEntitlement,
): boolean {
  const entitlements = FLOWTIX_PLANS[planCode]
    .entitlements as readonly FeatureEntitlement[]

  return entitlements.includes(feature)
}

export function getMinimumPlanForFeature(
  feature: FeatureEntitlement,
): FlowtixPlanDefinition | null {
  for (const planCode of FLOWTIX_PLAN_ORDER) {
    const plan = FLOWTIX_PLANS[planCode]
    const entitlements = plan.entitlements as readonly FeatureEntitlement[]

    if (entitlements.includes(feature)) {
      return plan
    }
  }

  return null
}

export function isFeatureEntitlement(
  value: unknown,
): value is FeatureEntitlement {
  return (
    typeof value === 'string' &&
    (FEATURE_ENTITLEMENTS as readonly string[]).includes(value)
  )
}

export function getFeatureLabel(
  feature: FeatureEntitlement,
): string {
  return FEATURE_LABELS[feature]
}

export function getEligiblePlansForFeature(
  feature: FeatureEntitlement,
): FlowtixPlanDefinition[] {
  return FLOWTIX_PLAN_ORDER.filter((planCode) =>
    planIncludesFeature(planCode, feature),
  ).map((planCode) => FLOWTIX_PLANS[planCode])
}
