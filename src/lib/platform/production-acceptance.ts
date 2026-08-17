import 'server-only'

import { getPayMongoAcceptanceReport } from '@/lib/platform/billing-validation'
import { getPlanAcceptanceReport } from '@/lib/platform/plan-validation'
import { getOperationsValidationReport } from '@/lib/platform/operations-validation'
import { getPlatformPermissions } from '@/lib/platform/permissions'
import { getProviderUsageValidationReport } from '@/lib/platform/provider-validation'
import { getPlatformSecurityReport } from '@/lib/platform/security-validation'
import { getSupportSecurityReport } from '@/lib/platform/support-validation'
import { requirePlatformPermission } from '@/lib/platform/auth'
import type {
  PlatformPermission,
  PlatformRole,
} from '@/lib/platform/types'
import { rolePermissions, type Permission } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import type { TeamRole } from '@/lib/team'

type Row = Record<string, unknown>

const isRecord = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return 0
}

const asBoolean = (value: unknown): boolean => value === true

export type AcceptanceSection = {
  key: string
  label: string
  healthy: boolean
  score: number
  href: string
  detail: string
}

export type PlatformRoleAcceptance = {
  role: PlatformRole
  permissions: readonly PlatformPermission[]
}

export type CustomerRoleAcceptance = {
  role: TeamRole
  permissions: readonly Permission[]
}

export type TenantIsolationAcceptance = {
  healthy: boolean
  overlappingActiveMembershipRows: number
  unguardedCustomerMembershipPolicies: number
  platformIdentityDeniedByCustomerHelpers: boolean
  platformIdentityDeniedByActiveOrganizationSelector: boolean
  newActivePlatformCustomerMembershipsBlocked: boolean
}

export type ProductionAcceptanceReport = {
  automatedHealthy: boolean
  automatedScore: number
  sections: AcceptanceSection[]
  tenantIsolation: TenantIsolationAcceptance
  platformRoles: PlatformRoleAcceptance[]
  customerRoles: CustomerRoleAcceptance[]
  manualRoles: Array<{
    role: string
    area: 'platform' | 'customer'
    required: boolean
  }>
}

async function getTenantIsolationAcceptance(): Promise<TenantIsolationAcceptance> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_tenant_isolation_report',
  )

  if (error) {
    throw new Error(
      `Unable to run tenant-isolation validation: ${error.message}`,
    )
  }

  if (!isRecord(data)) {
    throw new Error('Tenant-isolation validation returned an invalid result.')
  }

  return {
    healthy: asBoolean(data.healthy),
    overlappingActiveMembershipRows: asNumber(
      data.overlappingActiveMembershipRows,
    ),
    unguardedCustomerMembershipPolicies: asNumber(
      data.unguardedCustomerMembershipPolicies,
    ),
    platformIdentityDeniedByCustomerHelpers: asBoolean(
      data.platformIdentityDeniedByCustomerHelpers,
    ),
    platformIdentityDeniedByActiveOrganizationSelector: asBoolean(
      data.platformIdentityDeniedByActiveOrganizationSelector,
    ),
    newActivePlatformCustomerMembershipsBlocked: asBoolean(
      data.newActivePlatformCustomerMembershipsBlocked,
    ),
  }
}

export async function getProductionAcceptanceReport(): Promise<ProductionAcceptanceReport> {
  await requirePlatformPermission('platform.settings.manage')

  const [
    tenantIsolation,
    billing,
    plans,
    support,
    providers,
    operations,
    security,
  ] = await Promise.all([
    getTenantIsolationAcceptance(),
    getPayMongoAcceptanceReport(),
    getPlanAcceptanceReport(),
    getSupportSecurityReport(),
    getProviderUsageValidationReport(),
    getOperationsValidationReport(),
    getPlatformSecurityReport(),
  ])

  const tenantScore = tenantIsolation.healthy ? 100 : 0

  const sections: AcceptanceSection[] = [
    {
      key: 'tenant-isolation',
      label: 'Platform ↔ Customer Isolation',
      healthy: tenantIsolation.healthy,
      score: tenantScore,
      href: '/platform',
      detail:
        tenantIsolation.unguardedCustomerMembershipPolicies === 0
          ? 'Customer membership policies are guarded from active Platform identities.'
          : `${tenantIsolation.unguardedCustomerMembershipPolicies} customer membership policies remain unguarded.`,
    },
    {
      key: 'billing',
      label: 'PayMongo Billing Lifecycle',
      healthy: billing.healthy,
      score: billing.score,
      href: '/platform/billing/validation',
      detail: `${billing.payments.paid} paid payments · ${billing.webhooks.processed} processed PayMongo webhooks`,
    },
    {
      key: 'plans',
      label: 'Plans, Entitlements & Quotas',
      healthy: plans.healthy,
      score: plans.score,
      href: '/platform/billing/plans/validation',
      detail: `${plans.plans.filter((plan) => plan.healthy).length}/4 canonical plans healthy · ${plans.subscriptions.total} subscriptions checked`,
    },
    {
      key: 'support',
      label: 'Support Impersonation Security',
      healthy: support.healthy,
      score: support.score,
      href: '/platform/support/validation',
      detail: `${support.sessions.active} active support sessions · ${support.audit.workspaceViews} audited workspace views`,
    },
    {
      key: 'providers',
      label: 'Provider & Usage Security',
      healthy: providers.healthy,
      score: providers.score,
      href: '/platform/providers/validation',
      detail: `${providers.telephony.integrations} telephony integrations · ${providers.ai.requestsThisMonth} AI requests this month`,
    },
    {
      key: 'operations',
      label: 'Jobs, Health & Feature Flags',
      healthy: operations.healthy,
      score: operations.score,
      href: '/platform/operations/validation',
      detail: `${operations.jobs.total} durable jobs · ${operations.flags.configured} operational feature flags`,
    },
    {
      key: 'security',
      label: 'Audit & Security Hardening',
      healthy: security.healthy,
      score: security.score,
      href: '/platform/security/validation',
      detail: `${security.audit.events} Platform audit events · ${security.secrets.encryptedSecretRows} encrypted secret rows`,
    },
  ]

  const automatedScore = Math.round(
    sections.reduce((sum, section) => sum + section.score, 0) /
      sections.length,
  )

  const platformRoleNames: PlatformRole[] = [
    'platform_owner',
    'platform_admin',
    'finance',
    'support',
    'developer',
  ]

  const customerRoleNames: TeamRole[] = [
    'owner',
    'admin',
    'manager',
    'agent',
  ]

  return {
    automatedHealthy: sections.every((section) => section.healthy),
    automatedScore,
    sections,
    tenantIsolation,
    platformRoles: platformRoleNames.map((role) => ({
      role,
      permissions: getPlatformPermissions(role),
    })),
    customerRoles: customerRoleNames.map((role) => ({
      role,
      permissions: rolePermissions[role],
    })),
    manualRoles: [
      { role: 'Platform Owner', area: 'platform', required: true },
      { role: 'Platform Admin', area: 'platform', required: true },
      { role: 'Finance', area: 'platform', required: true },
      { role: 'Support', area: 'platform', required: true },
      { role: 'Developer', area: 'platform', required: true },
      { role: 'Customer Owner', area: 'customer', required: true },
      { role: 'Customer Admin', area: 'customer', required: true },
      { role: 'Manager', area: 'customer', required: true },
      { role: 'Agent', area: 'customer', required: true },
    ],
  }
}
