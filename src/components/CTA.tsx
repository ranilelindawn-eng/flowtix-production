import Link from 'next/link'

export default function CTA() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-4xl px-6">
        <div className="rounded-[2rem] bg-gradient-to-r from-[#07111F] via-[#0F1C33] to-[#07111F] p-1 shadow-[0_40px_100px_-70px_rgba(34,211,238,0.7)]">
          <div className="rounded-[1.75rem] bg-[#07111F] p-10 text-center shadow-[0_30px_60px_-30px_rgba(0,0,0,0.65)] ring-1 ring-white/10">
            <p className="text-sm uppercase tracking-[0.28em] text-[#22D3EE]">Get started</p>
            <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">Ready to modernize your calling workflow?</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#94A3B8]">
              Create your workspace and begin organizing your contacts, campaigns, calls, tasks, and team workflows.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex min-w-[180px] items-center justify-center rounded-full bg-gradient-to-r from-[#2563EB] to-[#22D3EE] px-8 py-4 text-base font-semibold text-white shadow-lg shadow-[#22D3EE]/20 transition duration-300 hover:-translate-y-0.5 hover:shadow-[#22D3EE]/40"
              >
                Start Free
              </Link>
              <Link
                href="/contact"
                className="inline-flex min-w-[180px] items-center justify-center rounded-full border border-white/10 bg-white/5 px-8 py-4 text-base font-semibold text-white/90 transition duration-300 hover:-translate-y-0.5 hover:bg-white/10 hover:text-white"
              >
                Book Demo
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
