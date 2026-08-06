import Link from 'next/link'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  Sparkles,
} from 'lucide-react'

import { requirePermission } from '@/lib/auth'
import {
  getCurrentEntitlements,
  hasEntitlement,
} from '@/lib/entitlements'
import { createClient } from '@/lib/supabase/server'

import AIWorkspace, {
  type ConversationSummary,
} from './AIWorkspace'

function AIWorkspaceLocked({
  planName,
  subscriptionStatus,
}: {
  planName: string
  subscriptionStatus: string
}) {
  const statusLabel = subscriptionStatus
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-violet-300">
          <Sparkles className="h-4 w-4" />
          AI Workspace
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
          Flowtix AI is ready when your plan is
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Your account is working correctly. AI Workspace is a paid
          Professional, Business, or Enterprise capability and remains
          protected until the organization has an eligible active
          subscription.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
        <div className="border-b border-slate-800 bg-gradient-to-r from-violet-500/10 via-blue-500/5 to-transparent p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-500/15">
                <LockKeyhole className="h-6 w-6 text-violet-300" />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">
                  AI access is not included in the current plan
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Current plan: {planName} · Subscription: {statusLabel}
                </p>
              </div>
            </div>

            <Link
              href="/dashboard/billing?feature=ai.chat"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400"
            >
              <CreditCard className="h-4 w-4" />
              View eligible plans
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-3">
          {[
            {
              title: 'AI conversations',
              description:
                'Work with an AI assistant using organization-aware conversation history.',
            },
            {
              title: 'Context and memory',
              description:
                'Keep useful customer and workflow context across approved AI sessions.',
            },
            {
              title: 'Usage controls',
              description:
                'Apply plan limits, organization permissions, and auditable AI usage.',
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                {feature.title}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-800 bg-slate-900/40 px-6 py-4">
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <Bot className="h-5 w-5 text-violet-300" />
            AI API routes remain disabled until the required entitlement is
            active. Upgrading does not require changing this page or your
            organization data.
          </div>
        </div>
      </div>
    </div>
  )
}

export default async function AIPage() {
  const organization = await requirePermission('summaries.view')
  const entitlements = await getCurrentEntitlements()

  if (
    !entitlements ||
    !hasEntitlement(entitlements, 'ai.chat')
  ) {
    return (
      <AIWorkspaceLocked
        planName={entitlements?.planName ?? 'No active plan'}
        subscriptionStatus={
          entitlements?.subscriptionStatus ?? 'inactive'
        }
      />
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let conversations: ConversationSummary[] = []

  if (user) {
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('id,title,agent_key,updated_at')
      .eq(
        'organization_id',
        organization.organization_id,
      )
      .eq('created_by', user.id)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(50)

    if (error) {
      throw new Error(
        `Failed to load AI conversations: ${error.message}`,
      )
    }

    conversations =
      (data ?? []) as ConversationSummary[]
  }

  return (
    <AIWorkspace
      initialConversations={conversations}
    />
  )
}
