import { Phone, Mic2, FileText, Sparkles, Activity, BarChart3 } from 'lucide-react'

const steps = [
  { title: 'Call', desc: 'Connect voice channels with global reliability.', icon: Phone },
  { title: 'Record', desc: 'Capture every conversation with secure storage.', icon: Mic2 },
  { title: 'Transcribe', desc: 'Create accurate text logs instantly.', icon: FileText },
  { title: 'Summarize', desc: 'Generate short briefings for each call.', icon: Sparkles },
  { title: 'Coach', desc: 'Deliver insights that improve performance.', icon: Activity },
  { title: 'Analyze', desc: 'Measure impact across teams and workflows.', icon: BarChart3 },
]

export default function Workflow() {
  return (
    <section className="py-20" aria-label="AI workflow">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.28em] text-[#22D3EE]">AI Workflow</p>
          <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">A premium vertical timeline for every conversation.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#94A3B8]">
            From connection to coaching, every step is designed to keep teams aligned and insights actionable.
          </p>
        </div>

        <div className="mt-12 space-y-6">
          {steps.map((step, index) => (
            <div key={step.title} className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0F1C33] p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-[#22D3EE]/10">
              <div className="absolute left-8 top-6 h-[calc(100%-3rem)] w-px bg-gradient-to-b from-[#22D3EE] to-transparent opacity-0 sm:opacity-100" />
              <div className="relative flex items-start gap-5">
                <div className="flex flex-col items-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#2563EB] to-[#22D3EE] text-white shadow-lg shadow-[#22D3EE]/20">
                    <step.icon className="h-6 w-6" />
                  </div>
                  <div className="mt-4 h-14 w-px bg-white/10" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-4 text-sm text-[#94A3B8]">
                    <div className="font-semibold text-white">{step.title}</div>
                    <div className="rounded-full border border-white/10 bg-[#07111F]/70 px-3 py-1 text-xs uppercase tracking-[0.25em] text-[#94A3B8]">Step {index + 1}</div>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[#cfd7e3cc]">{step.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
