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
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <aside className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">Settings</h2>
        <SettingsNav role={organization.role} />
      </aside>

      <main>{children}</main>
    </div>
  )
}
