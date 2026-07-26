import Link from 'next/link'
import {
  Calendar,
  Mail,
  Phone,
  Pencil,
  ClipboardCheck,
  FileText,
  Sparkles,
} from 'lucide-react'

import type { Contact } from '@/types/contact'

type Props = {
  contact: Contact
}

function ActionButton({
  href,
  icon,
  title,
  description,
  disabled = false,
}: {
  href?: string
  icon: React.ReactNode
  title: string
  description: string
  disabled?: boolean
}) {
  if (disabled || !href) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 opacity-50">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-slate-400">
            {icon}
          </div>

          <div>
            <h3 className="font-medium text-white">
              {title}
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              {description}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-cyan-400/20 hover:bg-cyan-400/5"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 transition group-hover:scale-110">
          {icon}
        </div>

        <div>
          <h3 className="font-medium text-white">
            {title}
          </h3>

          <p className="mt-1 text-xs leading-5 text-slate-400">
            {description}
          </p>
        </div>
      </div>
    </Link>
  )
}

export default function ContactQuickActions({
  contact,
}: Props) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.65)]">
      <div className="border-b border-white/10 px-6 py-5">
        <h2 className="text-lg font-semibold text-white">
          Quick Actions
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Frequently used CRM actions for this contact.
        </p>
      </div>

      <div className="grid gap-4 p-6">

        <ActionButton
          href={`/dashboard/dialer?contactId=${contact.id}`}
          title="Start Call"
          description="Open the cloud dialer."
          icon={<Phone className="h-5 w-5" />}
          disabled={!contact.phone}
        />

        <ActionButton
          href={
            contact.email
              ? `mailto:${contact.email}`
              : undefined
          }
          title="Send Email"
          description="Compose an email."
          icon={<Mail className="h-5 w-5" />}
          disabled={!contact.email}
        />

        <ActionButton
          href={`/dashboard/contacts/${contact.id}/edit`}
          title="Edit Contact"
          description="Update customer information."
          icon={<Pencil className="h-5 w-5" />}
        />

        <ActionButton
          title="Create Task"
          description="Assign a follow-up task."
          icon={<ClipboardCheck className="h-5 w-5" />}
          disabled
        />

        <ActionButton
          title="Book Meeting"
          description="Schedule a meeting."
          icon={<Calendar className="h-5 w-5" />}
          disabled
        />

        <ActionButton
          title="Notes"
          description="View customer notes."
          icon={<FileText className="h-5 w-5" />}
          disabled
        />

        <ActionButton
          title="AI Insights"
          description="Conversation analysis."
          icon={<Sparkles className="h-5 w-5" />}
          disabled
        />

      </div>
    </section>
  )
}