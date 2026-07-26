import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900/80 p-10 text-center shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className="h-8 w-8"
          >
            <path
              d="M8 5h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z"
              stroke="currentColor"
              strokeWidth="1.8"
            />

            <path
              d="m9 9 6 6M15 9l-6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-blue-400">
          404 error
        </p>

        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          Page not found
        </h1>

        <p className="mt-4 text-sm leading-7 text-slate-400">
          The page you requested does not exist, may have been moved, or
          is no longer available.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            Return home
          </Link>

          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 px-6 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-slate-600 hover:text-white"
          >
            Open dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}