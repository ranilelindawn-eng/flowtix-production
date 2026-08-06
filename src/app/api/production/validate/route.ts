import { NextResponse } from 'next/server'
import { runProductionValidation } from '@/lib/production'
export async function POST() {
  try { return NextResponse.json(await runProductionValidation(), { status: 201 }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to run production validation.' }, { status: 500 }) }
}
