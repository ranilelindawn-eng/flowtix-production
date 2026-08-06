import 'server-only'

import type {
  PlatformAdminCommand,
  PlatformAdminOverview,
} from './types'

const PLATFORM_ADMIN_DISABLED_MESSAGE =
  'Platform administration is unavailable until the customer application has completed production validation.'

export async function getPlatformAdminOverview(): Promise<PlatformAdminOverview> {
  throw new Error(PLATFORM_ADMIN_DISABLED_MESSAGE)
}

export async function executePlatformAdminCommand(
  _command: PlatformAdminCommand,
): Promise<unknown> {
  void _command
  throw new Error(PLATFORM_ADMIN_DISABLED_MESSAGE)
}
