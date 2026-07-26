'use client'

import Link from 'next/link'
import {
  Eye,
  MoreHorizontal,
  Pencil,
  PhoneCall,
  RotateCcw,
  SkipForward,
  StickyNote,
  Trash2,
} from 'lucide-react'

import type {
  CampaignMember,
} from '@/lib/campaign-members'

type CampaignMemberFormAction = (
  formData: FormData,
) => void | Promise<void>

type CampaignMemberActionsProps = {
  member: CampaignMember
  campaignId: string
  retryAction?: CampaignMemberFormAction
  skipAction?: CampaignMemberFormAction
  resetAction?: CampaignMemberFormAction
  removeAction?: CampaignMemberFormAction
  notesHref?: string
  className?: string
}

type ActionFormProps = {
  action: CampaignMemberFormAction
  memberId: string
  campaignId: string
  label: string
  pendingLabel?: string
  destructive?: boolean
  icon: React.ReactNode
}

function ActionForm({
  action,
  memberId,
  campaignId,
  label,
  destructive = false,
  icon,
}: ActionFormProps) {
  return (
    <form action={action}>
      <input
        type="hidden"
        name="memberId"
        value={memberId}
      />

      <input
        type="hidden"
        name="campaignId"
        value={campaignId}
      />

      <button
        type="submit"
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          destructive
            ? 'text-red-300 hover:bg-red-500/10 hover:text-red-200'
            : 'text-slate-300 hover:bg-white/5 hover:text-white'
        }`}
      >
        <span
          aria-hidden="true"
          className="shrink-0"
        >
          {icon}
        </span>

        <span>{label}</span>
      </button>
    </form>
  )
}

function MenuLink({
  href,
  label,
  icon,
}: {
  href: string
  label: string
  icon: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <span
        aria-hidden="true"
        className="shrink-0"
      >
        {icon}
      </span>

      <span>{label}</span>
    </Link>
  )
}

function canRetryMember(member: CampaignMember): boolean {
  return (
    member.status === 'failed' ||
    member.status === 'skipped' ||
    member.status === 'completed'
  )
}

function canSkipMember(member: CampaignMember): boolean {
  return (
    member.status === 'pending' ||
    member.status === 'calling' ||
    member.status === 'failed'
  )
}

function canResetMember(member: CampaignMember): boolean {
  return member.status !== 'pending'
}

export default function CampaignMemberActions({
  member,
  campaignId,
  retryAction,
  skipAction,
  resetAction,
  removeAction,
  notesHref,
  className = '',
}: CampaignMemberActionsProps) {
  const contactId = member.contact?.id
  const contactName = member.contact
    ? `${member.contact.first_name ?? ''} ${
        member.contact.last_name ?? ''
      }`.trim() || 'contact'
    : 'contact'

  const resolvedNotesHref =
    notesHref ??
    `/dashboard/campaigns/${campaignId}/members/${member.id}`

  return (
    <details
      className={`group relative inline-block text-left ${className}`}
    >
      <summary
        aria-label={`Open actions for ${contactName}`}
        title={`Actions for ${contactName}`}
        className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition marker:hidden hover:border-white/20 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal
          aria-hidden="true"
          className="size-4"
        />
      </summary>

      <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#081321] p-2 shadow-2xl shadow-black/40">
        <div className="px-3 pb-2 pt-1">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Member actions
          </p>

          <p className="mt-1 truncate text-sm font-medium text-white">
            {contactName}
          </p>
        </div>

        <div className="border-t border-white/10 pt-2">
          {contactId ? (
            <>
              <MenuLink
                href={`/dashboard/contacts/${contactId}`}
                label="View contact"
                icon={<Eye className="size-4" />}
              />

              <MenuLink
                href={`/dashboard/contacts/${contactId}/edit`}
                label="Edit contact"
                icon={<Pencil className="size-4" />}
              />
            </>
          ) : (
            <div className="rounded-xl px-3 py-2.5 text-sm text-slate-600">
              Contact record unavailable
            </div>
          )}

          <MenuLink
            href={resolvedNotesHref}
            label="View or add notes"
            icon={<StickyNote className="size-4" />}
          />
        </div>

        {retryAction ||
        skipAction ||
        resetAction ? (
          <div className="mt-2 border-t border-white/10 pt-2">
            {retryAction && canRetryMember(member) ? (
              <ActionForm
                action={retryAction}
                memberId={member.id}
                campaignId={campaignId}
                label="Retry call"
                icon={<PhoneCall className="size-4" />}
              />
            ) : null}

            {skipAction && canSkipMember(member) ? (
              <ActionForm
                action={skipAction}
                memberId={member.id}
                campaignId={campaignId}
                label="Skip contact"
                icon={<SkipForward className="size-4" />}
              />
            ) : null}

            {resetAction && canResetMember(member) ? (
              <ActionForm
                action={resetAction}
                memberId={member.id}
                campaignId={campaignId}
                label="Reset to pending"
                icon={<RotateCcw className="size-4" />}
              />
            ) : null}
          </div>
        ) : null}

        {removeAction ? (
          <div className="mt-2 border-t border-white/10 pt-2">
            <ActionForm
              action={removeAction}
              memberId={member.id}
              campaignId={campaignId}
              label="Remove from campaign"
              destructive
              icon={<Trash2 className="size-4" />}
            />
          </div>
        ) : null}
      </div>
    </details>
  )
}