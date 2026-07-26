import Link from 'next/link'

import { createCampaign } from '@/app/dashboard/campaigns/actions'

export default function NewCampaignPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-cyan-400">
            New campaign
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Create a campaign
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Organize your outreach by creating a campaign with a status,
            description, and optional schedule.
          </p>
        </div>

        <Link
          href="/dashboard/campaigns"
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] hover:text-white"
        >
          Back to campaigns
        </Link>
      </div>

      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-black/10">
        <div className="mb-6 border-b border-white/10 pb-5">
          <h2 className="text-xl font-semibold text-white">
            Campaign information
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Enter the campaign details below. You can change these later.
          </p>
        </div>

        <form action={createCampaign} className="space-y-6">
          <div>
            <label
              htmlFor="name"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Campaign name
            </label>

            <input
              id="name"
              name="name"
              type="text"
              required
              autoComplete="off"
              placeholder="Outbound sales campaign"
              className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Description
            </label>

            <textarea
              id="description"
              name="description"
              rows={5}
              placeholder="Describe the campaign purpose and target audience."
              className="w-full resize-y rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label
                htmlFor="status"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                Status
              </label>

              <select
                id="status"
                name="status"
                defaultValue="draft"
                className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div className="hidden md:block" aria-hidden="true" />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label
                htmlFor="start_date"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                Start date
              </label>

              <input
                id="start_date"
                name="start_date"
                type="date"
                className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label
                htmlFor="end_date"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                End date
              </label>

              <input
                id="end_date"
                name="end_date"
                type="date"
                className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-6 sm:flex-row sm:justify-end">
            <Link
              href="/dashboard/campaigns"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
            >
              Cancel
            </Link>

            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950"
            >
              Create campaign
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}