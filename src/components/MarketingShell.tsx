import type { ReactNode } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="flowtix-marketing-shell min-h-screen text-white">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  )
}

export function MarketingHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.06] px-6 py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(79,139,255,.18),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(139,92,246,.18),transparent_32%)]" />
      <div className="pointer-events-none absolute left-1/2 top-10 h-72 w-[46rem] -translate-x-1/2 rounded-[50%] border border-violet-400/10 opacity-70" />
      <div className="relative mx-auto max-w-5xl text-center">
        <p className="mx-auto mb-5 inline-flex items-center rounded-full border border-[#7B5CFF]/30 bg-[#7B5CFF]/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-200">
          {eyebrow}
        </p>
        <h1 className="text-balance text-4xl font-bold tracking-[-0.04em] sm:text-6xl">
          {title}
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-[#9CA3B8]">
          {description}
        </p>
      </div>
    </section>
  )
}

export function ContentSection({
  title,
  intro,
  children,
}: {
  title: string
  intro?: string
  children: ReactNode
}) {
  return (
    <section className="px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-bold tracking-[-0.03em] text-white">{title}</h2>
        {intro ? (
          <p className="mt-4 max-w-3xl leading-7 text-[#9CA3B8]">{intro}</p>
        ) : null}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  )
}

export function CardGrid({
  items,
}: {
  items: Array<{ title: string; description: string }>
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <article
          key={item.title}
          className="flowtix-glass-card group rounded-[24px] p-7 transition duration-300 hover:-translate-y-1.5"
        >
          <span className="mb-5 block h-1.5 w-12 rounded-full bg-gradient-to-r from-[#4F8BFF] via-[#8B5CF6] to-[#C05CFF] opacity-80 transition-all duration-300 group-hover:w-20" />
          <h3 className="text-xl font-semibold text-white">{item.title}</h3>
          <p className="mt-3 leading-7 text-[#9CA3B8]">{item.description}</p>
        </article>
      ))}
    </div>
  )
}

export function RelatedLinks({
  title = 'Continue exploring Flowtix',
  links,
}: {
  title?: string
  links: Array<{ title: string; description: string; href: string }>
}) {
  return (
    <ContentSection title={title}>
      <div className="grid gap-6 md:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flowtix-glass-card group rounded-[24px] p-7 transition duration-300 hover:-translate-y-1.5"
          >
            <h3 className="text-xl font-semibold text-white transition group-hover:text-violet-200">
              {link.title}
            </h3>
            <p className="mt-3 leading-7 text-[#9CA3B8]">{link.description}</p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#7CA8FF]">
              Explore {link.title}
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
            </span>
          </Link>
        ))}
      </div>
    </ContentSection>
  )
}
