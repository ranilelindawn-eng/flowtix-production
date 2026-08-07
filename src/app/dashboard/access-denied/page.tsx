import Link from 'next/link'
import { ShieldX } from 'lucide-react'

export default function CustomerAccessDeniedPage() {
  return (
    <div className="mx-auto max-w-2xl py-16">
      <div className="rounded-3xl border border-amber-400/20 bg-amber-400/[0.05] p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-300">
          <ShieldX className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-white">
          Customer workspace access denied
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Your organization role does not have permission to open this
          customer workspace area. Hidden navigation items are also enforced
          on the server, so entering the URL directly does not bypass the role
          boundary.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500"
        >
          Return to dashboard
        </Link>
      </div>
    </div>
  )
}
