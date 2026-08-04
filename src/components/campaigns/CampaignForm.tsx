import type {
  Campaign,
  CampaignStatus,
} from '@/lib/campaigns'
import type { AssignableMember } from '@/lib/ownership'

type CampaignFormAction = (formData: FormData) => void | Promise<void>

type CampaignFormProps = {
  initialValues?: Partial<Campaign>
  hiddenId?: string
  action: CampaignFormAction
  submitLabel: string
  owners: AssignableMember[]
}

function getInputDate(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  return value.slice(0, 10)
}

export default function CampaignForm({
  initialValues,
  hiddenId,
  action,
  submitLabel,
  owners,
}: CampaignFormProps) {
  const status: CampaignStatus =
    initialValues?.status ?? 'draft'

  return (
    <form action={action} className="space-y-6">
      {hiddenId ? (
        <input type="hidden" name="id" value={hiddenId} />
      ) : null}

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
          defaultValue={initialValues?.name ?? ''}
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
          defaultValue={initialValues?.description ?? ''}
          placeholder="Describe the campaign purpose and target audience."
          className="w-full resize-y rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
        />
      </div>


      <div>
        <label
          htmlFor="owner_membership_id"
          className="mb-2 block text-sm font-medium text-slate-200"
        >
          Assigned owner
        </label>
        <select
          id="owner_membership_id"
          name="owner_membership_id"
          defaultValue={
            initialValues?.owner_membership_id ??
            owners[0]?.membershipId ??
            ''
          }
          className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
        >
          {owners.map((owner) => (
            <option key={owner.membershipId} value={owner.membershipId}>
              {owner.name}{owner.email ? ` — ${owner.email}` : ''}
            </option>
          ))}
        </select>
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
            defaultValue={status}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div aria-hidden="true" className="hidden md:block" />
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
            defaultValue={getInputDate(initialValues?.start_date)}
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
            defaultValue={getInputDate(initialValues?.end_date)}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      <div className="flex justify-end border-t border-white/10 pt-6">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
}