'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'

import type { GuideArticle } from '@/lib/guide/articles'

type GuideSearchProps = {
  articles: GuideArticle[]
}

export default function GuideSearch({ articles }: GuideSearchProps) {
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!normalized) return articles

    return articles.filter((article) => {
      const haystack = [
        article.title,
        article.summary,
        article.category,
        article.moduleLabel ?? '',
        ...article.steps.flatMap((step) => [step.title, ...step.instructions]),
        ...(article.troubleshooting ?? []),
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalized)
    })
  }, [articles, normalized])

  return (
    <div className="space-y-5">
      <label className="relative block">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Flowtix guides, modules, or tasks..."
          className="w-full rounded-2xl border border-white/10 bg-[#0B1726]/90 py-4 pl-12 pr-4 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50"
        />
      </label>

      {normalized ? (
        <div>
          <p className="mb-3 text-sm text-slate-400">
            {filtered.length} {filtered.length === 1 ? 'guide' : 'guides'} found
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((article) => (
              <GuideCard key={article.slug} article={article} />
            ))}
          </div>
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-[#0B1726]/70 p-8 text-center text-slate-400">
              No guide matched that search. Try a module name such as Contacts, Sequences, Dialer, AI, Billing, or Security.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function GuideCard({ article }: { article: GuideArticle }) {
  return (
    <Link
      href={`/dashboard/guide/${article.slug}`}
      className="group flex h-full cursor-pointer flex-col rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6 transition hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-white/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-300">
            {article.category}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-white group-hover:text-cyan-100">
            {article.title}
          </h3>
        </div>
        <span className="text-lg text-slate-500 transition group-hover:translate-x-1 group-hover:text-cyan-300">→</span>
      </div>
      <p className="mt-4 flex-1 text-[15px] leading-7 text-slate-300">{article.summary}</p>
    </Link>
  )
}
