type SelectedContactProps = {
  name?: string
  phoneNumber?: string
  email?: string
  company?: string
  campaignName?: string
  disabled?: boolean
  onClear?: () => void
}

export default function SelectedContact({
  name,
  phoneNumber,
  email,
  company,
  campaignName,
  disabled = false,
  onClear,
}: SelectedContactProps) {
  const hasContact = Boolean(
    name ||
      phoneNumber ||
      email ||
      company ||
      campaignName,
  )

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Selected contact
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Contact details associated with the current call.
          </p>
        </div>

        {hasContact && onClear ? (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear
          </button>
        ) : null}
      </div>

      {hasContact ? (
        <div className="mt-5 flex items-start gap-4">
          <div
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-full border border-blue-500/20 bg-blue-500/10 text-lg font-semibold text-blue-300"
          >
            {name?.trim().charAt(0).toUpperCase() || '?'}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-white">
              {name || 'Unnamed contact'}
            </p>

            {company ? (
              <p className="mt-1 truncate text-sm text-slate-400">
                {company}
              </p>
            ) : null}

            <dl className="mt-4 space-y-3 text-sm">
              {phoneNumber ? (
                <div className="flex items-start justify-between gap-4">
                  <dt className="shrink-0 text-slate-500">
                    Phone
                  </dt>

                  <dd className="min-w-0 break-all text-right font-medium text-slate-200">
                    {phoneNumber}
                  </dd>
                </div>
              ) : null}

              {email ? (
                <div className="flex items-start justify-between gap-4">
                  <dt className="shrink-0 text-slate-500">
                    Email
                  </dt>

                  <dd className="min-w-0 break-all text-right font-medium text-slate-200">
                    {email}
                  </dd>
                </div>
              ) : null}

              {campaignName ? (
                <div className="flex items-start justify-between gap-4">
                  <dt className="shrink-0 text-slate-500">
                    Campaign
                  </dt>

                  <dd className="min-w-0 break-words text-right font-medium text-slate-200">
                    {campaignName}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-300">
            No contact selected
          </p>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Enter a phone number manually or choose a contact
            from a campaign queue.
          </p>
        </div>
      )}
    </section>
  )
}