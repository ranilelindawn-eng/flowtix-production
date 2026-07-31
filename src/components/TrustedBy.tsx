export default function TrustedBy() {
  const pillars = [
    ['Multi-tenant foundation', 'Organization-scoped data and Row Level Security policies.'],
    ['Server-side authentication', 'Supabase SSR sessions and protected dashboard routes.'],
    ['Structured CRM workflows', 'Contacts, tasks, notes, calls, campaigns, and activity timelines.'],
  ]
  return <section aria-label="Platform foundation" className="py-16"><div className="mx-auto max-w-7xl px-6"><div className="text-center"><p className="text-sm uppercase tracking-[0.28em] text-cyan-300">Platform foundation</p><h2 className="mt-4 text-3xl font-bold">Built for secure, organized conversation workflows.</h2><p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-400">Flowtix combines a production-oriented CRM foundation with provider-ready calling and conversation intelligence interfaces.</p></div><div className="mt-10 grid gap-5 md:grid-cols-3">{pillars.map(([title,description]) => <article key={title} className="rounded-3xl border border-white/10 bg-white/[0.04] p-7"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-400">{description}</p></article>)}</div></div></section>
}
