import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import OwnerSelect from '@/components/ownership/OwnerSelect'
import { getAssignableMembers } from '@/lib/ownership'

import { updateOpportunity } from '@/app/dashboard/crm-actions'

const input =
  'min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white outline-none focus:border-blue-500'

export default async function EditOpportunityPage({
  params,
}: {
  params: Promise<{ id: string; opportunityId: string }>
}) {
  const { id: pipelineId, opportunityId } = await params
  const membership = await requirePermission('opportunities.update')
  const supabase = await createClient()

  const [
    { data: pipeline, error: pipelineError },
    { data: opportunity, error: opportunityError },
    { data: stages },
    { data: companies },
    { data: contacts },
    owners,
  ] = await Promise.all([
    supabase
      .from('pipelines')
      .select('id,name')
      .eq('organization_id', membership.organization_id)
      .eq('id', pipelineId)
      .maybeSingle(),
    supabase
      .from('opportunities')
      .select(
        'id,pipeline_id,stage_id,company_id,contact_id,name,value,currency,probability,expected_close_date,description,owner_membership_id',
      )
      .eq('organization_id', membership.organization_id)
      .eq('pipeline_id', pipelineId)
      .eq('id', opportunityId)
      .maybeSingle(),
    supabase
      .from('pipeline_stages')
      .select('id,name,position')
      .eq('organization_id', membership.organization_id)
      .eq('pipeline_id', pipelineId)
      .order('position'),
    supabase
      .from('companies')
      .select('id,name')
      .eq('organization_id', membership.organization_id)
      .order('name'),
    supabase
      .from('contacts')
      .select('id,first_name,last_name,email')
      .eq('organization_id', membership.organization_id)
      .order('first_name'),
    getAssignableMembers(membership),
  ])

  if (pipelineError) {
    throw new Error(`Failed to load pipeline: ${pipelineError.message}`)
  }

  if (opportunityError) {
    throw new Error(`Failed to load opportunity: ${opportunityError.message}`)
  }

  if (!pipeline || !opportunity) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href={`/dashboard/pipelines/${pipelineId}`}
          className="text-sm font-medium text-cyan-400 hover:text-cyan-300"
        >
          ← {pipeline.name}
        </Link>

        <p className="mt-4 text-sm uppercase tracking-[.24em] text-cyan-400">
          Opportunity management
        </p>

        <h1 className="mt-2 text-3xl font-semibold text-white">
          Edit opportunity
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          Update deal details, ownership associations, value, probability, and
          expected close date.
        </p>
      </div>

      <form
        action={updateOpportunity}
        className="grid gap-5 rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6 md:grid-cols-2"
      >
        <input type="hidden" name="id" value={opportunity.id} />
        <input type="hidden" name="pipeline_id" value={pipeline.id} />

        <label className="text-sm text-slate-300 md:col-span-2">
          Opportunity name
          <input
            required
            name="name"
            defaultValue={opportunity.name}
            className={`${input} mt-2`}
          />
        </label>

        <label className="text-sm text-slate-300">
          Stage
          <select
            required
            name="stage_id"
            defaultValue={opportunity.stage_id}
            className={`${input} mt-2`}
          >
            {stages?.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-slate-300">
          Probability
          <input
            required
            type="number"
            name="probability"
            min="0"
            max="100"
            step="1"
            defaultValue={opportunity.probability ?? 0}
            className={`${input} mt-2`}
          />
        </label>

        <label className="text-sm text-slate-300">
          Value
          <input
            required
            type="number"
            name="value"
            min="0"
            step="0.01"
            defaultValue={opportunity.value ?? 0}
            className={`${input} mt-2`}
          />
        </label>

        <label className="text-sm text-slate-300">
          Currency
          <select
            name="currency"
            defaultValue={opportunity.currency || 'USD'}
            className={`${input} mt-2`}
          >
            <option value="USD">USD</option>
            <option value="PHP">PHP</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="AUD">AUD</option>
            <option value="CAD">CAD</option>
          </select>
        </label>

        <label className="text-sm text-slate-300">
          Company
          <select
            name="company_id"
            defaultValue={opportunity.company_id ?? ''}
            className={`${input} mt-2`}
          >
            <option value="">No company</option>
            {companies?.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-slate-300">
          Contact
          <select
            name="contact_id"
            defaultValue={opportunity.contact_id ?? ''}
            className={`${input} mt-2`}
          >
            <option value="">No contact</option>
            {contacts?.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {`${contact.first_name} ${contact.last_name}`.trim() ||
                  contact.email}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-slate-300 md:col-span-2">
          Expected close date
          <input
            type="date"
            name="expected_close_date"
            defaultValue={opportunity.expected_close_date ?? ''}
            className={`${input} mt-2`}
          />
        </label>

        <OwnerSelect
          members={owners}
          defaultMembershipId={opportunity.owner_membership_id}
          className={input}
        />

        <label className="text-sm text-slate-300 md:col-span-2">
          Description
          <textarea
            name="description"
            rows={6}
            defaultValue={opportunity.description ?? ''}
            className={`${input} mt-2 py-3`}
          />
        </label>

        <div className="flex flex-col-reverse gap-3 md:col-span-2 sm:flex-row sm:justify-end">
          <Link
            href={`/dashboard/pipelines/${pipelineId}`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
          >
            Cancel
          </Link>

          <button className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500">
            Save opportunity
          </button>
        </div>
      </form>
    </div>
  )
}