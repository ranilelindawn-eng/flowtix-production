import Link from 'next/link'

import { requireOrganization } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

import { createPipeline } from '../crm-actions'

const field =
  'min-h-11 rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white outline-none focus:border-blue-500'

export default async function PipelinesPage() {
  const membership = await requireOrganization()
  const supabase = await createClient()

  const [{ data: pipelines, error: pipelineError }, { data: opportunities }] =
    await Promise.all([
      supabase
        .from('pipelines')
        .select('id,name,description,created_at')
        .eq('organization_id', membership.organization_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('opportunities')
        .select('id,pipeline_id,value')
        .eq('organization_id', membership.organization_id),
    ])

  if (pipelineError) {
    throw new Error(`Failed to load pipelines: ${pipelineError.message}`)
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[.24em] text-cyan-400">
          Revenue workspace
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Pipelines</h1>
        <p className="mt-2 text-sm text-slate-400">
          Create sales pipelines and track opportunities through each stage.
        </p>
      </header>

      <form
        action={createPipeline}
        className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 lg:flex-row"
      >
        <input
          required
          name="name"
          placeholder="Pipeline name"
          className={`${field} flex-1`}
        />
        <input
          name="description"
          placeholder="Description"
          className={`${field} flex-1`}
        />
        <button className="rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500">
          Create pipeline
        </button>
      </form>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pipelines?.map((pipeline) => {
          const deals =
            opportunities?.filter(
              (opportunity) => opportunity.pipeline_id === pipeline.id,
            ) ?? []
          const total = deals.reduce(
            (sum, opportunity) => sum + Number(opportunity.value || 0),
            0,
          )

          return (
            <Link
              key={pipeline.id}
              href={`/dashboard/pipelines/${pipeline.id}`}
              className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 transition hover:border-cyan-400/30 hover:bg-[#0D1B2D]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {pipeline.name}
                  </h2>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-400">
                    {pipeline.description || 'No pipeline description yet.'}
                  </p>
                </div>

                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">
                  {deals.length} {deals.length === 1 ? 'deal' : 'deals'}
                </span>
              </div>

              <div className="mt-5 border-t border-white/10 pt-4">
                <p className="text-xs uppercase tracking-[.18em] text-slate-500">
                  Pipeline value
                </p>
                <p className="mt-1 text-xl font-semibold text-cyan-300">
                  ${total.toLocaleString('en-US')}
                </p>
              </div>
            </Link>
          )
        })}

        {!pipelines?.length && (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
            No pipelines found. Create your first pipeline above.
          </div>
        )}
      </section>
    </div>
  )
}