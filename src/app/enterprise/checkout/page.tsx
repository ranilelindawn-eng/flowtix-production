import Link from 'next/link'
import { CheckCircle2, CircleX, CreditCard } from 'lucide-react'

export const metadata = {
  title: 'Enterprise checkout | Flowtix',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function EnterpriseCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const params = await searchParams
  const success = params.status === 'success'

  return (
    <main className="flowtix-utility-page min-h-screen bg-transparent px-6 py-20 text-white">
      <div className="flowtix-utility-card mx-auto max-w-2xl rounded-3xl p-8 text-center sm:p-12">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${
            success
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-amber-500/15 text-amber-300'
          }`}
        >
          {success ? (
            <CheckCircle2 className="h-7 w-7" />
          ) : (
            <CircleX className="h-7 w-7" />
          )}
        </div>

        <p className="mt-6 text-sm font-medium text-blue-300">
          Flowtix Enterprise
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          {success
            ? 'Payment submitted'
            : 'Enterprise checkout was not completed'}
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-400">
          {success
            ? 'Flowtix will verify the PayMongo payment and continue assisted onboarding. Enterprise access is activated only after payment verification, custom limits, and onboarding approval are complete.'
            : 'No Enterprise activation was performed. You may return to the secure checkout link from your Flowtix contact when you are ready.'}
        </p>

        <div className="mt-8 rounded-2xl border border-white/10 bg-[#0B0F22]/75 p-5 text-left">
          <div className="flex items-start gap-3">
            <CreditCard className="mt-0.5 h-5 w-5 text-blue-300" />
            <div>
              <p className="font-medium text-white">
                Enterprise remains assisted
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                A successful checkout does not automatically grant Enterprise
                features. Flowtix confirms payment and completes the negotiated
                workspace configuration before activation.
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/contact?topic=enterprise"
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-xl bg-gradient-to-r from-[#4F8BFF] to-[#9A5CFF] px-5 text-sm font-semibold text-white hover:brightness-110"
        >
          Contact Flowtix
        </Link>
      </div>
    </main>
  )
}
