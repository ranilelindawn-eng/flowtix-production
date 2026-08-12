import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, CircleAlert, ExternalLink, Lightbulb, ListChecks } from 'lucide-react'

import { getGuideArticle, guideArticles } from '@/lib/guide/articles'

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return guideArticles.map((article) => ({ slug: article.slug }))
}

export default async function GuideArticlePage({ params }: Props) {
  const { slug } = await params
  const article = getGuideArticle(slug)
  if (!article) notFound()

  const related = (article.related ?? [])
    .map((relatedSlug) => getGuideArticle(relatedSlug))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  return (
    <article className="mx-auto max-w-4xl space-y-8 pb-16">
      <header>
        <Link href="/dashboard/guide" className="inline-flex items-center gap-2 text-sm font-medium text-cyan-300 hover:text-cyan-200"><ArrowLeft className="h-4 w-4"/>Back to Guide</Link>
        <p className="mt-7 text-sm uppercase tracking-[0.24em] text-cyan-300">{article.category}</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><h1 className="text-3xl font-semibold text-white sm:text-4xl">{article.title}</h1><p className="mt-3 max-w-3xl text-base leading-7 text-slate-300">{article.summary}</p></div>
          {article.moduleHref ? <Link href={article.moduleHref} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">{article.moduleLabel ?? 'Open module'}<ExternalLink className="h-4 w-4"/></Link> : null}
        </div>
      </header>

      {article.prerequisites?.length ? (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-5">
          <div className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-amber-300"/><h2 className="font-semibold text-white">Before you begin</h2></div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">{article.prerequisites.map((item) => <li key={item} className="flex gap-2"><span className="text-amber-300">•</span><span>{item}</span></li>)}</ul>
        </section>
      ) : null}

      <section className="space-y-5">
        <h2 className="text-2xl font-semibold text-white">Step-by-step</h2>
        {article.steps.map((step, index) => (
          <div key={step.title} className="rounded-3xl border border-white/10 bg-[#0B1726]/90 p-6">
            <div className="flex items-start gap-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{index + 1}</div><div className="min-w-0 flex-1"><h3 className="text-lg font-semibold text-white">{step.title}</h3><ol className="mt-4 space-y-3">{step.instructions.map((instruction, instructionIndex) => <li key={`${step.title}-${instructionIndex}`} className="flex gap-3 text-sm leading-6 text-slate-300"><span className="mt-0.5 text-xs font-semibold text-slate-500">{index + 1}.{instructionIndex + 1}</span><span>{instruction}</span></li>)}</ol>{step.tip ? <div className="mt-5 flex gap-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4 text-sm leading-6 text-slate-300"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300"/><span><strong className="text-white">Tip:</strong> {step.tip}</span></div> : null}</div></div>
          </div>
        ))}
      </section>

      {article.successChecks?.length ? (
        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.04] p-6">
          <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-300"/><h2 className="text-lg font-semibold text-white">How to know it worked</h2></div>
          <ul className="mt-4 space-y-3">{article.successChecks.map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-slate-300"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-300"/><span>{item}</span></li>)}</ul>
        </section>
      ) : null}

      {article.troubleshooting?.length ? (
        <section className="rounded-3xl border border-rose-400/20 bg-rose-400/[0.035] p-6">
          <div className="flex items-center gap-2"><CircleAlert className="h-5 w-5 text-rose-300"/><h2 className="text-lg font-semibold text-white">If it does not work</h2></div>
          <ul className="mt-4 space-y-3">{article.troubleshooting.map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-slate-300"><span className="text-rose-300">•</span><span>{item}</span></li>)}</ul>
        </section>
      ) : null}

      {related.length ? (
        <section><h2 className="text-lg font-semibold text-white">Related guides</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{related.map((item) => <Link key={item.slug} href={`/dashboard/guide/${item.slug}`} className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-4 hover:border-cyan-400/30"><p className="font-semibold text-white">{item.title}</p><p className="mt-1 text-sm text-slate-400">{item.summary}</p></Link>)}</div></section>
      ) : null}
    </article>
  )
}
