import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  PhoneCall,
  Users,
} from 'lucide-react'

import AddContactsDialog, {
  type AddContactsDialogContact,
  type AddContactsDialogState,
} from '@/components/campaign-members/AddContactsDialog'
import CampaignMemberFilters, {
  type CampaignMemberSort,
} from '@/components/campaign-members/CampaignMemberFilters'
import CampaignMembersTable from '@/components/campaign-members/CampaignMembersTable'
import CampaignQueueCard from '@/components/campaign-members/CampaignQueueCard'
import {
  bulkAddCampaignMembers,
  CAMPAIGN_MEMBERS_PER_PAGE,
  getCampaignMemberCounts,
  getCampaignMembers,
  type CampaignMemberStatus,
} from '@/lib/campaign-members'
import {
  getCampaign,
  type CampaignStatus,
} from '@/lib/campaigns'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { queueCampaignMembersAction } from './actions'

type CampaignMembersPageProps = {
  params: Promise<{
    id: string
  }>
  searchParams: Promise<{
    search?: string | string[]
    status?: string | string[]
    sort?: string | string[]
    page?: string | string[]
  }>
}

type ContactRow = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  company: string | null
  title: string | null
  status: 'active' | 'inactive' | 'archived'
}

const validMemberStatuses: CampaignMemberStatus[] = [
  'pending',
  'calling',
  'completed',
  'failed',
  'skipped',
]

const validSortValues: CampaignMemberSort[] = [
  'created_at',
  'priority',
  'contact_name',
  'last_called_at',
]

function getSingleSearchParameter(
  value: string | string[] | undefined,
): string {
  if (Array.isArray(value)) {
    return value[0] ?? ''
  }

  return value ?? ''
}

function normalizeStatus(
  value: string,
): CampaignMemberStatus | 'all' {
  if (
    validMemberStatuses.includes(
      value as CampaignMemberStatus,
    )
  ) {
    return value as CampaignMemberStatus
  }

  return 'all'
}

function normalizeSort(value: string): CampaignMemberSort {
  if (validSortValues.includes(value as CampaignMemberSort)) {
    return value as CampaignMemberSort
  }

  return 'created_at'
}

function normalizePage(value: string): number {
  const page = Number.parseInt(value, 10)

  if (!Number.isInteger(page) || page < 1) {
    return 1
  }

  return page
}

function getCampaignStatusClasses(
  status: CampaignStatus,
): string {
  switch (status) {
    case 'active':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'

    case 'paused':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-400'

    case 'completed':
      return 'border-blue-500/20 bg-blue-500/10 text-blue-400'

    case 'draft':
    default:
      return 'border-slate-500/20 bg-slate-500/10 text-slate-400'
  }
}

function createMembersPageHref({
  campaignId,
  search,
  status,
  sort,
  page,
}: {
  campaignId: string
  search: string
  status: CampaignMemberStatus | 'all'
  sort: CampaignMemberSort
  page: number
}): string {
  const parameters = new URLSearchParams()

  if (search.trim()) {
    parameters.set('search', search.trim())
  }

  if (status !== 'all') {
    parameters.set('status', status)
  }

  if (sort !== 'created_at') {
    parameters.set('sort', sort)
  }

  if (page > 1) {
    parameters.set('page', page.toString())
  }

  const queryString = parameters.toString()
  const pathname =
    `/dashboard/campaigns/${campaignId}/members`

  return queryString
    ? `${pathname}?${queryString}`
    : pathname
}

async function getOrganizationContacts(
  organizationId: string,
): Promise<AddContactsDialogContact[]> {
  const supabase = await createServerSupabaseClient()

  if (!supabase) {
    throw new Error(
      'Missing Supabase environment variables or authentication context.',
    )
  }

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()

  if (claimsError) {
    throw new Error(claimsError.message)
  }

  const userId = claimsData?.claims?.sub

  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('Unable to verify authenticated user.')
  }

  const { data, error } = await supabase
    .from('contacts')
    .select(
      `
        id,
        first_name,
        last_name,
        email,
        phone,
        company,
        title,
        status
      `,
    )
    .eq('organization_id', organizationId)
    .neq('status', 'archived')
    .order('first_name', { ascending: true })
    .order('last_name', { ascending: true })
    .limit(500)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as ContactRow[]
}

export default async function CampaignMembersPage({
  params,
  searchParams,
}: CampaignMembersPageProps) {
  const [{ id }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ])

  const campaign = await getCampaign(id)

  if (!campaign) {
    notFound()
  }

  const currentCampaign = campaign

  const search = getSingleSearchParameter(
    resolvedSearchParams.search,
  ).trim()

  const status = normalizeStatus(
    getSingleSearchParameter(resolvedSearchParams.status),
  )

  const sort = normalizeSort(
    getSingleSearchParameter(resolvedSearchParams.sort),
  )

  const requestedPage = normalizePage(
    getSingleSearchParameter(resolvedSearchParams.page),
  )

  const [initialMemberResult, counts, contacts] =
    await Promise.all([
      getCampaignMembers({
        campaignId: currentCampaign.id,
        search,
        status,
        sort,
        page: requestedPage,
      }),
      getCampaignMemberCounts(currentCampaign.id),
      getOrganizationContacts(
        currentCampaign.organization_id,
      ),
    ])

  const totalPages = Math.max(
    1,
    Math.ceil(
      initialMemberResult.count /
        CAMPAIGN_MEMBERS_PER_PAGE,
    ),
  )

  const currentPage = Math.min(
    requestedPage,
    totalPages,
  )

  const memberResult =
    currentPage === requestedPage
      ? initialMemberResult
      : await getCampaignMembers({
          campaignId: currentCampaign.id,
          search,
          status,
          sort,
          page: currentPage,
        })

  const existingContactIds = memberResult.members.map(
    (member) => member.contact_id,
  )

  async function addContactsAction(
    previousState: AddContactsDialogState,
    formData: FormData,
  ): Promise<AddContactsDialogState> {
    'use server'

    void previousState

    const submittedCampaignId = String(
      formData.get('campaignId') ?? '',
    ).trim()

    const contactIds = formData
      .getAll('contactIds')
      .map((value) => String(value).trim())
      .filter(Boolean)

    if (submittedCampaignId !== currentCampaign.id) {
      return {
        status: 'error',
        message: 'The submitted campaign is invalid.',
      }
    }

    if (contactIds.length === 0) {
      return {
        status: 'error',
        message: 'Select at least one contact.',
      }
    }

    try {
      const result = await bulkAddCampaignMembers({
        campaignId: currentCampaign.id,
        contactIds,
      })

      const messageParts = [
        `${result.addedCount} ${
          result.addedCount === 1
            ? 'contact was'
            : 'contacts were'
        } added.`,
      ]

      if (result.skippedCount > 0) {
        messageParts.push(
          `${result.skippedCount} ${
            result.skippedCount === 1
              ? 'contact was'
              : 'contacts were'
          } already in the campaign.`,
        )
      }

      return {
        status: 'success',
        message: messageParts.join(' '),
        addedCount: result.addedCount,
        skippedCount: result.skippedCount,
      }
    } catch (error) {
      return {
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to add contacts to the campaign.',
      }
    }
  }

  const firstVisibleMember =
    memberResult.count === 0
      ? 0
      : (currentPage - 1) *
          CAMPAIGN_MEMBERS_PER_PAGE +
        1

  const lastVisibleMember = Math.min(
    currentPage * CAMPAIGN_MEMBERS_PER_PAGE,
    memberResult.count,
  )

  const previousPageHref = createMembersPageHref({
    campaignId: currentCampaign.id,
    search,
    status,
    sort,
    page: Math.max(1, currentPage - 1),
  })

  const nextPageHref = createMembersPageHref({
    campaignId: currentCampaign.id,
    search,
    status,
    sort,
    page: Math.min(totalPages, currentPage + 1),
  })

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/10 bg-[#0B1726]/90 p-6 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)] sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <Link
              href={`/dashboard/campaigns/${currentCampaign.id}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition hover:text-white"
            >
              <ArrowLeft
                aria-hidden="true"
                className="size-4"
              />

              Back to campaign
            </Link>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
                Campaign members
              </p>

              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${getCampaignStatusClasses(
                  currentCampaign.status,
                )}`}
              >
                {currentCampaign.status}
              </span>
            </div>

            <h1 className="mt-3 break-words text-3xl font-semibold tracking-tight text-white">
              {currentCampaign.name}
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Manage contacts, review campaign progress, and
              organize the calling queue.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            {currentCampaign.status === 'active' ? (
              <form action={queueCampaignMembersAction}>
                <input
                  type="hidden"
                  name="campaignId"
                  value={currentCampaign.id}
                />
                <button
                  type="submit"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition hover:border-emerald-500/30 hover:bg-emerald-500/15 hover:text-emerald-200"
                >
                  Queue next 25
                </button>
              </form>
            ) : null}

            <Link
              href={`/dashboard/dialer?campaign=${currentCampaign.id}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-300 transition hover:border-cyan-500/30 hover:bg-cyan-500/15 hover:text-cyan-200"
            >
              <PhoneCall
                aria-hidden="true"
                className="size-4"
              />

              Open dialer
            </Link>

            <AddContactsDialog
              campaignId={currentCampaign.id}
              campaignName={currentCampaign.name}
              contacts={contacts}
              existingContactIds={existingContactIds}
              action={addContactsAction}
            />
          </div>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total members
                </p>

                <p className="mt-2 text-2xl font-bold text-white">
                  {counts.total}
                </p>
              </div>

              <div className="flex size-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
                <Users
                  aria-hidden="true"
                  className="size-5"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Ready to call
            </p>

            <p className="mt-2 text-2xl font-bold text-white">
              {counts.pending}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Pending campaign members
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Completed
            </p>

            <p className="mt-2 text-2xl font-bold text-white">
              {counts.completed}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Finished campaign members
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Needs attention
            </p>

            <p className="mt-2 text-2xl font-bold text-white">
              {counts.failed + counts.skipped}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Failed or skipped members
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <CampaignMemberFilters
            campaignId={currentCampaign.id}
            search={search}
            status={status}
            sort={sort}
          />

          <section>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Campaign contacts
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  {memberResult.count === 0
                    ? 'No campaign members match the current view.'
                    : `Showing ${firstVisibleMember}–${lastVisibleMember} of ${memberResult.count} members.`}
                </p>
              </div>

              {memberResult.count > 0 ? (
                <p className="text-xs text-slate-500">
                  Page {currentPage} of {totalPages}
                </p>
              ) : null}
            </div>

            <CampaignMembersTable
              members={memberResult.members}
            />
          </section>

          {totalPages > 1 ? (
            <nav
              aria-label="Campaign member pagination"
              className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0B1726]/90 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-sm text-slate-400">
                Page{' '}
                <span className="font-semibold text-white">
                  {currentPage}
                </span>{' '}
                of{' '}
                <span className="font-semibold text-white">
                  {totalPages}
                </span>
              </p>

              <div className="flex items-center gap-3">
                {currentPage > 1 ? (
                  <Link
                    href={previousPageHref}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  >
                    <ChevronLeft
                      aria-hidden="true"
                      className="size-4"
                    />

                    Previous
                  </Link>
                ) : (
                  <span className="inline-flex min-h-10 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-slate-600">
                    <ChevronLeft
                      aria-hidden="true"
                      className="size-4"
                    />

                    Previous
                  </span>
                )}

                {currentPage < totalPages ? (
                  <Link
                    href={nextPageHref}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  >
                    Next

                    <ChevronRight
                      aria-hidden="true"
                      className="size-4"
                    />
                  </Link>
                ) : (
                  <span className="inline-flex min-h-10 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-slate-600">
                    Next

                    <ChevronRight
                      aria-hidden="true"
                      className="size-4"
                    />
                  </span>
                )}
              </div>
            </nav>
          ) : null}
        </div>

        <aside>
          <CampaignQueueCard
            stats={{
              pending: counts.pending,
              calling: counts.calling,
              completed: counts.completed,
              failed: counts.failed,
              skipped: counts.skipped,
            }}
          />
        </aside>
      </div>
    </div>
  )
}