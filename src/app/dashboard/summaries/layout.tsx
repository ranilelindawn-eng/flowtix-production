import type { ReactNode } from 'react'

import { requirePermission } from '@/lib/auth'

export default async function CustomerRouteGuardLayout({
  children,
}: {
  children: ReactNode
}) {
  await requirePermission('summaries.view')
  return children
}
