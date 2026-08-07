export type PlatformRole =
  | 'platform_owner'
  | 'platform_admin'
  | 'finance'
  | 'support'
  | 'developer'

export type PlatformPermission =
  | 'platform.dashboard.view'
  | 'platform.customers.view'
  | 'platform.organizations.manage'
  | 'platform.subscriptions.manage'
  | 'platform.billing.view'
  | 'platform.billing.manage'
  | 'platform.telephony.manage'
  | 'platform.ai.manage'
  | 'platform.impersonation.use'
  | 'platform.audit.view'
  | 'platform.jobs.view'
  | 'platform.jobs.manage'
  | 'platform.flags.manage'
  | 'platform.settings.manage'

export type PlatformMembership = {
  platform_user_id: string
  user_id: string
  role: PlatformRole
  is_active: true
}
