import Link from 'next/link'
import { BookOpenText, CheckCircle2, Compass, LifeBuoy, Search } from 'lucide-react'

import GuideSearch, { GuideCard } from '@/components/guide/GuideSearch'
import { guideCategories, subscriberGuideArticles } from '@/lib/guide/articles'

export default function GuidePage() {
  const gettingStarted = subscriberGuideArticles.find((article) => article.slug === 'getting-started')
  const troubleshooting = subscriberGuideArticles.find((article) => article.slug === 'troubleshooting')

  return (
    <div className="relative left-1/2 w-full -translate-x-1/2 space-y-8 pb-16 lg:w-[calc(100vw-344px)] lg:max-w-[1680px]">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0B1726] to-[#0A1D32] p-7 sm:p-9">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-cyan-300">Flowtix Help Center</p>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Guide</h1>
            <p className="mt-3 text-base leading-7 text-slate-300">
              Step-by-step instructions for using Flowtix safely and correctly. Each guide tells you what to prepare, what to click, what a successful result looks like, and what to check when something fails.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:w-[430px]">
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4"><BookOpenText className="h-5 w-5 text-cyan-300"/><p className="mt-2 font-semibold text-white">{subscriberGuideArticles.length} guides</p><p className="mt-1 text-xs text-slate-400">Across the dashboard</p></div>
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-300"/><p className="mt-2 font-semibold text-white">Success checks</p><p className="mt-1 text-xs text-slate-400">Know when it worked</p></div>
            <div className="col-span-2 rounded-2xl border border-white/10 bg-black/10 p-4 sm:col-span-1"><LifeBuoy className="h-5 w-5 text-amber-300"/><p className="mt-2 font-semibold text-white">Troubleshooting</p><p className="mt-1 text-xs text-slate-400">Diagnose before changing</p></div>
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-white/10 bg-[#07111F]/40 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2 text-white"><Search className="h-5 w-5 text-cyan-300"/><h2 className="text-lg font-semibold">Find a guide</h2></div>
        <GuideSearch articles={subscriberGuideArticles} />
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><p className="text-sm uppercase tracking-[0.22em] text-cyan-300">Recommended first</p><h2 className="mt-1 text-2xl font-semibold text-white">Start here</h2></div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {gettingStarted ? <GuideCard article={gettingStarted} /> : null}
          {troubleshooting ? <GuideCard article={troubleshooting} /> : null}
        </div>
      </section>

      {guideCategories.map((category) => {
        const articles = subscriberGuideArticles.filter((article) => article.category === category && !['getting-started', 'troubleshooting'].includes(article.slug))
        if (articles.length === 0) return null
        return (
          <section key={category} className="space-y-4">
            <div className="flex items-center gap-3"><Compass className="h-5 w-5 text-cyan-300"/><h2 className="text-xl font-semibold text-white">{category}</h2><span className="rounded-full bg-white/5 px-2 py-1 text-xs text-slate-400">{articles.length}</span></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{articles.map((article) => <GuideCard key={article.slug} article={article} />)}</div>
          </section>
        )
      })}

      <section className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.04] p-6">
        <h2 className="text-lg font-semibold text-white">Need help while using a module?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">Use the floating <strong className="text-white">Guide</strong> button on any dashboard page. Flowtix will open the guide that best matches the module you are currently using.</p>
        <Link href="/dashboard/guide/troubleshooting" className="mt-4 inline-flex rounded-xl border border-cyan-300/20 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/10">Open troubleshooting guide</Link>
      </section>
    </div>
  )
}
