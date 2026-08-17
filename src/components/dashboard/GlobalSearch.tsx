'use client'

import {
  Activity,
  BriefcaseBusiness,
  Building2,
  CheckSquare2,
  CircleDot,
  Loader2,
  Megaphone,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { getUserFacingErrorMessage } from '@/lib/errors/user-facing'

type SearchResult = {
  id: string
  type:
    | 'contact'
    | 'company'
    | 'opportunity'
    | 'call'
    | 'campaign'
    | 'task'
    | 'activity'
    | 'module'
  title: string
  subtitle: string
  href: string
  group: string
}

function ResultIcon({
  type,
}: {
  type: SearchResult['type']
}) {
  const className = 'h-4 w-4'

  switch (type) {
    case 'contact':
      return <UserRound className={className} />
    case 'company':
      return <Building2 className={className} />
    case 'opportunity':
      return <BriefcaseBusiness className={className} />
    case 'campaign':
      return <Megaphone className={className} />
    case 'task':
      return <CheckSquare2 className={className} />
    case 'activity':
      return <Activity className={className} />
    case 'call':
      return <CircleDot className={className} />
    case 'module':
    default:
      return <Search className={className} />
  }
}

export default function GlobalSearch() {
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    const normalizedQuery = query.trim()

    if (normalizedQuery.length < 2) {
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setIsLoading(true)
      setError('')

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(normalizedQuery)}`,
          {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
          },
        )

        if (!response.ok) {
          throw new Error('Search request failed.')
        }

        const payload = (await response.json()) as {
          results?: SearchResult[]
        }

        const nextResults = payload.results ?? []
        setResults(nextResults)
        setActiveIndex(nextResults.length ? 0 : -1)
        setIsOpen(true)
      } catch (searchError) {
        if (
          searchError instanceof DOMException &&
          searchError.name === 'AbortError'
        ) {
          return
        }

        console.error('Unable to search Flowtix:', searchError)
        setResults([])
        setActiveIndex(-1)
        setError(
          getUserFacingErrorMessage(searchError, {
            context: 'search',
          }),
        )
        setIsOpen(true)
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }, 250)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [query])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    function handleGlobalShortcut(event: globalThis.KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault()
        inputRef.current?.focus()
        setIsOpen(true)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleGlobalShortcut)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleGlobalShortcut)
    }
  }, [])

  const groupedResults = useMemo(() => {
    const groups = new Map<string, SearchResult[]>()

    for (const result of results) {
      const group = groups.get(result.group) ?? []
      group.push(result)
      groups.set(result.group, group)
    }

    return Array.from(groups.entries())
  }, [results])

  function openResult(result: SearchResult) {
    setIsOpen(false)
    setQuery('')
    setResults([])
    setActiveIndex(-1)
    router.push(result.href)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setIsOpen(false)
      inputRef.current?.blur()
      return
    }

    if (!isOpen || results.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) =>
        current >= results.length - 1 ? 0 : current + 1,
      )
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) =>
        current <= 0 ? results.length - 1 : current - 1,
      )
      return
    }

    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      const selected = results[activeIndex]

      if (selected) {
        openResult(selected)
      }
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    const normalizedValue = value.trim()

    setQuery(value)

    if (normalizedValue.length < 2) {
      setResults([])
      setError('')
      setIsLoading(false)
      setActiveIndex(-1)
      setIsOpen(false)
      return
    }

    setIsOpen(true)
  }

  return (
    <div ref={rootRef} className="relative w-full xl:max-w-xl">
      <div className="flex w-full items-center rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-slate-300 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.8)] transition focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/15">
        {isLoading ? (
          <Loader2 className="mr-3 h-4 w-4 animate-spin text-blue-300" />
        ) : (
          <Search className="mr-3 h-4 w-4 text-slate-400" />
        )}

        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={() => {
            if (query.trim().length >= 2) {
              setIsOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
          type="search"
          placeholder="Search Flowtix"
          aria-label="Search Flowtix"
          aria-controls="flowtix-global-search-results"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
        />

        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setResults([])
              setError('')
              setIsOpen(false)
              setActiveIndex(-1)
              inputRef.current?.focus()
            }}
            aria-label="Clear search"
            className="ml-2 rounded-full p-1 text-slate-500 transition hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <span className="ml-3 hidden rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-medium text-slate-500 sm:inline">
            Ctrl K
          </span>
        )}
      </div>

      {isOpen ? (
        <div
          id="flowtix-global-search-results"
          role="listbox"
          aria-label="Flowtix search results"
          className="absolute left-0 right-0 z-[70] mt-3 max-h-[min(34rem,70vh)] overflow-y-auto rounded-3xl border border-white/10 bg-[#081421] p-2 shadow-[0_28px_80px_-28px_rgba(0,0,0,0.85)]"
        >
          {query.trim().length < 2 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              Type at least 2 characters to search.
            </div>
          ) : null}

          {query.trim().length >= 2 &&
          isLoading &&
          results.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching your workspace…
            </div>
          ) : null}

          {error ? (
            <div className="px-4 py-8 text-center text-sm text-red-300">
              {error}
            </div>
          ) : null}

          {!isLoading &&
          !error &&
          query.trim().length >= 2 &&
          results.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-white">
                No results found
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Try a name, email, phone number, company, campaign,
                deal, task, or status.
              </p>
            </div>
          ) : null}

          {groupedResults.map(([group, groupResults]) => (
            <section key={group} className="py-1">
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                {group}
              </p>

              <div className="space-y-1">
                {groupResults.map((result) => {
                  const resultIndex = results.findIndex(
                    (item) =>
                      item.id === result.id &&
                      item.type === result.type,
                  )
                  const isActive = resultIndex === activeIndex

                  return (
                    <button
                      key={`${result.type}:${result.id}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(resultIndex)}
                      onClick={() => openResult(result)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                        isActive
                          ? 'bg-blue-500/15 text-white'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                          isActive
                            ? 'border-blue-400/30 bg-blue-500/15 text-blue-200'
                            : 'border-white/10 bg-white/[0.03] text-slate-400'
                        }`}
                      >
                        <ResultIcon type={result.type} />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {result.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {result.subtitle}
                        </span>
                      </span>

                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-600">
                        Enter
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  )
}
