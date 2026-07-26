import type { ReactNode } from 'react'

import { SettingsNav } from '@/components/settings/SettingsNav'

export default function SettingsLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <aside className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">
          Settings
        </h2>

        <SettingsNav />
      </aside>

      <main>{children}</main>
    </div>
  )
}