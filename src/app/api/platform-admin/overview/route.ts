import { NextResponse } from 'next/server'
import { getPlatformAdminOverview } from '@/lib/platform-admin'

export async function GET() {
  try {
    return NextResponse.json(await getPlatformAdminOverview())
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load administration data.' }, { status: 403 })
  }
}
