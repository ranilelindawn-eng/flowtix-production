import { NextResponse } from 'next/server'
import { executePlatformAdminCommand, type PlatformAdminCommand } from '@/lib/platform-admin'

export async function POST(request: Request) {
  try {
    const command = (await request.json()) as PlatformAdminCommand
    if (!command || typeof command.action !== 'string' || typeof command.payload !== 'object') {
      return NextResponse.json({ error: 'Invalid administration command.' }, { status: 400 })
    }
    return NextResponse.json({ data: await executePlatformAdminCommand(command) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Administration command failed.' }, { status: 400 })
  }
}
