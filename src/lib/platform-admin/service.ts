import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { PlatformAdminCommand, PlatformAdminOverview } from './types'

type RpcResult = { data: unknown; error: { message: string } | null }
type RpcFunction = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>

function rpcClient(client: Awaited<ReturnType<typeof createClient>>): RpcFunction {
  return client.rpc.bind(client) as unknown as RpcFunction
}

export async function getPlatformAdminOverview(): Promise<PlatformAdminOverview> {
  await requireAdmin()
  const client = await createClient()
  const { data, error } = await rpcClient(client)('get_platform_admin_overview')
  if (error) throw new Error(error.message)
  return data as PlatformAdminOverview
}

export async function executePlatformAdminCommand(command: PlatformAdminCommand): Promise<unknown> {
  await requireAdmin()
  const client = await createClient()
  const { data, error } = await rpcClient(client)('execute_platform_admin_command', {
    p_action: command.action,
    p_payload: command.payload,
  })
  if (error) throw new Error(error.message)
  return data
}
