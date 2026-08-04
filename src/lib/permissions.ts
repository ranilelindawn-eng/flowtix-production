import type { TeamRole } from '@/lib/team'

export type Permission =
  | 'organization.view'
  | 'organization.update'
  | 'organization.delete'
  | 'team.view'
  | 'team.invite'
  | 'team.update_roles'
  | 'team.remove_members'
  | 'attendance.view_own'
  | 'attendance.view_all'
  | 'attendance.clock'
  | 'billing.view'
  | 'billing.manage'
  | 'contacts.view'
  | 'contacts.create'
  | 'contacts.update'
  | 'contacts.delete'
  | 'contacts.view_own'
  | 'contacts.view_all'
  | 'contacts.assign'
  | 'companies.view_own'
  | 'companies.view_all'
  | 'companies.assign'
  | 'companies.view'
  | 'companies.create'
  | 'companies.update'
  | 'companies.delete'
  | 'opportunities.view_own'
  | 'opportunities.view_all'
  | 'opportunities.assign'
  | 'opportunities.view'
  | 'opportunities.create'
  | 'opportunities.update'
  | 'opportunities.delete'
  | 'tasks.view_own'
  | 'tasks.view_all'
  | 'tasks.assign'
  | 'tasks.view'
  | 'tasks.create'
  | 'tasks.update'
  | 'tasks.delete'
  | 'calendar.view_own'
  | 'calendar.view_all'
  | 'calendar.assign'
  | 'calendar.view'
  | 'calendar.create'
  | 'calendar.update'
  | 'calendar.delete'
  | 'calls.view_own'
  | 'calls.view_all'
  | 'calls.assign'
  | 'campaigns.view_own'
  | 'campaigns.view_all'
  | 'campaigns.assign'
  | 'campaigns.view'
  | 'campaigns.create'
  | 'campaigns.update'
  | 'campaigns.delete'
  | 'calls.view'
  | 'calls.create'
  | 'calls.update'
  | 'calls.delete'
  | 'recordings.view'
  | 'recordings.create'
  | 'recordings.delete'
  | 'transcripts.view'
  | 'transcripts.update'
  | 'summaries.view'
  | 'summaries.create'
  | 'insights.view'
  | 'reports.view'
  | 'reports.export'
  | 'settings.view'
  | 'settings.manage'
  | 'api_keys.view'
  | 'api_keys.manage'
  | 'webhooks.view'
  | 'webhooks.manage'
  | 'audit_logs.view'
  | 'jobs.view'
  | 'jobs.manage'

const ownerPermissions: readonly Permission[] = [
  'organization.view',
  'organization.update',
  'organization.delete',

  'team.view',
  'team.invite',
  'team.update_roles',
  'team.remove_members',

  'attendance.view_own',
  'attendance.view_all',
  'attendance.clock',

  'billing.view',
  'billing.manage',

  'contacts.view',
  'contacts.create',
  'contacts.update',
  'contacts.delete',
  'contacts.view_own',
  'contacts.view_all',
  'contacts.assign',
  'companies.view_own',
  'companies.view_all',
  'companies.assign',
  'companies.view',
  'companies.create',
  'companies.update',
  'companies.delete',
  'opportunities.view_own',
  'opportunities.view_all',
  'opportunities.assign',
  'opportunities.view',
  'opportunities.create',
  'opportunities.update',
  'opportunities.delete',
  'tasks.view_own',
  'tasks.view_all',
  'tasks.assign',
  'tasks.view',
  'tasks.create',
  'tasks.update',
  'tasks.delete',
  'calendar.view_own',
  'calendar.view_all',
  'calendar.assign',
  'calendar.view',
  'calendar.create',
  'calendar.update',
  'calendar.delete',
  'calls.view_own',
  'calls.view_all',
  'calls.assign',
  'campaigns.view_own',
  'campaigns.view_all',
  'campaigns.assign',

  'campaigns.view',
  'campaigns.create',
  'campaigns.update',
  'campaigns.delete',

  'calls.view',
  'calls.create',
  'calls.update',
  'calls.delete',

  'recordings.view',
  'recordings.create',
  'recordings.delete',

  'transcripts.view',
  'transcripts.update',

  'summaries.view',
  'summaries.create',

  'insights.view',

  'reports.view',
  'reports.export',

  'settings.view',
  'settings.manage',

  'api_keys.view',
  'api_keys.manage',

  'webhooks.view',
  'webhooks.manage',

  'audit_logs.view',

  'jobs.view',
  'jobs.manage',
]

const adminPermissions: readonly Permission[] = [
  'organization.view',

  'team.view',
  'team.invite',
  'team.update_roles',
  'team.remove_members',

  'attendance.view_own',
  'attendance.view_all',
  'attendance.clock',

  'billing.view',

  'contacts.view',
  'contacts.create',
  'contacts.update',
  'contacts.delete',
  'contacts.view_own',
  'contacts.view_all',
  'contacts.assign',
  'companies.view_own',
  'companies.view_all',
  'companies.assign',
  'companies.view',
  'companies.create',
  'companies.update',
  'companies.delete',
  'opportunities.view_own',
  'opportunities.view_all',
  'opportunities.assign',
  'opportunities.view',
  'opportunities.create',
  'opportunities.update',
  'opportunities.delete',
  'tasks.view_own',
  'tasks.view_all',
  'tasks.assign',
  'tasks.view',
  'tasks.create',
  'tasks.update',
  'tasks.delete',
  'calendar.view_own',
  'calendar.view_all',
  'calendar.assign',
  'calendar.view',
  'calendar.create',
  'calendar.update',
  'calendar.delete',
  'calls.view_own',
  'calls.view_all',
  'calls.assign',
  'campaigns.view_own',
  'campaigns.view_all',
  'campaigns.assign',

  'campaigns.view',
  'campaigns.create',
  'campaigns.update',
  'campaigns.delete',

  'calls.view',
  'calls.create',
  'calls.update',
  'calls.delete',

  'recordings.view',
  'recordings.create',
  'recordings.delete',

  'transcripts.view',
  'transcripts.update',

  'summaries.view',
  'summaries.create',

  'insights.view',

  'reports.view',
  'reports.export',

  'settings.view',
  'settings.manage',

  'api_keys.view',
  'api_keys.manage',

  'webhooks.view',
  'webhooks.manage',

  'audit_logs.view',

  'jobs.view',
  'jobs.manage',
]

const managerPermissions: readonly Permission[] = [
  'organization.view',

  'team.view',

  'attendance.view_own',
  'attendance.clock',

  'contacts.view',
  'contacts.create',
  'contacts.update',
  'contacts.delete',
  'contacts.view_own',
  'contacts.view_all',
  'contacts.assign',
  'companies.view_own',
  'companies.view_all',
  'companies.assign',
  'companies.view',
  'companies.create',
  'companies.update',
  'companies.delete',
  'opportunities.view_own',
  'opportunities.view_all',
  'opportunities.assign',
  'opportunities.view',
  'opportunities.create',
  'opportunities.update',
  'opportunities.delete',
  'tasks.view_own',
  'tasks.view_all',
  'tasks.assign',
  'tasks.view',
  'tasks.create',
  'tasks.update',
  'tasks.delete',
  'calendar.view_own',
  'calendar.view_all',
  'calendar.assign',
  'calendar.view',
  'calendar.create',
  'calendar.update',
  'calendar.delete',
  'calls.view_own',
  'calls.view_all',
  'calls.assign',
  'campaigns.view_own',
  'campaigns.view_all',
  'campaigns.assign',

  'campaigns.view',
  'campaigns.create',
  'campaigns.update',
  'campaigns.delete',

  'calls.view',
  'calls.create',
  'calls.update',

  'recordings.view',
  'recordings.create',

  'transcripts.view',
  'transcripts.update',

  'summaries.view',
  'summaries.create',

  'insights.view',

  'reports.view',
  'reports.export',

  'settings.view',

  'audit_logs.view',
]



const agentPermissions: readonly Permission[] = [
  'organization.view',

  'team.view',

  'attendance.view_own',
  'attendance.clock',

  'contacts.view',
  'contacts.create',
  'contacts.update',
  'contacts.view_own',
  'companies.view_own',
  'companies.view',
  'companies.create',
  'companies.update',
  'opportunities.view_own',
  'opportunities.view',
  'opportunities.create',
  'opportunities.update',
  'tasks.view_own',
  'tasks.view',
  'tasks.create',
  'tasks.update',
  'calendar.view_own',
  'calendar.view',
  'calendar.create',
  'calendar.update',
  'calls.view_own',
  'campaigns.view_own',

  'campaigns.view',

  'calls.view',
  'calls.create',
  'calls.update',

  'recordings.view',

  'transcripts.view',

  'summaries.view',

  'insights.view',

  'reports.view',

  'settings.view',
]

export const rolePermissions: Record<
  TeamRole,
  readonly Permission[]
> = {
  owner: ownerPermissions,
  admin: adminPermissions,
  manager: managerPermissions,
  agent: agentPermissions,
}

export function hasPermission(
  role: TeamRole,
  permission: Permission,
): boolean {
  return rolePermissions[role].includes(permission)
}

export function hasAnyPermission(
  role: TeamRole,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) =>
    hasPermission(role, permission),
  )
}

export function hasAllPermissions(
  role: TeamRole,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((permission) =>
    hasPermission(role, permission),
  )
}

export function canManageTeam(role: TeamRole): boolean {
  return hasPermission(role, 'team.invite')
}

export function canManageBilling(role: TeamRole): boolean {
  return hasPermission(role, 'billing.manage')
}

export function canManageOrganization(role: TeamRole): boolean {
  return hasPermission(role, 'organization.update')
}

export function canDeleteOrganization(role: TeamRole): boolean {
  return hasPermission(role, 'organization.delete')
}

export function canManageDeveloperSettings(
  role: TeamRole,
): boolean {
  return hasAnyPermission(role, [
    'api_keys.manage',
    'webhooks.manage',
  ])
}