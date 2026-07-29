import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ContactRound,
  FileAudio,
  FileText,
  Globe2,
  Headphones,
  KeyRound,
  Layers3,
  LockKeyhole,
  Mail,
  MessageSquareText,
  Mic2,
  Phone,
  PhoneCall,
  Play,
  Radio,
  Route,
  Send,
  ShieldCheck,
  Sparkles,
  Tags,
  Target,
  Users,
  WandSparkles,
  Workflow,
} from 'lucide-react'
import Logo from '@/components/Logo'

const primaryFeatures = [
  {
    icon: PhoneCall,
    title: 'Cloud Dialer',
    description: 'Launch calls from one focused workspace with contact context, notes, outcomes, and follow-up actions close at hand.',
  },
  {
    icon: ContactRound,
    title: 'Smart CRM',
    description: 'Manage contacts, companies, opportunities, tasks, notes, tags, and every customer interaction in one tenant-safe system.',
  },
  {
    icon: BrainCircuit,
    title: 'AI Workspace',
    description: 'Use an organization-aware assistant for research, sales messaging, call preparation, summaries, and next-step recommendations.',
  },
  {
    icon: Activity,
    title: 'AI Insights',
    description: 'Turn calls and CRM activity into clear recommendations, lead health signals, performance trends, and pipeline visibility.',
  },
  {
    icon: FileAudio,
    title: 'Recording & Transcripts',
    description: 'Keep call recordings, searchable transcripts, summaries, and conversation records attached to the right workflow.',
  },
  {
    icon: Workflow,
    title: 'Sequences & Automation',
    description: 'Coordinate structured follow-ups across calls, email, SMS, tasks, campaigns, and team handoffs.',
  },
]

const allFeatures = [
  { icon: Phone, label: 'Power & preview dialer' },
  { icon: Radio, label: 'Live call monitoring' },
  { icon: Route, label: 'Queues & ring groups' },
  { icon: Headphones, label: 'Call controls & transfers' },
  { icon: FileAudio, label: 'Cloud recordings' },
  { icon: FileText, label: 'Searchable transcripts' },
  { icon: Sparkles, label: 'AI call summaries' },
  { icon: Bot, label: 'AI sales assistant' },
  { icon: WandSparkles, label: 'Email & SMS writing' },
  { icon: Target, label: 'Lead scoring & next actions' },
  { icon: ContactRound, label: 'Contacts & companies' },
  { icon: Layers3, label: 'Visual pipelines' },
  { icon: CalendarDays, label: 'Tasks & scheduling' },
  { icon: Tags, label: 'Tags, snippets & templates' },
  { icon: Mail, label: 'Email & SMS workspace' },
  { icon: Workflow, label: 'Campaigns & sequences' },
  { icon: BarChart3, label: 'Reports & analytics' },
  { icon: Users, label: 'Team roles & permissions' },
  { icon: Clock3, label: 'Time & attendance' },
  { icon: ShieldCheck, label: 'Security center & audit logs' },
  { icon: KeyRound, label: 'API keys & integrations' },
  { icon: CircleDollarSign, label: 'Subscription & usage controls' },
  { icon: Building2, label: 'Multi-tenant organizations' },
  { icon: Globe2, label: 'Organization time zones' },
]

const plans = [
  {
    name: 'Starter',
    price: '$29',
    description: 'For solo operators, virtual assistants, and small teams building a reliable calling workflow.',
    features: ['Up to 5 team members', '1,000 contacts', 'Core CRM workspace', 'Contacts, tasks, and notes', 'Campaign and call records', 'Basic reporting'],
    href: '/signup?plan=starter',
    featured: false,
  },
  {
    name: 'Professional',
    price: '$79',
    description: 'For active sales teams that need collaboration, recordings, AI, and advanced workflow controls.',
    features: ['Up to 10 team members', '10,000 contacts', 'Recordings and transcripts', 'AI summaries and analysis', 'Advanced analytics', 'Priority support'],
    href: '/signup?plan=professional',
    featured: true,
  },
  {
    name: 'Business',
    price: '$199',
    description: 'For larger organizations that require advanced permissions, onboarding, and implementation support.',
    features: ['Up to 30 team members', 'Unlimited contact lists', 'Advanced permissions', 'Custom onboarding', 'Security review support', 'Priority implementation'],
    href: '/signup?plan=business',
    featured: false,
  },
  {
    name: 'Enterprise',
    price: '$499',
    description: 'For high-volume teams that need greater scale, custom controls, and dedicated support.',
    features: ['Unlimited team scale', 'Custom security controls', 'Dedicated onboarding', 'Priority support', 'Advanced integrations', 'Custom implementation planning'],
    href: '/signup?plan=enterprise',
    featured: false,
  },
]

const faqItems = [
  ['Can CallFlow replace separate dialer and CRM tools?', 'CallFlow is designed to bring cloud calling, contact management, pipelines, campaigns, recordings, transcripts, reporting, and AI-assisted workflows into one workspace.'],
  ['Do I need a payment method for the trial?', 'Yes. A payment method is collected securely through Stripe. The selected subscription begins after the 7-day trial unless it is cancelled beforehand.'],
  ['Are call minutes included in the subscription?', 'Carrier numbers, call minutes, messaging, transcription processing, and other third-party provider charges are separate from the CallFlow software subscription.'],
  ['Can I invite my whole team?', 'Yes. Owners can invite members and assign roles. Plan member limits apply, and organization data remains isolated from other CallFlow customers.'],
  ['Can I use my own calling provider?', 'CallFlow is designed around provider integrations, including programmable voice workflows. Provider credentials and usage charges are configured separately.'],
  ['Is AI included?', 'AI Workspace, AI insights, summaries, and content-generation workflows are supported when an AI provider is connected and configured for the organization.'],
]

function BrandMark() {
  return (
    <Link href="/" className="inline-flex items-center gap-3" aria-label="CallFlow home">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10">
        <Logo className="h-7 w-7" />
      </span>
      <span className="text-lg font-semibold tracking-tight text-white">CallFlow</span>
    </Link>
  )
}

function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050b18]/85 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 sm:px-6 lg:px-8">
        <BrandMark />
        <nav className="hidden items-center gap-7 text-sm font-medium text-slate-300 lg:flex" aria-label="Primary navigation">
          <a href="#features" className="transition hover:text-white">Features</a>
          <a href="#ai" className="transition hover:text-white">AI</a>
          <a href="#platform" className="transition hover:text-white">Platform</a>
          <a href="#integrations" className="transition hover:text-white">Integrations</a>
          <a href="#pricing" className="transition hover:text-white">Pricing</a>
          <Link href="/help" className="transition hover:text-white">Resources</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden text-sm font-semibold text-slate-300 transition hover:text-white sm:inline-flex">Log in</Link>
          <Link href="/signup" className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:-translate-y-0.5">
            Start Free Trial
          </Link>
        </div>
      </div>
    </header>
  )
}

function ProductDashboard() {
  const recentCalls = [
    ['Robert Ford', '+1 (555) 012-4472', 'Connected'],
    ['Esther Howard', '+1 (555) 018-3014', 'Follow-up'],
    ['Cameron Williamson', '+1 (555) 016-9821', 'Qualified'],
  ]

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <div className="absolute -inset-10 -z-10 rounded-full bg-blue-500/20 blur-3xl" />
      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#07111f]/95 shadow-[0_40px_100px_-35px_rgba(16,76,180,0.75)]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-slate-400">Live product preview</div>
        </div>

        <div className="grid min-h-[510px] md:grid-cols-[150px_1fr]">
          <aside className="hidden border-r border-white/10 bg-[#050b18] p-4 md:block">
            <div className="flex items-center gap-2 text-sm font-semibold text-white"><span className="h-7 w-7 rounded-lg bg-cyan-400/15" /> CallFlow</div>
            <div className="mt-8 space-y-2 text-xs text-slate-400">
              {['Dashboard', 'Contacts', 'Companies', 'Calls', 'Pipelines', 'Campaigns', 'AI Workspace', 'Reports'].map((item, index) => (
                <div key={item} className={`rounded-xl px-3 py-2.5 ${index === 0 ? 'bg-blue-500/15 text-white' : ''}`}>{item}</div>
              ))}
            </div>
          </aside>

          <div className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">Sales command center</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Good morning, Jordan.</h3>
              </div>
              <div className="flex gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">AI active</span>
                <span className="rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Start call</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ['Total calls', '32,685', '+12.5%'],
                ['Connected', '24,567', '+10.2%'],
                ['Conversion', '18.6%', '+2.8%'],
                ['Pipeline', '$128,430', '+8.4%'],
              ].map(([label, value, delta]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-2 text-xl font-semibold text-white">{value}</p>
                  <p className="mt-1 text-xs text-emerald-300">{delta}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.45fr_0.75fr]">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Calls overview</p>
                  <span className="text-xs text-slate-500">Last 30 days</span>
                </div>
                <svg viewBox="0 0 500 160" className="mt-4 w-full" role="img" aria-label="Sample rising call activity chart">
                  <defs>
                    <linearGradient id="callflow-chart" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0 130 C55 118,80 85,125 104 S196 62,235 77 S310 32,355 54 S420 25,500 8 L500 160 L0 160 Z" fill="url(#callflow-chart)" />
                  <path d="M0 130 C55 118,80 85,125 104 S196 62,235 77 S310 32,355 54 S420 25,500 8" fill="none" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" />
                </svg>
                <div className="mt-4 space-y-3">
                  {recentCalls.map(([name, number, status]) => (
                    <div key={name} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl bg-[#050b18]/70 px-3 py-2.5 text-xs">
                      <div><p className="font-medium text-white">{name}</p><p className="mt-0.5 text-slate-500">{number}</p></div>
                      <span className="self-center rounded-full bg-cyan-400/10 px-2.5 py-1 text-cyan-300">{status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                  <p className="text-sm font-semibold text-white">Call outcomes</p>
                  <div className="mx-auto mt-5 flex h-28 w-28 items-center justify-center rounded-full bg-[conic-gradient(#22d3ee_0_72%,#2563eb_72%_88%,#1e293b_88%)]">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#0b1424] text-center"><span className="text-lg font-semibold text-white">72%</span></div>
                  </div>
                  <p className="mt-3 text-center text-xs text-slate-400">Connected rate</p>
                </div>
                <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.07] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-violet-200"><Sparkles className="h-4 w-4" /> AI recommendation</div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">Follow up with five qualified leads before 3:00 PM.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -left-4 top-40 hidden w-48 rounded-2xl border border-white/10 bg-[#0c1729]/95 p-4 shadow-2xl lg:block">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Live call</div>
        <p className="mt-3 text-sm font-medium text-white">Esther Howard</p>
        <p className="mt-1 text-xs text-slate-500">00:02:53</p>
        <div className="mt-4 flex justify-between text-slate-400"><Mic2 className="h-4 w-4" /><Phone className="h-4 w-4" /><span className="h-4 w-4 rounded-full bg-rose-400" /></div>
      </div>

      <div className="absolute -right-5 top-10 hidden w-56 rounded-2xl border border-cyan-300/20 bg-[#0c1729]/95 p-4 shadow-2xl xl:block">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300"><Bot className="h-4 w-4" /> AI Assistant</div>
        <p className="mt-3 rounded-xl bg-white/5 p-3 text-xs leading-5 text-slate-300">The prospect is interested in the Professional plan. Recommend a demo and pricing follow-up.</p>
        <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-500"><span>Ask anything…</span><Send className="h-3.5 w-3.5" /></div>
      </div>
    </div>
  )
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden pb-24 pt-16 sm:pt-24 lg:pb-32">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-[-5%] h-[460px] w-[460px] rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute right-[-5%] top-[10%] h-[420px] w-[420px] rounded-full bg-violet-600/15 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
      </div>

      <div className="relative mx-auto grid max-w-7xl gap-16 px-5 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <Sparkles className="h-4 w-4" /> AI-powered cloud dialer & CRM
          </div>
          <h1 className="mt-7 max-w-3xl text-5xl font-black tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl lg:leading-[0.95]">
            Power every conversation <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent">with AI.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300 sm:text-xl">
            Call, organize, automate, coach, and grow from one intelligent sales workspace built for modern teams.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-7 py-4 font-semibold text-white shadow-xl shadow-blue-950/50 transition hover:-translate-y-0.5">
              Start 7-Day Free Trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/contact" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-7 py-4 font-semibold text-white transition hover:bg-white/[0.08]">
              <Play className="h-4 w-4" /> Book a Demo
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-400">
            {['$0 due today', 'Secure Stripe billing', 'Cancel during trial'].map((item) => <span key={item} className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-cyan-300" />{item}</span>)}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-5 border-t border-white/10 pt-7">
            <div className="flex -space-x-2">
              {['SL', 'JM', 'AR', 'BK'].map((initials) => <span key={initials} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#050b18] bg-slate-800 text-[10px] font-semibold text-slate-200">{initials}</span>)}
            </div>
            <div><p className="text-sm font-medium text-white">Built for sales teams, call centers, and agencies</p><p className="mt-1 text-xs text-slate-500">One workspace for conversations and revenue operations</p></div>
          </div>
        </div>
        <ProductDashboard />
      </div>
    </section>
  )
}

function FeatureSection() {
  return (
    <section id="features" className="border-y border-white/10 bg-white/[0.015] py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">Everything you need</p>
          <h2 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">All the tools to turn conversations into growth.</h2>
          <p className="mt-5 text-lg leading-8 text-slate-400">Replace disconnected dialer, CRM, follow-up, reporting, and AI tools with one coordinated workspace.</p>
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {primaryFeatures.map(({ icon: Icon, title, description }) => (
            <article key={title} className="group rounded-3xl border border-white/10 bg-[#0a1425] p-7 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/25 hover:bg-[#0c182b]">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.07] text-cyan-300"><Icon className="h-6 w-6" /></div>
              <h3 className="mt-6 text-xl font-semibold text-white">{title}</h3>
              <p className="mt-3 leading-7 text-slate-400">{description}</p>
              <Link href="/features" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-300">Explore feature <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function AISection() {
  return (
    <section id="ai" className="relative overflow-hidden py-24">
      <div className="absolute left-1/2 top-1/2 -z-10 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/10 blur-[120px]" />
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-violet-300">AI that works for you</p>
          <h2 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">Turn every call into a clear next step.</h2>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-400">CallFlow connects conversation intelligence with the CRM, so summaries, coaching, recommended actions, and follow-ups stay attached to the right customer record.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {['Call summaries', 'Sentiment analysis', 'Objection detection', 'Lead scoring', 'Next-best-action suggestions', 'AI email and SMS writing', 'Sales coaching', 'Organization-aware AI chat'].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-slate-300"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/15 text-blue-300"><Check className="h-3.5 w-3.5" /></span>{item}</div>
            ))}
          </div>
          <Link href="/ai-features" className="mt-9 inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-500">See AI in action <ArrowRight className="h-4 w-4" /></Link>
        </div>

        <div className="relative">
          <div className="rounded-[2rem] border border-white/10 bg-[#0a1425] p-6">
            <div className="grid gap-4 sm:grid-cols-[1fr_0.9fr]">
              <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-blue-400/20 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.24),transparent_55%)] p-8">
                <div className="relative flex h-52 w-52 items-center justify-center rounded-full border border-blue-400/20">
                  <div className="absolute inset-5 rounded-full border border-cyan-300/15" />
                  <div className="absolute inset-12 rounded-full bg-blue-500/15 blur-xl" />
                  <BrainCircuit className="relative h-24 w-24 text-cyan-300" />
                  {[Phone, Mail, BarChart3, MessageSquareText].map((Icon, index) => {
                    const positions = ['-top-4 left-1/2 -translate-x-1/2', 'right-[-18px] top-1/2 -translate-y-1/2', '-bottom-4 left-1/2 -translate-x-1/2', 'left-[-18px] top-1/2 -translate-y-1/2']
                    return <span key={index} className={`absolute ${positions[index]} flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#0e1b31] text-blue-300`}><Icon className="h-4 w-4" /></span>
                  })}
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-[#050b18] p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles className="h-4 w-4 text-violet-300" /> AI call summary</div>
                  <p className="mt-4 text-sm leading-6 text-slate-400">The prospect confirmed a 10-seat rollout, requested a workflow demo, and wants pricing by Friday.</p>
                  <div className="mt-4 space-y-2 text-xs text-slate-300">
                    <p className="rounded-xl bg-white/5 p-3"><strong className="text-white">Sentiment:</strong> Positive</p>
                    <p className="rounded-xl bg-white/5 p-3"><strong className="text-white">Next step:</strong> Schedule demo</p>
                  </div>
                </div>
                <div className="rounded-3xl border border-cyan-300/15 bg-cyan-300/[0.05] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Recommended action</p>
                  <p className="mt-3 text-sm leading-6 text-slate-300">Create a follow-up task and send the Professional plan overview.</p>
                  <button type="button" className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">Add follow-up task</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function PlatformSection() {
  const stages = [
    ['Lead', ['Michael Scott', 'Dwight Schrute', 'Jim Halpert']],
    ['Qualified', ['Pam Beesly', 'Angela Martin']],
    ['Proposal', ['Stanley Hudson', 'Kevin Malone']],
    ['Won', ['Ryan Howard']],
  ]

  return (
    <section id="platform" className="py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="rounded-[2.25rem] border border-white/10 bg-gradient-to-br from-[#0b172a] to-[#0a1020] p-6 sm:p-9">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">One operating system</p>
              <h2 className="mt-4 text-4xl font-bold tracking-tight text-white">All your conversations, customers, and revenue in one place.</h2>
              <p className="mt-5 leading-8 text-slate-400">Connect calls, contacts, pipeline stages, campaigns, tasks, and team activity so no follow-up gets lost.</p>
              <div className="mt-8 grid grid-cols-3 gap-3">
                {[['32,685', 'Total calls'], ['24,567', 'Connected'], ['18.6%', 'Conversion']].map(([value, label]) => <div key={label} className="rounded-2xl bg-white/[0.04] p-4"><p className="text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>)}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stages.map(([stage, names]) => (
                <div key={stage as string} className="rounded-2xl border border-white/10 bg-[#050b18]/75 p-4">
                  <div className="flex items-center justify-between"><p className="text-sm font-semibold text-white">{stage}</p><span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-500">{(names as string[]).length}</span></div>
                  <div className="mt-4 space-y-3">{(names as string[]).map((name, index) => <div key={name} className="rounded-xl border border-white/5 bg-white/[0.035] p-3"><p className="text-xs font-medium text-white">{name}</p><p className="mt-1 text-[10px] text-slate-500">${[5400, 3800, 7100][index % 3].toLocaleString()}</p></div>)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {allFeatures.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-4 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/[0.045]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300"><Icon className="h-4 w-4" /></span>{label}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function IntegrationsSection() {
  const integrations = ['Twilio', 'Stripe', 'Supabase', 'Google Workspace', 'Microsoft Teams', 'Slack', 'HubSpot', 'Salesforce', 'Zoom', 'Zapier', 'Make', 'n8n']
  return (
    <section id="integrations" className="border-y border-white/10 bg-white/[0.015] py-24">
      <div className="mx-auto max-w-7xl px-5 text-center sm:px-6 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">Connect your stack</p>
        <h2 className="mt-4 text-4xl font-bold text-white sm:text-5xl">Seamless integrations, fewer disconnected tools.</h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-400">Bring calling, billing, authentication, collaboration, CRM, and automation providers into a unified operating workflow.</p>
        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {integrations.map((integration) => <div key={integration} className="flex min-h-24 items-center justify-center rounded-2xl border border-white/10 bg-[#0a1425] px-4 text-sm font-semibold text-slate-300">{integration}</div>)}
        </div>
        <Link href="/integrations" className="mt-9 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300">View integrations <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </section>
  )
}

function SecuritySection() {
  return (
    <section className="py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-300">Built for accountable teams</p>
          <h2 className="mt-4 text-4xl font-bold text-white sm:text-5xl">Security, permissions, and tenant isolation from day one.</h2>
          <p className="mt-5 text-lg leading-8 text-slate-400">Each organization gets its own workspace, role-based access model, security controls, audit history, and owner-managed settings.</p>
          <Link href="/security" className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 font-semibold text-white transition hover:bg-white/5">Visit Security Center <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            [LockKeyhole, 'Multi-tenant isolation', 'Organization-scoped data and Row Level Security keep customer workspaces separated.'],
            [Users, 'Role-based permissions', 'Owner, Admin, Manager, and Agent roles support controlled access across the workspace.'],
            [ShieldCheck, 'Audit and security logs', 'Track key security events, sessions, organization changes, and sensitive actions.'],
            [KeyRound, 'Protected provider credentials', 'Server-side keys, environment variables, and API settings stay out of public client code.'],
          ].map(([Icon, title, description]) => {
            const SecurityIcon = Icon as typeof LockKeyhole
            return <article key={title as string} className="rounded-3xl border border-white/10 bg-[#0a1425] p-6"><SecurityIcon className="h-6 w-6 text-emerald-300" /><h3 className="mt-5 text-lg font-semibold text-white">{title as string}</h3><p className="mt-3 text-sm leading-7 text-slate-400">{description as string}</p></article>
          })}
        </div>
      </div>
    </section>
  )
}

function PricingSection() {
  return (
    <section id="pricing" className="border-y border-white/10 bg-white/[0.015] py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">Simple, transparent pricing</p>
          <h2 className="mt-4 text-4xl font-bold text-white sm:text-5xl">Choose the plan that fits your team.</h2>
          <p className="mt-5 text-lg text-slate-400">Start with a 7-day free trial. Provider usage fees are billed separately.</p>
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <article key={plan.name} className={`relative flex flex-col rounded-3xl border p-7 ${plan.featured ? 'border-blue-400/40 bg-gradient-to-b from-blue-500/10 to-white/[0.035]' : 'border-white/10 bg-[#0a1425]'}`}>
              {plan.featured ? <span className="absolute right-5 top-5 rounded-full bg-blue-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300">Most popular</span> : null}
              <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
              <div className="mt-6 flex items-end gap-2"><span className="text-4xl font-bold text-white">{plan.price}</span><span className="pb-1 text-sm text-slate-500">/month</span></div>
              <p className="mt-5 min-h-24 text-sm leading-7 text-slate-400">{plan.description}</p>
              <ul className="mt-6 flex-1 space-y-3">{plan.features.map((feature) => <li key={feature} className="flex gap-2.5 text-sm text-slate-300"><Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />{feature}</li>)}</ul>
              <Link href={plan.href} className={`mt-8 inline-flex justify-center rounded-full px-5 py-3 text-sm font-semibold ${plan.featured ? 'bg-blue-600 text-white' : 'border border-white/15 bg-white/[0.035] text-white'}`}>Start Free Trial</Link>
            </article>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-slate-500">Telephone numbers, carrier charges, call minutes, messaging, and third-party AI processing are not included in the software subscription.</p>
      </div>
    </section>
  )
}

function FAQSection() {
  return (
    <section className="py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:px-8">
        <div><p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">FAQ</p><h2 className="mt-4 text-4xl font-bold text-white">Frequently asked questions.</h2><p className="mt-5 leading-8 text-slate-400">Need help evaluating CallFlow for your team? Our contact and help pages are ready for deeper questions.</p><Link href="/contact" className="mt-7 inline-flex items-center gap-2 font-semibold text-cyan-300">Talk to us <ArrowRight className="h-4 w-4" /></Link></div>
        <div className="space-y-3">
          {faqItems.map(([question, answer]) => (
            <details key={question} className="group rounded-2xl border border-white/10 bg-[#0a1425] p-5 open:border-cyan-300/20">
              <summary className="flex list-none items-center justify-between gap-4 font-semibold text-white"><span>{question}</span><span className="text-cyan-300 transition group-open:rotate-45">+</span></summary>
              <p className="mt-4 pr-8 text-sm leading-7 text-slate-400">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="px-5 pb-24 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.25rem] border border-blue-400/20 bg-gradient-to-r from-blue-700/90 via-indigo-700/85 to-violet-700/90 px-6 py-16 text-center sm:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.24),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(168,85,247,0.22),transparent_35%)]" />
        <div className="relative mx-auto max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-100">Ready to power every conversation?</p><h2 className="mt-4 text-4xl font-bold text-white sm:text-5xl">Give your team one place to call, follow up, collaborate, and grow.</h2><p className="mt-5 text-lg text-blue-100">Start your 7-day trial with secure Stripe billing and build your complete sales workspace.</p><div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/signup" className="rounded-full bg-white px-7 py-4 font-semibold text-blue-700">Start Free Trial</Link><Link href="/contact" className="rounded-full border border-white/30 bg-white/10 px-7 py-4 font-semibold text-white">Book a Demo</Link></div></div>
      </div>
    </section>
  )
}

function LandingFooter() {
  const groups = [
    ['Product', [['Features', '/features'], ['Pricing', '/pricing'], ['AI Features', '/ai-features'], ['Integrations', '/integrations']]],
    ['Solutions', [['Sales Teams', '/solutions'], ['Call Centers', '/solutions'], ['Agencies', '/solutions'], ['Virtual Assistants', '/solutions']]],
    ['Resources', [['Documentation', '/docs'], ['Help Center', '/help'], ['Blog', '/blog'], ['Status', '/status']]],
    ['Company', [['About', '/about'], ['Contact', '/contact'], ['Security', '/security'], ['Privacy', '/privacy']]],
  ] as const
  return (
    <footer className="border-t border-white/10 bg-[#040914] px-5 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.15fr_2fr]">
        <div><BrandMark /><p className="mt-5 max-w-sm text-sm leading-7 text-slate-500">An AI-powered cloud dialer and CRM workspace for teams that want every conversation organized, actionable, and connected.</p></div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">{groups.map(([title, links]) => <div key={title}><h3 className="text-sm font-semibold text-white">{title}</h3><div className="mt-4 grid gap-3">{links.map(([label, href]) => <Link key={label} href={href} className="text-sm text-slate-500 transition hover:text-white">{label}</Link>)}</div></div>)}</div>
      </div>
      <div className="mx-auto mt-12 flex max-w-7xl flex-col gap-4 border-t border-white/10 pt-6 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between"><p>© {new Date().getFullYear()} CallFlow. All rights reserved.</p><div className="flex flex-wrap gap-5"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/acceptable-use">Acceptable Use</Link><Link href="/recording-consent">Recording Consent</Link></div></div>
    </footer>
  )
}

export default function CallFlowLandingPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#050b18] text-white">
      <LandingHeader />
      <main>
        <HeroSection />
        <div className="border-y border-white/10 bg-[#07111f] py-7"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-12 gap-y-5 px-5 text-sm font-semibold text-slate-500 sm:px-6 lg:px-8">{['Sales teams', 'Call centers', 'Agencies', 'Virtual assistants', 'Growing businesses'].map((item) => <span key={item}>{item}</span>)}</div></div>
        <FeatureSection />
        <AISection />
        <PlatformSection />
        <IntegrationsSection />
        <SecuritySection />
        <PricingSection />
        <FAQSection />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  )
}
