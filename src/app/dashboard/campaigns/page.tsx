import Link from 'next/link'

import { requirePermission } from '@/lib/auth'
import CampaignTable from '@/components/campaigns/CampaignTable'
import {
  CAMPAIGNS_PER_PAGE,
  getCampaigns,
  type CampaignStatus,
} from '@/lib/campaigns'

type CampaignsPageProps = {
  searchParams: Promise<{
    search?: string | string[]
    status?: string | string[]
    sort?: string | string[]
    page?: string | string[]
  }>
}

type CampaignSort = 'created_at' | 'name' | 'start_date'

const STATUS_OPTIONS: Array<{
  value: CampaignStatus | 'all'
  label: string
}> = [
  {
    value: 'all',
    label: 'All statuses',
  },
  {
    value: 'draft',
    label: 'Draft',
  },
  {
    value: 'active',
    label: 'Active',
  },
  {
    value: 'paused',
    label: 'Paused',
  },
  {
    value: 'completed',
    label: 'Completed',
  },
]

const SORT_OPTIONS: Array<{
  value: CampaignSort
  label: string
}> = [
  {
    value: 'created_at',
    label: 'Newest first',
  },
  {
    value: 'name',
    label: 'Campaign name',
  },
  {
    value: 'start_date',
    label: 'Start date',
  },
]

function getSearchParam(
  value: string | string[] | undefined,
): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function getPageNumber(value: string): number {
  const parsedPage = Number.parseInt(value, 10)

  if (!Number.isFinite(parsedPage) || parsedPage < 1) {
    return 1
  }

  return parsedPage
}

function getCampaignStatus(
  value: string,
): CampaignStatus | 'all' {
  switch (value) {
    case 'draft':
    case 'active':
    case 'paused':
    case 'completed':
      return value

    default:
      return 'all'
  }
}

function getCampaignSort(value: string): CampaignSort {
  switch (value) {
    case 'name':
    case 'start_date':
      return value

    default:
      return 'created_at'
  }
}

function createCampaignsUrl({
  search,
  status,
  sort,
  page,
}: {
  search: string
  status: CampaignStatus | 'all'
  sort: CampaignSort
  page: number
}): string {
  const params = new URLSearchParams()

  if (search) {
    params.set('search', search)
  }

  if (status !== 'all') {
    params.set('status', status)
  }

  if (sort !== 'created_at') {
    params.set('sort', sort)
  }

  if (page > 1) {
    params.set('page', String(page))
  }

  const queryString = params.toString()

  return queryString
    ? `/dashboard/campaigns?${queryString}`
    : '/dashboard/campaigns'
}

function getVisiblePages(
  currentPage: number,
  totalPages: number,
): number[] {
  if (totalPages <= 5) {
    return Array.from(
      {
        length: totalPages,
      },
      (_, index) => index + 1,
    )
  }

  const startPage = Math.max(
    1,
    Math.min(currentPage - 2, totalPages - 4),
  )

  return Array.from(
    {
      length: 5,
    },
    (_, index) => startPage + index,
  )
}

export default async function CampaignsPage({
  searchParams,
}: CampaignsPageProps) {
  const resolvedSearchParams = await searchParams

  await requirePermission('campaigns.view')

  const search = getSearchParam(
    resolvedSearchParams.search,
  ).trim()

  const status = getCampaignStatus(
    getSearchParam(resolvedSearchParams.status),
  )

  const sort = getCampaignSort(
    getSearchParam(resolvedSearchParams.sort),
  )

  const requestedPage = getPageNumber(
    getSearchParam(resolvedSearchParams.page),
  )

  const initialResult = await getCampaigns({
    search,
    status,
    sort,
    page: requestedPage,
  })

  const totalPages =
    initialResult.count === 0
      ? 0
      : Math.ceil(
          initialResult.count / CAMPAIGNS_PER_PAGE,
        )

  const currentPage =
    totalPages > 0
      ? Math.min(requestedPage, totalPages)
      : 1

  const result =
    currentPage !== requestedPage
      ? await getCampaigns({
          search,
          status,
          sort,
          page: currentPage,
        })
      : initialResult

  const visiblePages = getVisiblePages(
    currentPage,
    totalPages,
  )

  const firstResult =
    result.count === 0
      ? 0
      : (currentPage - 1) * CAMPAIGNS_PER_PAGE + 1

  const lastResult = Math.min(
    currentPage * CAMPAIGNS_PER_PAGE,
    result.count,
  )

  const hasActiveFilters =
    search.length > 0 ||
    status !== 'all' ||
    sort !== 'created_at'

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-400">
            Outreach
          </p>

          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
            Campaigns
          </h1>

          <p className="mt-1 text-sm leading-6 text-slate-400">
            Organize calling campaigns and track their current
            status.
          </p>
        </div>

        <Link
          href="/dashboard/campaigns/new"
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          New Campaign
        </Link>
      </header>

      <section className="rounded-3xl border border-white/10 bg-[#0B1726]/90 p-5 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
        <form
          key={`${search}:${status}:${sort}`}
          method="get"
          className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px_220px_auto]"
        >
          <div>
            <label
              htmlFor="campaign-search"
              className="mb-2 block text-sm font-medium text-slate-300"
            >
              Search campaigns
            </label>

            <input
              id="campaign-search"
              name="search"
              type="search"
              defaultValue={search}
              placeholder="Search by campaign name or description"
              className="min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label
              htmlFor="campaign-status"
              className="mb-2 block text-sm font-medium text-slate-300"
            >
              Status
            </label>

            <select
              id="campaign-status"
              name="status"
              defaultValue={status}
              className="min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] px-4 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              {STATUS_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="campaign-sort"
              className="mb-2 block text-sm font-medium text-slate-300"
            >
              Sort by
            </label>

            <select
              id="campaign-sort"
              name="sort"
              defaultValue={sort}
              className="min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] px-4 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              {SORT_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-3">
            <button
              type="submit"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950 lg:flex-none"
            >
              Apply
            </button>

            {hasActiveFilters ? (
              <Link
                href="/dashboard/campaigns"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white lg:flex-none"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-white">
              All campaigns
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              {result.count === 1
                ? '1 campaign'
                : `${result.count} campaigns`}
            </p>
          </div>

          {result.count > 0 ? (
            <p className="text-sm text-slate-500">
              Showing {firstResult}–{lastResult} of{' '}
              {result.count}
            </p>
          ) : null}
        </div>

        <CampaignTable campaigns={result.campaigns} />
      </section>

      {totalPages > 1 ? (
        <nav
          aria-label="Campaigns pagination"
          className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0B1726]/70 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-slate-400">
            Page {currentPage} of {totalPages}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {currentPage > 1 ? (
              <Link
                href={createCampaignsUrl({
                  search,
                  status,
                  sort,
                  page: currentPage - 1,
                })}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              >
                Previous
              </Link>
            ) : (
              <span className="inline-flex min-h-10 cursor-not-allowed items-center justify-center rounded-lg border border-white/5 bg-white/[0.02] px-4 text-sm text-slate-600">
                Previous
              </span>
            )}

            {visiblePages.map((pageNumber) => {
              const isCurrent =
                pageNumber === currentPage

              return isCurrent ? (
                <span
                  key={pageNumber}
                  aria-current="page"
                  className="inline-flex size-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white"
                >
                  {pageNumber}
                </span>
              ) : (
                <Link
                  key={pageNumber}
                  href={createCampaignsUrl({
                    search,
                    status,
                    sort,
                    page: pageNumber,
                  })}
                  className="inline-flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  {pageNumber}
                </Link>
              )
            })}

            {currentPage < totalPages ? (
              <Link
                href={createCampaignsUrl({
                  search,
                  status,
                  sort,
                  page: currentPage + 1,
                })}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              >
                Next
              </Link>
            ) : (
              <span className="inline-flex min-h-10 cursor-not-allowed items-center justify-center rounded-lg border border-white/5 bg-white/[0.02] px-4 text-sm text-slate-600">
                Next
              </span>
            )}
          </div>
        </nav>
      ) : null}
    </div>
  )
}