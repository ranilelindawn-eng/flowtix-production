import type { ReactNode } from 'react'

import { requirePermission } from '@/lib/auth'

export default async function CustomerRouteGuardLayout({
  children,
}: {
  children: ReactNode
}) {
  await requirePermission('campaigns.view')
  return children
}
