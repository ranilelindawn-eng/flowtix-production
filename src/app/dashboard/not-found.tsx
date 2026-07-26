import Link from 'next/link'

export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900/70 p-10 text-center shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className="h-8 w-8"
          >
            <path
              d="M9.5 4.5h5a2 2 0 0 1 2 2v2.25"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />

            <path
              d="M7.5 4.5h-.25a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h9.5a2 2 0 0 0 2-2v-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />

            <path
              d="m9.25 14.75 5.5-5.5M14.75 14.75l-5.5-5.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-blue-400">
          404 error
        </p>

        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
          Dashboard page not found
        </h1>

        <p className="mt-4 text-sm leading-7 text-slate-400">
          The page you requested does not exist, may have been moved, or
          you may not have access to it.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Back to dashboard
          </Link>

          <Link
            href="/dashboard/calls"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-6 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-slate-600 hover:text-white"
          >
            View calls
          </Link>
        </div>
      </div>
    </div>
  )
}