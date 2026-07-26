function SkeletonBlock({
  className = '',
}: {
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-xl bg-slate-800/80 ${className}`}
    />
  )
}

export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading dashboard content"
      className="space-y-6"
    >
      <span className="sr-only">
        Loading dashboard content...
      </span>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-8 w-64 max-w-full" />
          <SkeletonBlock className="h-4 w-96 max-w-full" />
        </div>

        <SkeletonBlock className="h-11 w-40 shrink-0" />
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <article
            key={index}
            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
          >
            <div className="flex items-center justify-between gap-4">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-10 w-10" />
            </div>

            <SkeletonBlock className="mt-6 h-8 w-24" />
            <SkeletonBlock className="mt-3 h-4 w-32" />
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.8fr)]">
        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <SkeletonBlock className="h-5 w-40" />
              <SkeletonBlock className="h-4 w-56 max-w-full" />
            </div>

            <SkeletonBlock className="h-9 w-24" />
          </div>

          <div className="mt-6 space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4"
              >
                <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />

                <div className="min-w-0 flex-1 space-y-2">
                  <SkeletonBlock className="h-4 w-40 max-w-full" />
                  <SkeletonBlock className="h-3 w-64 max-w-full" />
                </div>

                <SkeletonBlock className="h-7 w-20 shrink-0" />
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-32" />
            <SkeletonBlock className="h-4 w-48 max-w-full" />
          </div>

          <div className="mt-6 space-y-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index}>
                <div className="flex items-center justify-between gap-4">
                  <SkeletonBlock className="h-4 w-28" />
                  <SkeletonBlock className="h-4 w-12" />
                </div>

                <SkeletonBlock className="mt-3 h-2.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <article
            key={index}
            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
          >
            <div className="flex items-start gap-3">
              <SkeletonBlock className="h-11 w-11 shrink-0" />

              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBlock className="h-5 w-36 max-w-full" />
                <SkeletonBlock className="h-4 w-full" />
                <SkeletonBlock className="h-4 w-5/6" />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <SkeletonBlock className="h-16 w-full" />
              <SkeletonBlock className="h-16 w-full" />
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}