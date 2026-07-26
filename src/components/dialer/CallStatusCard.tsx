type DialerCallState =
  | 'idle'
  | 'dialing'
  | 'ringing'
  | 'connected'
  | 'ended'

type CallStatusCardProps = {
  callState: DialerCallState
  isSaving?: boolean
  saveError?: string
  recordStatus?: 'pending' | 'saved' | 'failed'
  isMuted?: boolean
  isOnHold?: boolean
  providerLabel?: string
}

function getCallStateLabel(
  callState: DialerCallState,
  isSaving: boolean,
): string {
  if (isSaving) {
    return 'Saving'
  }

  switch (callState) {
    case 'dialing':
      return 'Dialing'

    case 'ringing':
      return 'Ringing'

    case 'connected':
      return 'Connected'

    case 'ended':
      return 'Ended'

    case 'idle':
    default:
      return 'Idle'
  }
}

function getRecordStatusLabel(
  recordStatus: CallStatusCardProps['recordStatus'],
): string {
  switch (recordStatus) {
    case 'saved':
      return 'Saved'

    case 'failed':
      return 'Save failed'

    case 'pending':
    default:
      return 'Pending'
  }
}

function getStateClasses(
  callState: DialerCallState,
): string {
  switch (callState) {
    case 'connected':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'

    case 'dialing':
    case 'ringing':
      return 'border-blue-500/20 bg-blue-500/10 text-blue-300'

    case 'ended':
      return 'border-slate-500/20 bg-slate-500/10 text-slate-300'

    case 'idle':
    default:
      return 'border-white/10 bg-white/[0.03] text-slate-300'
  }
}

export default function CallStatusCard({
  callState,
  isSaving = false,
  saveError = '',
  recordStatus = 'pending',
  isMuted = false,
  isOnHold = false,
  providerLabel = 'Not configured',
}: CallStatusCardProps) {
  const callStateLabel = getCallStateLabel(
    callState,
    isSaving,
  )

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Dialer status
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Review the current dialer and call-record state.
          </p>
        </div>

        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStateClasses(
            callState,
          )}`}
        >
          {callStateLabel}
        </span>
      </div>

      <dl className="mt-5 space-y-4 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500">
            Provider
          </dt>

          <dd className="text-right font-medium text-slate-200">
            {providerLabel}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500">
            Microphone
          </dt>

          <dd
            className={`font-medium ${
              isMuted
                ? 'text-amber-300'
                : 'text-slate-200'
            }`}
          >
            {isMuted ? 'Muted' : 'Ready'}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500">
            Hold status
          </dt>

          <dd
            className={`font-medium ${
              isOnHold
                ? 'text-amber-300'
                : 'text-slate-200'
            }`}
          >
            {isOnHold ? 'On hold' : 'Not on hold'}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500">
            Call state
          </dt>

          <dd className="font-medium text-slate-200">
            {callStateLabel}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500">
            Call record
          </dt>

          <dd
            className={`font-medium ${
              recordStatus === 'failed'
                ? 'text-red-300'
                : recordStatus === 'saved'
                  ? 'text-emerald-300'
                  : 'text-slate-200'
            }`}
          >
            {getRecordStatusLabel(recordStatus)}
          </dd>
        </div>
      </dl>

      {saveError ? (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm leading-6 text-red-300"
        >
          {saveError}
        </div>
      ) : null}
    </section>
  )
}