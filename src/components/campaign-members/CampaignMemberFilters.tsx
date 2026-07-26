import Link from 'next/link'
import {
  ArrowDownUp,
  Filter,
  Search,
  X,
} from 'lucide-react'

import type {
  CampaignMemberStatus,
} from '@/lib/campaign-members'

export type CampaignMemberSort =
  | 'created_at'
  | 'priority'
  | 'contact_name'
  | 'last_called_at'

type CampaignMemberFiltersProps = {
  campaignId: string
  search?: string
  status?: CampaignMemberStatus | 'all'
  sort?: CampaignMemberSort
}

const statusOptions: Array<{
  value: CampaignMemberStatus | 'all'
  label: string
}> = [
  {
    value: 'all',
    label: 'All statuses',
  },
  {
    value: 'pending',
    label: 'Pending',
  },
  {
    value: 'calling',
    label: 'Calling',
  },
  {
    value: 'completed',
    label: 'Completed',
  },
  {
    value: 'failed',
    label: 'Failed',
  },
  {
    value: 'skipped',
    label: 'Skipped',
  },
]

const sortOptions: Array<{
  value: CampaignMemberSort
  label: string
}> = [
  {
    value: 'created_at',
    label: 'Newest added',
  },
  {
    value: 'priority',
    label: 'Highest priority',
  },
  {
    value: 'contact_name',
    label: 'Contact name',
  },
  {
    value: 'last_called_at',
    label: 'Last called',
  },
]

export default function CampaignMemberFilters({
  campaignId,
  search = '',
  status = 'all',
  sort = 'created_at',
}: CampaignMemberFiltersProps) {
  const hasActiveFilters =
    search.trim().length > 0 ||
    status !== 'all' ||
    sort !== 'created_at'

  const membersPath =
    `/dashboard/campaigns/${campaignId}/members`

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0B1726]/90 p-5 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)] sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
          <Filter
            aria-hidden="true"
            className="size-4"
          />
        </div>

        <div>
          <h2 className="font-semibold text-white">
            Filter campaign members
          </h2>

          <p className="mt-1 text-sm leading-6 text-slate-400">
            Search contacts and organize the campaign queue.
          </p>
        </div>
      </div>

      <form
        action={membersPath}
        method="get"
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto]"
      >
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Search
          </span>

          <span className="relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500"
            />

            <input
              type="search"
              name="search"
              defaultValue={search}
              placeholder="Name, email, phone, or company"
              className="min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
            />
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
          </span>

          <span className="relative block">
            <Filter
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500"
            />

            <select
              name="status"
              defaultValue={status}
              className="min-h-11 w-full appearance-none rounded-xl border border-white/10 bg-[#07111F] py-2.5 pl-10 pr-10 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
            >
              {statusOptions.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>

            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500"
            >
              ▼
            </span>
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sort
          </span>

          <span className="relative block">
            <ArrowDownUp
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500"
            />

            <select
              name="sort"
              defaultValue={sort}
              className="min-h-11 w-full appearance-none rounded-xl border border-white/10 bg-[#07111F] py-2.5 pl-10 pr-10 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
            >
              {sortOptions.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>

            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500"
            >
              ▼
            </span>
          </span>
        </label>

        <div className="flex items-end gap-3">
          <button
            type="submit"
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950 lg:flex-none"
          >
            <Search
              aria-hidden="true"
              className="size-4"
            />

            Apply
          </button>

          {hasActiveFilters ? (
            <Link
              href={membersPath}
              aria-label="Clear campaign member filters"
              title="Clear filters"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:border-white/20 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <X
                aria-hidden="true"
                className="size-4"
              />
            </Link>
          ) : null}
        </div>
      </form>

      {hasActiveFilters ? (
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/10 pt-5">
          <span className="text-xs font-medium text-slate-500">
            Active filters:
          </span>

          {search.trim() ? (
            <span className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300">
              Search: {search.trim()}
            </span>
          ) : null}

          {status !== 'all' ? (
            <span className="inline-flex rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium capitalize text-cyan-300">
              Status: {status}
            </span>
          ) : null}

          {sort !== 'created_at' ? (
            <span className="inline-flex rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-300">
              Sort:{' '}
              {
                sortOptions.find(
                  (option) => option.value === sort,
                )?.label
              }
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}