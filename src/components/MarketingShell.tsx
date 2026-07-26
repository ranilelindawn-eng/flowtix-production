import type { ReactNode } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#07111F] text-white">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  )
}

export function MarketingHero({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <section className="relative overflow-hidden border-b border-white/10 px-6 py-24 sm:py-32">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,.25),transparent_38%),radial-gradient(circle_at_80%_30%,rgba(34,211,238,.16),transparent_30%)]" />
      <div className="mx-auto max-w-5xl text-center">
        <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">{eyebrow}</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">{title}</h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300">{description}</p>
      </div>
    </section>
  )
}

export function ContentSection({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
        {intro ? <p className="mt-4 max-w-3xl leading-7 text-slate-300">{intro}</p> : null}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  )
}

export function CardGrid({ items }: { items: Array<{ title: string; description: string }> }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <article key={item.title} className="rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl shadow-black/10">
          <h3 className="text-xl font-semibold">{item.title}</h3>
          <p className="mt-3 leading-7 text-slate-300">{item.description}</p>
        </article>
      ))}
    </div>
  )
}
