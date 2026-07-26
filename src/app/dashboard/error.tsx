'use client'

import { useEffect } from 'react'

type DashboardErrorProps = {
  error: Error & {
    digest?: string
  }
  reset: () => void
}

export default function DashboardError({
  error,
  reset,
}: DashboardErrorProps) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900/70 p-10 text-center shadow-xl">
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

        <h1 className="mt-6 text-3xl font-bold text-white">
          Something went wrong
        </h1>

        <p className="mt-4 text-sm leading-7 text-slate-400">
          An unexpected error occurred while loading this dashboard
          page. Your data has not been lost. Please try again.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Try Again
          </button>

          <button
            onClick={() => window.location.assign('/dashboard')}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-6 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-slate-600 hover:text-white"
          >
            Back to Dashboard
          </button>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <details className="mt-8 rounded-xl border border-slate-800 bg-slate-950 p-4 text-left">
            <summary className="cursor-pointer text-sm font-medium text-slate-300">
              Error Details
            </summary>

            <pre className="mt-3 overflow-auto whitespace-pre-wrap break-all text-xs text-red-300">
              {error.message}
            </pre>

            {error.digest && (
              <p className="mt-3 text-xs text-slate-500">
                Digest: {error.digest}
              </p>
            )}
          </details>
        )}
      </div>
    </div>
  )
}