export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  return Response.json(
    {
      error: 'This legacy telephony endpoint has been retired. Flowtix uses SignalWire only.',
      code: 'LEGACY_TELEPHONY_PROVIDER_RETIRED',
    },
    { status: 410 },
  )
}
