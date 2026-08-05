import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { findPipelineDuplicates } from '@/lib/pipeline-advanced'

export async function GET(request: Request) {
  await requirePermission('opportunities.view')
  const url = new URL(request.url)
  return NextResponse.json({
    duplicates: await findPipelineDuplicates(
      url.searchParams.get('name') ?? '',
      url.searchParams.get('pipelineId') ?? undefined,
    ),
  })
}
