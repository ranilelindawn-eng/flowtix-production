'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'

import {
  searchDialerContacts,
  type DialerContact,
} from '@/app/dashboard/dialer/actions'

type ContactSearchProps = {
  disabled?: boolean
  onSelect: (contact: DialerContact) => void
}

const SEARCH_DEBOUNCE_MS = 300
const MINIMUM_QUERY_LENGTH = 2

export default function ContactSearch({
  disabled = false,
  onSelect,
}: ContactSearchProps) {
  const listboxId = useId()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DialerContact[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)

  const requestIdRef = useRef(0)

  const normalizedQuery = query.trim()

  const hasSearchQuery =
    normalizedQuery.length >= MINIMUM_QUERY_LENGTH

  const hasVisibleResults =
    hasSearchQuery &&
    !isSearching &&
    !searchError &&
    results.length > 0

  const activeResult =
    activeIndex >= 0 ? results[activeIndex] : undefined

  useEffect(() => {
    if (!hasSearchQuery || disabled) {
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const timeout = window.setTimeout(async () => {
      setIsSearching(true)
      setSearchError('')

      try {
        const contacts = await searchDialerContacts(
          normalizedQuery,
        )

        if (requestId === requestIdRef.current) {
          setResults(contacts)
          setActiveIndex(contacts.length > 0 ? 0 : -1)
        }
      } catch (error) {
        console.error(
          'Unable to search Dialer contacts:',
          error,
        )

        if (requestId === requestIdRef.current) {
          setResults([])
          setActiveIndex(-1)

          setSearchError(
            error instanceof Error
              ? error.message
              : 'Unable to search contacts.',
          )
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsSearching(false)
        }
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [disabled, hasSearchQuery, normalizedQuery])

  function resetSearchState() {
    setQuery('')
    setResults([])
    setSearchError('')
    setIsSearching(false)
    setActiveIndex(-1)
    requestIdRef.current += 1
  }

  function handleQueryChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const nextQuery = event.target.value

    setQuery(nextQuery)
    setSearchError('')
    setActiveIndex(-1)

    if (
      nextQuery.trim().length < MINIMUM_QUERY_LENGTH
    ) {
      requestIdRef.current += 1
      setResults([])
      setIsSearching(false)
    }
  }

  function handleSelect(contact: DialerContact) {
    if (disabled) {
      return
    }

    onSelect(contact)
    resetSearchState()
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === 'Escape') {
      if (query) {
        event.preventDefault()
        resetSearchState()
      }

      return
    }

    if (!hasVisibleResults) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()

      setActiveIndex((current) => {
        if (current >= results.length - 1) {
          return 0
        }

        return current + 1
      })

      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()

      setActiveIndex((current) => {
        if (current <= 0) {
          return results.length - 1
        }

        return current - 1
      })

      return
    }

    if (event.key === 'Enter' && activeResult) {
      event.preventDefault()
      handleSelect(activeResult)
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/10">
      <div>
        <h2 className="text-base font-semibold text-white">
          Search contacts
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Find a CRM contact by name, company, email, or
          phone number.
        </p>
      </div>

      <div className="relative mt-4">
        <label
          htmlFor="dialer-contact-search"
          className="sr-only"
        >
          Search CRM contacts
        </label>

        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-500"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="size-5"
          >
            <circle cx="11" cy="11" r="7" />

            <path
              d="m20 20-3.5-3.5"
              strokeLinecap="round"
            />
          </svg>
        </span>

        <input
          id="dialer-contact-search"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={hasVisibleResults}
          aria-controls={listboxId}
          aria-activedescendant={
            activeResult
              ? `${listboxId}-${activeResult.id}`
              : undefined
          }
          value={query}
          disabled={disabled}
          autoComplete="off"
          placeholder="Search contacts..."
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          className="min-h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-12 pr-12 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500/60 focus:bg-white/[0.06] focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        />

        {query ? (
          <button
            type="button"
            onClick={resetSearchState}
            disabled={disabled}
            aria-label="Clear contact search"
            className="absolute inset-y-0 right-3 flex items-center justify-center px-2 text-slate-500 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="size-5"
            >
              <path
                d="m7 7 10 10M17 7 7 17"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </div>

      {normalizedQuery.length > 0 &&
      normalizedQuery.length < MINIMUM_QUERY_LENGTH ? (
        <p className="mt-3 text-xs text-slate-500">
          Enter at least {MINIMUM_QUERY_LENGTH} characters
          to search.
        </p>
      ) : null}

      {isSearching ? (
        <div
          role="status"
          className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
        >
          <span className="size-4 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />

          <span className="text-sm text-slate-400">
            Searching contacts…
          </span>
        </div>
      ) : null}

      {searchError ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3"
        >
          <p className="text-sm font-medium text-red-200">
            Search failed
          </p>

          <p className="mt-1 text-sm text-red-300/80">
            {searchError}
          </p>
        </div>
      ) : null}

      {hasSearchQuery &&
      !isSearching &&
      !searchError &&
      results.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center">
          <p className="text-sm font-medium text-slate-300">
            No callable contacts found
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Try another name, company, email, or phone
            number.
          </p>
        </div>
      ) : null}

      {hasVisibleResults ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Contact search results"
            className="divide-y divide-white/10"
          >
            {results.map((contact, index) => {
              const isActive = index === activeIndex

              return (
                <li
                  key={contact.id}
                  id={`${listboxId}-${contact.id}`}
                  role="option"
                  aria-selected={isActive}
                >
                  <button
                    type="button"
                    disabled={disabled}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => handleSelect(contact)}
                    className={`flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 ${
                      isActive
                        ? 'bg-blue-500/10'
                        : 'bg-white/[0.02] hover:bg-white/[0.06]'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">
                        {contact.name}
                      </span>

                      {contact.company ? (
                        <span className="mt-0.5 block truncate text-xs text-slate-400">
                          {contact.company}
                        </span>
                      ) : null}

                      <span className="mt-1 block truncate text-xs text-slate-500">
                        {contact.phoneNumber}
                      </span>
                    </span>

                    <span className="shrink-0 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
                      Select
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <p className="border-t border-white/10 bg-white/[0.02] px-4 py-2 text-xs text-slate-500">
            Use ↑ and ↓ to navigate, then press Enter to
            select.
          </p>
        </div>
      ) : null}
    </section>
  )
}