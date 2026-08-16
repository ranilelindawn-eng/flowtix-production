import type { ReactNode } from 'react'

import { SettingsNav } from '@/components/settings/SettingsNav'
import { requirePermission } from '@/lib/auth'

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode
}) {
  const organization = await requirePermission('settings.view')

  return (
    <div className="grid min-w-0 gap-6 lg:relative lg:left-1/2 lg:w-[calc(100vw-344px)] lg:-translate-x-1/2 lg:grid-cols-[220px_minmax(0,1fr)] xl:gap-8 xl:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="h-fit rounded-xl border border-border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">Settings</h2>
        <SettingsNav role={organization.role} />
      </aside>

      <main className="min-w-0">{children}</main>
    </div>
  )
}
