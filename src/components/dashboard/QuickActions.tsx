import Link from 'next/link'
import type { ReactNode } from 'react'

type QuickAction = {
  href: string
  title: string
  description: string
  icon?: ReactNode
  badge?: string
}

type QuickActionsProps = {
  title?: string
  description?: string
  actions: QuickAction[]
}

export default function QuickActions({
  title = 'Quick Actions',
  description = 'Jump directly to your most common CRM tasks.',
  actions,
}: QuickActionsProps) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.65)]">
      <div className="border-b border-white/10 px-6 py-5">
        <h2 className="text-lg font-semibold text-white">
          {title}
        </h2>

        <p className="mt-1 text-sm leading-6 text-slate-400">
          {description}
        </p>
      </div>

      <div className="grid gap-4 p-6">
        {actions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="group relative overflow-hidden rounded-3xl border border-white/10 bg-[#111E33]/70 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/20 hover:bg-[#152744]"
          >
            <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-cyan-400/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

            <div className="relative flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                {action.icon ?? (
                  <span className="text-lg font-bold">→</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-white transition group-hover:text-cyan-200">
                    {action.title}
                  </h3>

                  {action.badge ? (
                    <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                      {action.badge}
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {action.description}
                </p>
              </div>

              <div className="text-slate-500 transition duration-300 group-hover:translate-x-1 group-hover:text-cyan-300">
                →
              </div>
            </div>
          </Link>
        ))}

        {actions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-[#111E33]/40 p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-400">
              +
            </div>

            <h3 className="mt-4 text-lg font-semibold text-white">
              No actions available
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Quick actions will appear here as new modules are enabled.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  )
}