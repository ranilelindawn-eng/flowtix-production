import Link from 'next/link'
import { ShieldX } from 'lucide-react'

export default function PlatformAccessDeniedPage() {
  return (
    <div className="mx-auto max-w-2xl py-16">
      <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
          <ShieldX className="h-6 w-6" />
        </div>

        <h1 className="mt-5 text-2xl font-semibold text-white">
          Platform access restricted
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-400">
          Your Flowtix Platform role is valid, but it does not include the
          permission required for that module. No customer workspace permission
          can grant access to Platform routes.
        </p>

        <Link
          href="/platform"
          className="mt-6 inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500"
        >
          Return to Platform Dashboard
        </Link>
      </section>
    </div>
  )
}
