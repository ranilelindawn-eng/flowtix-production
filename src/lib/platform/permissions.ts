import type {
  PlatformPermission,
  PlatformRole,
} from '@/lib/platform/types'

const allPermissions: readonly PlatformPermission[] = [
  'platform.dashboard.view',
  'platform.customers.view',
  'platform.organizations.manage',
  'platform.subscriptions.manage',
  'platform.enterprise.manage',
  'platform.billing.view',
  'platform.billing.manage',
  'platform.telephony.manage',
  'platform.ai.manage',
  'platform.api_keys.manage',
  'platform.impersonation.use',
  'platform.audit.view',
  'platform.jobs.view',
  'platform.jobs.manage',
  'platform.flags.manage',
  'platform.settings.manage',
]

const permissionsByRole: Record<
  PlatformRole,
  readonly PlatformPermission[]
> = {
  platform_owner: allPermissions,
  platform_admin: allPermissions.filter(
    (permission) =>
      permission !== 'platform.settings.manage',
  ),
  finance: [
    'platform.dashboard.view',
    'platform.customers.view',
    'platform.subscriptions.manage',
    'platform.enterprise.manage',
    'platform.billing.view',
    'platform.billing.manage',
    'platform.audit.view',
  ],
  support: [
    'platform.dashboard.view',
    'platform.customers.view',
    'platform.billing.view',
    'platform.impersonation.use',
    'platform.audit.view',
    'platform.jobs.view',
  ],
  developer: [
    'platform.dashboard.view',
    'platform.customers.view',
    'platform.telephony.manage',
    'platform.ai.manage',
    'platform.api_keys.manage',
    'platform.audit.view',
    'platform.jobs.view',
    'platform.jobs.manage',
    'platform.flags.manage',
  ],
}

export function hasPlatformPermission(
  role: PlatformRole,
  permission: PlatformPermission,
): boolean {
  return permissionsByRole[role].includes(permission)
}

export function getPlatformPermissions(
  role: PlatformRole,
): readonly PlatformPermission[] {
  return permissionsByRole[role]
}
