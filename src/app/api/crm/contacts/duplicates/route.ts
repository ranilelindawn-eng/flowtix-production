import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth'
import { findContactDuplicates } from '@/lib/contacts'

export async function GET(request: Request) {
  await requirePermission('contacts.view')
  const url = new URL(request.url)
  const duplicates = await findContactDuplicates({
    contactId: url.searchParams.get('contactId') ?? undefined,
    email: url.searchParams.get('email') ?? undefined,
    phone: url.searchParams.get('phone') ?? undefined,
  })

  return NextResponse.json({ duplicates })
}
