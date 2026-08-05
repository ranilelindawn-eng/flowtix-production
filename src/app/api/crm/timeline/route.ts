import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { getTimelineEvents } from '@/lib/timeline'

export async function GET(request: Request) {
  const organization = await requirePermission('contacts.view')
  const url = new URL(request.url)
  const events = await getTimelineEvents({
    organizationId: organization.organization_id,
    contactId: url.searchParams.get('contactId') ?? undefined,
    companyId: url.searchParams.get('companyId') ?? undefined,
    opportunityId: url.searchParams.get('opportunityId') ?? undefined,
    eventType: url.searchParams.get('type') ?? undefined,
    action: url.searchParams.get('action') ?? undefined,
    search: url.searchParams.get('q') ?? undefined,
    before: url.searchParams.get('before') ?? undefined,
    limit: Number.parseInt(url.searchParams.get('limit') ?? '100', 10),
  })
  return NextResponse.json({ events })
}
