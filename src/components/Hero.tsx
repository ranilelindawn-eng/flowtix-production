import Link from 'next/link'

function DashboardPreview() {
  return (
    <div className="space-y-5">
      <div className="rounded-[2rem] border border-white/10 bg-[#07111F] p-5 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.75)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#94A3B8]">Product preview</p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#0F1C33] px-3 py-2 text-sm font-semibold text-white shadow-md shadow-[#22D3EE]/10">
              <span className="relative inline-flex h-2.5 w-2.5 items-center justify-center">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#22D3EE]/40 motion-safe:animate-ping-slow" />
                <span className="relative block h-2.5 w-2.5 rounded-full bg-[#22D3EE]" />
              </span>
              Calling workspace
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#0A213A] px-3 py-1 text-xs text-[#94A3B8]">Transcript records</span>
            <span className="rounded-full bg-[#0A213A] px-3 py-1 text-xs text-[#94A3B8]">CRM workspace</span>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="rounded-[1.75rem] bg-[#0F1C33] p-6 ring-1 ring-white/5 shadow-sm">
            <div className="flex items-center justify-between gap-4 text-sm text-[#94A3B8]">
              <div>Conversation workspace</div>
              <div className="rounded-full bg-[#12223e] px-3 py-1 text-xs text-[#22D3EE]">Illustration</div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-3xl bg-[#07111F] p-4">
                <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.28em] text-[#94A3B8]">
                  <span>Agent</span>
                  <span>2m 14s</span>
                </div>
                <div className="mt-4 space-y-3 text-sm text-white">
                  <p className="rounded-2xl bg-[#12223e] p-4">Review contact context, tasks, notes, and call records in one place.</p>
                  <p className="rounded-2xl bg-[#071827] p-4">External calling and AI providers must be connected before live processing is available.</p>
                </div>
              </div>

              <div className="rounded-3xl bg-[#07111F] p-4 ring-1 ring-white/5">
                <div className="flex items-center justify-between text-sm text-[#94A3B8]">
                  <span>Transcript feed</span>
                  <span>Live update</span>
                </div>
                <div className="mt-4 space-y-3 text-sm text-white/90">
                  <p className="rounded-2xl bg-[#0F213A] px-4 py-3 shadow-inner shadow-[#22D3EE]/10">Transcript records can be created and reviewed in the workspace.</p>
                  <p className="rounded-2xl bg-[#071827] px-4 py-3 shadow-inner shadow-[#2563EB]/10 motion-safe:animate-transcript">Summary and insight records support reviewable conversation workflows.</p>
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[1.75rem] bg-[#0F1C33] p-6 ring-1 ring-white/5 shadow-sm">
              <div className="text-xs uppercase tracking-[0.24em] text-[#94A3B8]">AI summary</div>
              <p className="mt-4 text-sm leading-7 text-white/90">
                Illustrative summary showing how conversation outcomes and follow-up work can be organized.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#12223e] px-3 py-1 text-xs text-[#94A3B8]">Follow-up task</span>
                <span className="rounded-full bg-[#12223e] px-3 py-1 text-xs text-[#94A3B8]">CRM update</span>
              </div>
            </div>

            <div className="grid gap-4">
              {['Contacts', 'Tasks', 'Campaigns'].map((label, index) => (
                <div key={label} className="rounded-3xl bg-[#07111F] p-4 ring-1 ring-white/5">
                  <div className="text-sm text-[#94A3B8]">{label}</div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {index === 0 ? 'CRM' : index === 1 ? 'Follow-up' : 'Workflow'}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/10 bg-[#0F1C33] p-6 shadow-sm ring-1 ring-white/5">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.75rem] bg-[#07111F] p-5 ring-1 ring-white/5">
            <div className="flex items-center justify-between text-sm text-[#94A3B8]">
              <span>CRM sidebar</span>
              <span className="rounded-full bg-[#12223e] px-3 py-1 text-xs text-[#94A3B8]">Active</span>
            </div>
            <div className="mt-5 space-y-4">
              {['Customer profile', 'Campaign queue', 'Call history'].map((company) => (
                <div key={company} className="rounded-3xl border border-white/5 bg-[#0A1B34] p-4">
                  <div className="text-sm font-semibold text-white">{company}</div>
                  <div className="mt-2 text-xs text-[#94A3B8]">Illustrative workspace module</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] bg-[#07111F] p-5 ring-1 ring-white/5">
            <div className="text-sm font-semibold text-white">Activity timeline</div>
            <div className="mt-4 space-y-4">
              {[
                { label: 'Contact updated', time: 'Timeline event', tone: 'text-[#22D3EE]' },
                { label: 'Task created', time: 'Timeline event', tone: 'text-[#94A3B8]' },
                { label: 'Call record added', time: 'Timeline event', tone: 'text-[#94A3B8]' },
              ].map((event) => (
                <div key={event.label} className="flex items-center gap-4">
                  <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[#22D3EE]/30">
                    <span className="block h-2 w-2 rounded-full bg-[#22D3EE]" />
                  </span>
                  <div>
                    <p className="text-sm text-white">{event.label}</p>
                    <p className={`text-xs ${event.tone}`}>{event.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Hero() {
  return (
    <section id="hero" className="relative overflow-hidden py-24">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-[-10%] top-16 h-72 w-72 rounded-full bg-[#22D3EE]/10 blur-3xl opacity-80" />
        <div className="absolute right-[-5%] top-40 h-64 w-64 rounded-full bg-[#2563EB]/15 blur-3xl opacity-70" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#07111F] to-transparent" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="grid gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.28em] text-[#22D3EE]">Cloud dialer and CRM workspace</p>
            <h1 className="mt-6 text-5xl font-black tracking-[-0.04em] text-white sm:text-6xl lg:text-[4.75rem] lg:leading-[0.98]">
              Power Every Conversation with AI.
            </h1>
            <p className="mt-8 text-lg leading-8 text-[#94A3B8] sm:text-xl">
              Cloud calling, Transcript records, AI coaching, analytics, CRM integrations, and team collaboration.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/signup"
                className="inline-flex min-w-[160px] items-center justify-center rounded-full bg-gradient-to-r from-[#2563EB] to-[#22D3EE] px-7 py-4 text-base font-semibold text-white shadow-[0_24px_80px_-48px_rgba(34,211,238,0.6)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[#22D3EE]/40"
              >
                Start Free
              </Link>
              <Link
                href="/contact"
                className="inline-flex min-w-[160px] items-center justify-center rounded-full border border-white/10 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 transition duration-300 hover:bg-white/10 hover:text-white"
              >
                Book Demo
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="rounded-[2.5rem] border border-white/10 bg-[#0F1C33] p-6 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.7)] ring-1 ring-white/5 motion-safe:animate-float">
              <DashboardPreview />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
