import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { ProductionReadinessOverview } from './types'

type RpcResult = { data: unknown; error: { message: string } | null }
type Rpc = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>

function rpc(client: Awaited<ReturnType<typeof createClient>>): Rpc {
  return client.rpc.bind(client) as unknown as Rpc
}

export async function getProductionReadinessOverview(): Promise<ProductionReadinessOverview> {
  await requireAdmin()
  const client = await createClient()
  const { data, error } = await rpc(client)('get_production_readiness_overview')
  if (error) throw new Error(error.message)
  return data as ProductionReadinessOverview
}

export async function runProductionValidation(): Promise<{ runId: string; score: number; status: string }> {
  const organization = await requireAdmin()
  const client = await createClient()
  const { data, error } = await rpc(client)('run_production_validation', { p_organization_id: organization.organization_id })
  if (error) throw new Error(error.message)
  return data as { runId: string; score: number; status: string }
}
