type ProviderNoticeProps = {
  providerName?: string
  configured?: boolean
}

export default function ProviderNotice({
  providerName = 'Twilio or Telnyx',
  configured = false,
}: ProviderNoticeProps) {
  if (configured) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-lg">🟢</div>

          <div>
            <h3 className="text-sm font-semibold text-emerald-300">
              Provider Connected
            </h3>

            <p className="mt-1 text-sm leading-6 text-emerald-200/90">
              {providerName} is connected and ready to place
              live outbound calls.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-lg">ℹ️</div>

        <div>
          <h3 className="text-sm font-semibold text-blue-300">
            Calling Provider Required
          </h3>

          <p className="mt-1 text-sm leading-6 text-blue-200/90">
            This dialer interface is fully functional for the
            application workflow, but it will not place real
            telephone calls until a supported provider such as{' '}
            <span className="font-semibold">
              {providerName}
            </span>{' '}
            has been configured.
          </p>

          <p className="mt-3 text-xs leading-5 text-blue-200/70">
            CallFlow intentionally avoids simulating successful
            live calls when no provider is connected.
          </p>
        </div>
      </div>
    </div>
  )
}