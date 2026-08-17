'use client'

import { useEffect } from 'react'

import { getUserFacingError } from '@/lib/errors/user-facing'

type GlobalErrorProps = {
  error: Error & {
    digest?: string
  }
  reset: () => void
}

export default function GlobalError({
  error,
  reset,
}: GlobalErrorProps) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const friendly = getUserFacingError(error, {
    context: 'general',
    fallbackTitle: 'Flowtix could not complete this request',
    fallbackMessage: 'Please try again. If the problem continues, use the error reference when contacting Flowtix support.',
  })

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-white">
        <main className="flex min-h-screen items-center justify-center px-6 py-12">
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900/80 p-10 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="h-8 w-8"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="2"
                />

                <path
                  d="M12 8v5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />

                <circle
                  cx="12"
                  cy="16.5"
                  r="1"
                  fill="currentColor"
                />
              </svg>
            </div>

            <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-red-400">
              Application error
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight">
              {friendly.title}
            </h1>

            <p className="mt-4 text-sm leading-7 text-slate-400">
              {friendly.message}
            </p>

            {error.digest ? (
              <p className="mt-4 text-xs text-slate-500">
                Error reference: <span className="font-mono text-slate-400">{error.digest}</span>
              </p>
            ) : null}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={reset}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950"
              >
                Try again
              </button>

              <button
                type="button"
                onClick={() => window.location.assign('/')}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 px-6 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-slate-600 hover:text-white"
              >
                Return home
              </button>
            </div>

            {process.env.NODE_ENV === 'development' ? (
              <details className="mt-8 rounded-xl border border-slate-800 bg-slate-950 p-4 text-left">
                <summary className="cursor-pointer text-sm font-medium text-slate-300">
                  Error details
                </summary>

                <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-red-300">
                  {error.message}
                </pre>

                {error.digest ? (
                  <p className="mt-3 break-all text-xs text-slate-500">
                    Digest: {error.digest}
                  </p>
                ) : null}
              </details>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  )
}