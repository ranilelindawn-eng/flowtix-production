import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireOrganization } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

import { updatePipeline } from '../../../crm-actions'

const input =
  'min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white outline-none focus:border-blue-500'

export default async function EditPipelinePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const membership = await requireOrganization()
  const supabase = await createClient()

  const { data: pipeline, error } = await supabase
    .from('pipelines')
    .select('id,name,description')
    .eq('organization_id', membership.organization_id)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load pipeline: ${error.message}`)
  }

  if (!pipeline) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/dashboard/pipelines/${id}`}
          className="text-sm font-medium text-cyan-400 hover:text-cyan-300"
        >
          ← Pipeline details
        </Link>

        <p className="mt-4 text-sm uppercase tracking-[.24em] text-cyan-400">
          Revenue workspace
        </p>

        <h1 className="mt-2 text-3xl font-semibold text-white">
          Edit pipeline
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          Update this pipeline's name and description.
        </p>
      </div>

      <form
        action={updatePipeline}
        className="space-y-5 rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6"
      >
        <input type="hidden" name="id" value={pipeline.id} />

        <label className="block text-sm text-slate-300">
          Pipeline name
          <input
            required
            name="name"
            defaultValue={pipeline.name}
            className={`${input} mt-2`}
          />
        </label>

        <label className="block text-sm text-slate-300">
          Description
          <textarea
            name="description"
            rows={5}
            defaultValue={pipeline.description ?? ''}
            className={`${input} mt-2 py-3`}
          />
        </label>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            href={`/dashboard/pipelines/${id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
          >
            Cancel
          </Link>

          <button className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500">
            Save changes
          </button>
        </div>
      </form>
    </div>
  )
}