import type {
  Call,
  CallCampaignOption,
  CallContactOption,
  CallDirection,
  CallStatus,
} from '@/lib/calls'

type CallFormAction = (formData: FormData) => void | Promise<void>

type CallFormProps = {
  contacts: CallContactOption[]
  campaigns: CallCampaignOption[]
  initialValues?: Partial<Call>
  hiddenId?: string
  action: CallFormAction
  submitLabel: string
}

function getDateTimeLocalValue(
  value: string | null | undefined
): string {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const offset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - offset * 60_000)

  return localDate.toISOString().slice(0, 16)
}

function getContactName(contact: CallContactOption): string {
  const fullName =
    `${contact.first_name} ${contact.last_name}`.trim()

  return fullName || contact.email
}

export default function CallForm({
  contacts,
  campaigns,
  initialValues,
  hiddenId,
  action,
  submitLabel,
}: CallFormProps) {
  const direction: CallDirection =
    initialValues?.direction ?? 'outbound'

  const status: CallStatus =
    initialValues?.status ?? 'scheduled'

  const duration =
    initialValues?.duration_seconds === null ||
    initialValues?.duration_seconds === undefined
      ? ''
      : String(initialValues.duration_seconds)

  return (
    <form action={action} className="space-y-6">
      {hiddenId ? (
        <input type="hidden" name="id" value={hiddenId} />
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <label
            htmlFor="contact_id"
            className="mb-2 block text-sm font-medium text-slate-200"
          >
            Contact
          </label>

          <select
            id="contact_id"
            name="contact_id"
            defaultValue={initialValues?.contact_id ?? ''}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">No contact selected</option>

            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {getContactName(contact)}
                {contact.email ? ` — ${contact.email}` : ''}
              </option>
            ))}
          </select>

          {contacts.length === 0 ? (
            <p className="mt-2 text-xs text-amber-400">
              No contacts are available in this organization.
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="campaign_id"
            className="mb-2 block text-sm font-medium text-slate-200"
          >
            Campaign
          </label>

          <select
            id="campaign_id"
            name="campaign_id"
            defaultValue={initialValues?.campaign_id ?? ''}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">No campaign selected</option>

            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>

          {campaigns.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              This call will not be associated with a campaign.
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <label
            htmlFor="direction"
            className="mb-2 block text-sm font-medium text-slate-200"
          >
            Direction
          </label>

          <select
            id="direction"
            name="direction"
            defaultValue={direction}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="outbound">Outbound</option>
            <option value="inbound">Inbound</option>
          </select>
        </div>

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
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <label
            htmlFor="started_at"
            className="mb-2 block text-sm font-medium text-slate-200"
          >
            Call date and time
          </label>

          <input
            id="started_at"
            name="started_at"
            type="datetime-local"
            defaultValue={getDateTimeLocalValue(
              initialValues?.started_at
            )}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
          />

          <p className="mt-2 text-xs text-slate-500">
            Leave blank to use the current date and time.
          </p>
        </div>

        <div>
          <label
            htmlFor="duration_seconds"
            className="mb-2 block text-sm font-medium text-slate-200"
          >
            Duration in seconds
          </label>

          <input
            id="duration_seconds"
            name="duration_seconds"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={duration}
            placeholder="120"
            className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
          />

          <p className="mt-2 text-xs text-slate-500">
            Use a whole number. Leave blank for scheduled or unconnected
            calls.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <label
          htmlFor="recording_available"
          className="flex cursor-pointer items-start gap-3"
        >
          <input
            id="recording_available"
            name="recording_available"
            type="checkbox"
            defaultChecked={
              initialValues?.recording_available ?? false
            }
            className="mt-1 size-4 rounded border-white/20 bg-slate-950 text-blue-600 focus:ring-blue-500"
          />

          <span>
            <span className="block text-sm font-medium text-slate-200">
              Recording available
            </span>

            <span className="mt-1 block text-xs leading-5 text-slate-500">
              Enable this only when a valid call recording exists.
            </span>
          </span>
        </label>
      </div>

      <div>
        <label
          htmlFor="notes"
          className="mb-2 block text-sm font-medium text-slate-200"
        >
          Notes
        </label>

        <textarea
          id="notes"
          name="notes"
          rows={6}
          defaultValue={initialValues?.notes ?? ''}
          placeholder="Add call notes, follow-up information, or an outcome summary."
          className="w-full resize-y rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
        />
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