export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  return Response.json(
    {
      error: 'Inbound calling is not supported. Flowtix is outbound-only.',
      code: 'INBOUND_CALLING_RETIRED',
    },
    { status: 410 },
  )
}
