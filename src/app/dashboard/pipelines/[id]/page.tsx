import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getAssignableMembers } from '@/lib/ownership'

import {
  createOpportunity,
  deleteOpportunity,
  deletePipeline,
  moveOpportunityStage,
} from '../../crm-actions'
import DeleteOpportunityButton from './delete-opportunity-button'
import DeletePipelineButton from './delete-pipeline-button'

const field =
  'min-h-11 rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white outline-none focus:border-blue-500'

export default async function PipelineDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const membership = await requirePermission('opportunities.view')
  const supabase = await createClient()

  const [
    { data: pipeline, error: pipelineError },
    { data: stages, error: stagesError },
    { data: opportunities, error: opportunitiesError },
    { data: companies },
    { data: contacts },
    owners,
  ] = await Promise.all([
    supabase
      .from('pipelines')
      .select('id,name,description,created_at')
      .eq('organization_id', membership.organization_id)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('pipeline_stages')
      .select('id,pipeline_id,name,position,probability')
      .eq('organization_id', membership.organization_id)
      .eq('pipeline_id', id)
      .order('position'),
    supabase
      .from('opportunities')
      .select(
        'id,pipeline_id,stage_id,company_id,contact_id,name,value,currency,probability,expected_close_date,description,created_at',
      )
      .eq('organization_id', membership.organization_id)
      .eq('pipeline_id', id)
      .order('created_at', { ascending: false }),
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

  if (stagesError) {
    throw new Error(`Failed to load pipeline stages: ${stagesError.message}`)
  }

  if (opportunitiesError) {
    throw new Error(
      `Failed to load pipeline opportunities: ${opportunitiesError.message}`,
    )
  }

  if (!pipeline) notFound()

  const totalValue =
    opportunities?.reduce(
      (sum, opportunity) => sum + Number(opportunity.value || 0),
      0,
    ) ?? 0

  const companyNames = new Map(
    companies?.map((company) => [company.id, company.name]) ?? [],
  )
  const contactNames = new Map(
    contacts?.map((contact) => [
      contact.id,
      `${contact.first_name} ${contact.last_name}`.trim() ||
        contact.email ||
        'Contact',
    ]) ?? [],
  )

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href="/dashboard/pipelines"
            className="text-sm font-medium text-cyan-400 hover:text-cyan-300"
          >
            ← Pipelines
          </Link>

          <p className="mt-4 text-sm uppercase tracking-[.24em] text-cyan-400">
            Revenue workspace
          </p>

          <h1 className="mt-2 text-3xl font-semibold text-white">
            {pipeline.name}
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            {pipeline.description || 'No pipeline description yet.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/dashboard/pipelines/${id}/edit`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:border-cyan-400/30 hover:bg-white/10"
          >
            Edit pipeline
          </Link>

          <form action={deletePipeline}>
            <input type="hidden" name="id" value={id} />
            <DeletePipelineButton pipelineName={pipeline.name} />
          </form>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5">
          <p className="text-xs uppercase tracking-[.18em] text-slate-500">
            Total deals
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {opportunities?.length ?? 0}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5">
          <p className="text-xs uppercase tracking-[.18em] text-slate-500">
            Pipeline value
          </p>
          <p className="mt-2 text-2xl font-semibold text-cyan-300">
            ${totalValue.toLocaleString('en-US')}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5">
          <p className="text-xs uppercase tracking-[.18em] text-slate-500">
            Stages
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {stages?.length ?? 0}
          </p>
        </div>
      </div>

      <form
        action={createOpportunity}
        className="grid gap-3 rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 md:grid-cols-2 xl:grid-cols-7"
      >
        <input type="hidden" name="pipeline_id" value={pipeline.id} />

        <input
          required
          name="name"
          placeholder="Opportunity name"
          className={field}
        />

        <input
          name="value"
          type="number"
          min="0"
          step="0.01"
          placeholder="Value"
          className={field}
        />

        <select name="stage_id" className={field}>
          {stages?.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>

        <select name="company_id" className={field}>
          <option value="">No company</option>
          {companies?.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>

        <select name="contact_id" className={field}>
          <option value="">No contact</option>
          {contacts?.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {`${contact.first_name} ${contact.last_name}`.trim() ||
                contact.email}
            </option>
          ))}
        </select>


        <select name="owner_membership_id" defaultValue={membership.membership_id} className={field}>
          {owners.map((owner) => (
            <option key={owner.membershipId} value={owner.membershipId}>
              {owner.name}
            </option>
          ))}
        </select>

        <button className="rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500">
          Add opportunity
        </button>
      </form>

      <div
        className="grid min-w-max gap-4 overflow-x-auto pb-3"
        style={{
          gridTemplateColumns: `repeat(${Math.max(stages?.length ?? 0, 1)}, minmax(300px, 1fr))`,
        }}
      >
        {stages?.map((stage) => {
          const deals =
            opportunities?.filter(
              (opportunity) => opportunity.stage_id === stage.id,
            ) ?? []
          const stageValue = deals.reduce(
            (sum, opportunity) => sum + Number(opportunity.value || 0),
            0,
          )

          return (
            <section
              key={stage.id}
              className="min-h-[420px] rounded-2xl border border-white/10 bg-[#0B1726]/90 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-white">{stage.name}</h2>
                  <p className="text-xs text-slate-500">
                    {deals.length} {deals.length === 1 ? 'deal' : 'deals'} · $
                    {stageValue.toLocaleString('en-US')}
                  </p>
                </div>

                <span className="rounded-full bg-white/5 px-2 py-1 text-xs text-slate-300">
                  {stage.probability}%
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {deals.map((deal) => (
                  <article
                    key={deal.id}
                    className="rounded-xl border border-white/10 bg-[#07111F] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-medium text-white">
                          {deal.name}
                        </h3>
                        <p className="mt-2 text-lg font-semibold text-cyan-300">
                          {deal.currency || 'USD'}{' '}
                          {Number(deal.value || 0).toLocaleString('en-US', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                      </div>

                      <span className="rounded-full bg-white/5 px-2 py-1 text-xs text-slate-300">
                        {deal.probability}%
                      </span>
                    </div>

                    {(deal.company_id || deal.contact_id) && (
                      <div className="mt-3 space-y-1 text-xs text-slate-400">
                        {deal.company_id && (
                          <p>
                            Company:{' '}
                            {companyNames.get(deal.company_id) ||
                              'Unknown company'}
                          </p>
                        )}
                        {deal.contact_id && (
                          <p>
                            Contact:{' '}
                            {contactNames.get(deal.contact_id) ||
                              'Unknown contact'}
                          </p>
                        )}
                      </div>
                    )}

                    {deal.expected_close_date && (
                      <p className="mt-3 text-xs text-slate-500">
                        Expected close:{' '}
                        {new Date(
                          `${deal.expected_close_date}T00:00:00`,
                        ).toLocaleDateString('en-US')}
                      </p>
                    )}

                    {deal.description && (
                      <p className="mt-3 line-clamp-3 text-sm text-slate-400">
                        {deal.description}
                      </p>
                    )}

                    <form
                      action={moveOpportunityStage}
                      className="mt-4 space-y-2"
                    >
                      <input type="hidden" name="id" value={deal.id} />
                      <input
                        type="hidden"
                        name="pipeline_id"
                        value={pipeline.id}
                      />

                      <select
                        name="stage_id"
                        defaultValue={deal.stage_id}
                        className="min-h-10 w-full rounded-lg border border-white/10 bg-[#0B1726] px-2 text-xs text-white outline-none focus:border-blue-500"
                      >
                        {stages.map((availableStage) => (
                          <option
                            key={availableStage.id}
                            value={availableStage.id}
                          >
                            {availableStage.name}
                          </option>
                        ))}
                      </select>

                      <button className="min-h-9 w-full rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20">
                        Move to selected stage
                      </button>
                    </form>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Link
                        href={`/dashboard/pipelines/${pipeline.id}/opportunities/${deal.id}/edit`}
                        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/5"
                      >
                        Edit
                      </Link>

                      <form action={deleteOpportunity}>
                        <input type="hidden" name="id" value={deal.id} />
                        <input
                          type="hidden"
                          name="pipeline_id"
                          value={pipeline.id}
                        />
                        <DeleteOpportunityButton
                          opportunityName={deal.name}
                        />
                      </form>
                    </div>
                  </article>
                ))}

                {!deals.length && (
                  <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-500">
                    No opportunities in this stage.
                  </div>
                )}
              </div>
            </section>
          )
        })}

        {!stages?.length && (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500">
            No stages found for this pipeline.
          </div>
        )}
      </div>
    </div>
  )
}