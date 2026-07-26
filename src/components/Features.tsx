import { Cloud, Mic2, MessageCircle, BarChart3, Link2, Users } from 'lucide-react'

const items = [
  { title: 'Cloud Calling', desc: 'Reliable cloud PBX with carrier connections and global coverage.', icon: Cloud },
  { title: 'AI Transcription', desc: 'Accurate, speaker-separated transcripts in seconds.', icon: Mic2 },
  { title: 'AI Summaries', desc: 'Concise call summaries for quick reviews.', icon: MessageCircle },
  { title: 'Analytics', desc: 'Call metrics, trends, and operational insights.', icon: BarChart3 },
  { title: 'CRM Integrations', desc: 'Two-way sync with popular CRMs.', icon: Link2 },
  { title: 'Team Collaboration', desc: 'Shared notes, mentions, and task handoffs.', icon: Users },
]

function FeatureCard({ title, desc, Icon }: { title: string; desc: string; Icon: typeof Cloud }) {
  return (
    <div className="group rounded-[1.75rem] border border-white/10 bg-[#0F1C33] p-8 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-[#22D3EE]/10">
      <div className="h-1.5 w-16 rounded-full bg-gradient-to-r from-[#2563EB] to-[#22D3EE]" />
      <div className="mt-6 inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-[#071926] text-[#22D3EE] shadow-md shadow-[#22D3EE]/10 transition duration-300 group-hover:bg-[#0c2c52] group-hover:scale-105">
        <Icon className="h-7 w-7" />
      </div>
      <h4 className="mt-6 text-xl font-semibold text-white">{title}</h4>
      <p className="mt-3 text-sm leading-7 text-[#94A3B8]">{desc}</p>
    </div>
  )
}

export default function Features() {
  return (
    <section id="features" className="py-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-2xl">
          <p className="text-sm uppercase tracking-[0.28em] text-[#22D3EE]">Core features</p>
          <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Everything your team needs for reliable voice workflows.</h2>
          <p className="mt-4 text-base leading-7 text-[#94A3B8]">
            Create conversations that are easier to manage, analyze, and share with AI-first tools built for modern teams.
          </p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((it) => (
            <FeatureCard key={it.title} title={it.title} desc={it.desc} Icon={it.icon} />
          ))}
        </div>
      </div>
    </section>
  )
}
