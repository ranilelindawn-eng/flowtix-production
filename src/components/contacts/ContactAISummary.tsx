import {
  ArrowUpRight,
  BrainCircuit,
  Clock3,
  Lightbulb,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import type { Contact } from '@/types/contact'

type ContactAISummaryProps = {
  contact: Contact
}

function getFullName(contact: Contact): string {
  return (
    [contact.first_name, contact.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || 'This contact'
  )
}

function getSummary(contact: Contact): string {
  const fullName = getFullName(contact)
  const company = contact.company?.trim()
  const title = ''

  if (company && title) {
    return `${fullName} is listed as ${title} at ${company}. Flowtix has not collected enough conversation data yet to generate a detailed AI relationship summary.`
  }

  if (company) {
    return `${fullName} is associated with ${company}. More calls, notes, and transcripts are needed before Flowtix can generate a detailed AI relationship summary.`
  }

  return `${fullName} does not yet have enough interaction history for a detailed AI relationship summary. Add calls, notes, or transcripts to improve future insights.`
}

function getRecommendedAction(contact: Contact): string {
  if (contact.phone) {
    return 'Place an introductory or follow-up call and record the outcome.'
  }

  if (contact.email) {
    return 'Send a personalized email and confirm the best phone number for future follow-up.'
  }

  return 'Add a phone number or email address before starting outreach.'
}

export default function ContactAISummary({
  contact,
}: ContactAISummaryProps) {
  const hasInteractionData = false
  const confidence = hasInteractionData ? 78 : 18

  return (
    <section className="overflow-hidden rounded-3xl border border-violet-400/15 bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(20,15,45,0.92))] shadow-[0_30px_90px_-55px_rgba(139,92,246,0.85)]">
      <div className="border-b border-white/10 px-6 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-400/10 text-violet-300">
              <BrainCircuit className="h-5 w-5" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-white">
                  AI Contact Summary
                </h2>

                <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-[11px] font-medium text-violet-200">
                  <Sparkles className="h-3 w-3" />
                  Flowtix AI
                </span>
              </div>

              <p className="mt-1 text-sm text-slate-400">
                Relationship context generated from contact and interaction data.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Confidence
            </div>

            <div className="mt-1 text-right text-sm font-semibold text-white">
              {confidence}%
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-6">
        <div className="rounded-2xl border border-violet-400/15 bg-violet-400/[0.06] p-5">
          <p className="text-sm leading-7 text-slate-200">
            {getSummary(contact)}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Clock3 className="h-4 w-4 text-cyan-300" />
              Last interaction
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-400">
              No completed interaction has been recorded for this contact yet.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Lightbulb className="h-4 w-4 text-amber-300" />
              Recommended next action
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-400">
              {getRecommendedAction(contact)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#08111F]/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-white">
              More data will improve this summary
            </p>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              Future call transcripts, notes, outcomes, and AI summaries will appear here automatically.
            </p>
          </div>

          <div className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-violet-300">
            Insights pending
            <ArrowUpRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </section>
  )
}