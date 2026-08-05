import { requireOrganization } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type PipelineType = 'sales' | 'renewal' | 'expansion' | 'partner' | 'custom'
export type PipelineStatus = 'active' | 'inactive' | 'archived'
export type PipelineStageType = 'open' | 'won' | 'lost'

export async function findPipelineDuplicates(name: string, excludeId?: string) {
  await requireOrganization()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('find_pipeline_duplicates', {
    p_name: name,
    p_exclude_id: excludeId ?? null,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).filter((row: { id: string }) => row.id)
}

export async function getPipelineStages(pipelineId: string) {
  const membership = await requireOrganization()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('id,name,description,position,probability,stage_type,color,target_days,is_active,is_locked')
    .eq('organization_id', membership.organization_id)
    .eq('pipeline_id', pipelineId)
    .order('position')
  if (error) throw new Error(error.message)
  return data ?? []
}
