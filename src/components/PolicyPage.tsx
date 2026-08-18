import type { ReactNode } from 'react'
import { MarketingHero, MarketingShell } from '@/components/MarketingShell'

export default function PolicyPage({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <MarketingShell><MarketingHero eyebrow={eyebrow} title={title} description={description} /><article className="px-6 py-16"><div className="flowtix-glass-card prose prose-invert mx-auto max-w-4xl space-y-10 rounded-[28px] p-7 text-slate-300 sm:p-10 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-white [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-8">{children}</div></article></MarketingShell>
}
