import {
  Building2,
  Briefcase,
  Calendar,
  Mail,
  Phone,
  UserRound,
  ShieldAlert,
  Gauge,
  Globe2,
} from 'lucide-react'

import type { Contact } from '@/types/contact'

type Props = {
  contact: Contact
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
          {label}
        </p>

        <div className="mt-1 break-words text-sm font-medium text-white">
          {value}
        </div>
      </div>
    </div>
  )
}

export default function ContactProfileCard({
  contact,
}: Props) {
  const fullName =
    `${contact.first_name} ${contact.last_name}`.trim() ||
    'Unnamed contact'

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.65)]">
      <div className="border-b border-white/10 px-6 py-5">
        <h2 className="text-lg font-semibold text-white">
          Contact Information
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Primary customer profile and account information.
        </p>
      </div>

      <div className="space-y-4 p-6">

        <Row
          icon={<UserRound className="h-5 w-5" />}
          label="Full Name"
          value={fullName}
        />

        <Row
          icon={<Mail className="h-5 w-5" />}
          label="Email"
          value={
            contact.email ? (
              <a
                href={`mailto:${contact.email}`}
                className="text-cyan-300 hover:text-cyan-200"
              >
                {contact.email}
              </a>
            ) : (
              '—'
            )
          }
        />

        <Row
          icon={<Phone className="h-5 w-5" />}
          label="Phone"
          value={
            contact.phone ? (
              <a
                href={`tel:${contact.phone}`}
                className="text-cyan-300 hover:text-cyan-200"
              >
                {contact.phone}
              </a>
            ) : (
              '—'
            )
          }
        />

        <Row
          icon={<Building2 className="h-5 w-5" />}
          label="Company"
          value={contact.company || '—'}
        />

        <Row
          icon={<Briefcase className="h-5 w-5" />}
          label="Job Title"
          value={contact.title || '—'}
        />

        <Row
          icon={<UserRound className="h-5 w-5" />}
          label="Preferred Name"
          value={contact.preferred_name || '—'}
        />

        <Row
          icon={<Gauge className="h-5 w-5" />}
          label="Lifecycle / Lead Score"
          value={`${contact.lifecycle_stage.replaceAll('_', ' ')} · ${contact.lead_score}/100`}
        />

        <Row
          icon={<Globe2 className="h-5 w-5" />}
          label="Source / Timezone"
          value={`${contact.source || 'manual'}${contact.timezone ? ` · ${contact.timezone}` : ''}`}
        />

        <Row
          icon={<ShieldAlert className="h-5 w-5" />}
          label="Communication Restrictions"
          value={[
            contact.do_not_email ? 'Email' : null,
            contact.do_not_sms ? 'SMS' : null,
            contact.do_not_call ? 'Calls' : null,
          ].filter(Boolean).join(', ') || 'None'}
        />

        <Row
          icon={<Calendar className="h-5 w-5" />}
          label="Created"
          value={formatDate(contact.created_at)}
        />

        <Row
          icon={<Calendar className="h-5 w-5" />}
          label="Last Updated"
          value={formatDate(contact.updated_at)}
        />

      </div>
    </section>
  )
}