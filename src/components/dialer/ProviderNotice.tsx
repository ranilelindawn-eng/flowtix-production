type ProviderNoticeProps = { configured?: boolean }

export default function ProviderNotice({ configured = false }: ProviderNoticeProps) {
  if (configured) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
        <h3 className="text-sm font-semibold text-emerald-300">Cloud Calling Ready</h3>
        <p className="mt-1 text-sm leading-6 text-emerald-200/90">Flowtix Cloud Calling is ready to place live calls.</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
      <h3 className="text-sm font-semibold text-blue-300">Cloud Calling Unavailable</h3>
      <p className="mt-1 text-sm leading-6 text-blue-200/90">This workspace does not currently have an active Flowtix calling connection. Contact your workspace owner or Flowtix support.</p>
    </div>
  )
}
