export type PlatformAdminOverview = {
  organization: { id: string; name: string; status: string; slug: string | null }
  counts: { members: number; teams: number; roles: number; featureFlags: number; openJobs: number; failedJobs: number; openThreats: number }
  members: Array<{ id: string; userId: string; email: string | null; fullName: string | null; role: string; status: string; teamNames: string[] }>
  teams: Array<{ id: string; name: string; description: string | null; memberCount: number; isActive: boolean }>
  roles: Array<{ id: string; name: string; description: string | null; permissionCount: number; isSystem: boolean }>
  featureFlags: Array<{ key: string; name: string; enabled: boolean; rolloutPercentage: number }>
  configuration: Array<{ key: string; value: unknown; description: string | null; isSensitive: boolean }>
  operations: Array<{ metric: string; value: number; status: 'healthy' | 'warning' | 'critical' }>
}

export type PlatformAdminCommand =
  | { action: 'update_organization'; payload: { name?: string; status?: string; slug?: string } }
  | { action: 'create_team'; payload: { name: string; description?: string } }
  | { action: 'update_member'; payload: { membershipId: string; role?: string; status?: string; teamId?: string | null } }
  | { action: 'create_role'; payload: { name: string; description?: string; permissions?: string[] } }
  | { action: 'set_feature_flag'; payload: { key: string; enabled: boolean; rolloutPercentage?: number } }
  | { action: 'set_configuration'; payload: { key: string; value: unknown; description?: string } }
