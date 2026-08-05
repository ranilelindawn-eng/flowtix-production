import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { findCalendarConflicts } from '@/lib/calendar/advanced'

export async function GET(request: Request) {
  await requirePermission('calendar.view')
  const url = new URL(request.url)
  const startsAt = url.searchParams.get('startsAt')
  const endsAt = url.searchParams.get('endsAt')
  if (!startsAt || !endsAt || Number.isNaN(new Date(startsAt).getTime()) || Number.isNaN(new Date(endsAt).getTime())) {
    return NextResponse.json({ error: 'Valid startsAt and endsAt values are required.' }, { status: 400 })
  }
  const conflicts = await findCalendarConflicts({
    startsAt,
    endsAt,
    ownerId: url.searchParams.get('ownerId'),
    excludeEventId: url.searchParams.get('eventId'),
  })
  return NextResponse.json({ conflicts })
}
