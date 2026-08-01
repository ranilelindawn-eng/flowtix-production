'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  Check,
  ChevronRight,
  Clock3,
  Cloud,
  ContactRound,
  FileAudio,
  Gauge,
  Headphones,
  KeyRound,
  Layers3,
  LockKeyhole,
  Mail,
  Menu,
  Mic2,
  Phone,
  PhoneCall,
  Play,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Users,
  WandSparkles,
  Workflow,
  X,
  Zap,
} from 'lucide-react'

import Logo from '@/components/Logo'

type ChartPeriod = '7D' | '30D' | '90D'

type Metric = {
  label: string
  value: string
  delta: string
}

const metricSets: Record<ChartPeriod, Metric[]> = {
  '7D': [
    { label: 'Total calls', value: '8,420', delta: '+14.2%' },
    { label: 'Connected', value: '6,218', delta: '+11.8%' },
    { label: 'Conversion', value: '17.9%', delta: '+2.1%' },
    { label: 'Revenue', value: '$42,860', delta: '+9.7%' },
  ],
  '30D': [
    { label: 'Total calls', value: '32,685', delta: '+12.5%' },
    { label: 'Connected', value: '24,567', delta: '+10.2%' },
    { label: 'Conversion', value: '18.6%', delta: '+2.8%' },
    { label: 'Revenue', value: '$128,430', delta: '+8.4%' },
  ],
  '90D': [
    { label: 'Total calls', value: '96,240', delta: '+18.6%' },
    { label: 'Connected', value: '73,118', delta: '+15.4%' },
    { label: 'Conversion', value: '20.1%', delta: '+3.6%' },
    { label: 'Revenue', value: '$402,910', delta: '+21.2%' },
  ],
}

const chartPaths: Record<ChartPeriod, string> = {
  '7D': 'M0 130 C52 118 75 90 118 106 S190 72 235 82 S315 44 360 55 S430 28 500 18',
  '30D': 'M0 135 C55 122 82 86 127 103 S200 64 238 78 S315 34 360 55 S425 28 500 8',
  '90D': 'M0 142 C62 128 85 105 130 116 S205 72 252 88 S325 42 368 58 S438 20 500 4',
}

const companies = ['Northstar', 'Velocity', 'Summit', 'Dexora', 'Elevate', 'Catalyst']

const productCards = [
  {
    icon: PhoneCall,
    title: 'Cloud Dialer',
    description: 'Launch clear browser calls with local presence, routing, controls, recordings, and contact context.',
    accent: 'from-blue-500/20 via-blue-400/5 to-transparent',
  },
  {
    icon: BrainCircuit,
    title: 'AI Voice & Coaching',
    description: 'Generate summaries, coaching cues, next steps, and follow-up messaging from every conversation.',
    accent: 'from-violet-500/20 via-fuchsia-400/5 to-transparent',
  },
  {
    icon: Layers3,
    title: 'Smart Pipelines',
    description: 'Keep deals moving with visual stages, probabilities, ownership, tasks, and automated handoffs.',
    accent: 'from-cyan-500/20 via-emerald-400/5 to-transparent',
  },
  {
    icon: BarChart3,
    title: 'Advanced Analytics',
    description: 'Understand team activity, call outcomes, conversion, pipeline health, and revenue performance.',
    accent: 'from-amber-500/20 via-orange-400/5 to-transparent',
  },
]

const platformFeatures = [
  { icon: ContactRound, title: 'Unified CRM', copy: 'Contacts, companies, tasks, notes, activities, and deal history in one place.' },
  { icon: Workflow, title: 'Automated workflows', copy: 'Coordinate calls, campaigns, sequences, follow-ups, and team handoffs.' },
  { icon: FileAudio, title: 'Recordings & transcripts', copy: 'Keep searchable audio, transcripts, summaries, and compliance context attached.' },
  { icon: Users, title: 'Team collaboration', copy: 'Invite members, define roles, assign ownership, and operate securely across teams.' },
  { icon: ShieldCheck, title: 'Enterprise security', copy: 'Tenant isolation, audit logs, role controls, session visibility, and secure integrations.' },
  { icon: KeyRound, title: 'Provider integrations', copy: 'Connect your own telephony, calendar, AI, and business systems without lock-in.' },
]

const workflowSteps = [
  { icon: Phone, label: 'Connect', detail: 'Bring your phone provider and numbers.' },
  { icon: ContactRound, label: 'Organize', detail: 'Centralize contacts and account context.' },
  { icon: Sparkles, label: 'Assist', detail: 'Use AI before, during, and after calls.' },
  { icon: Target, label: 'Convert', detail: 'Move opportunities forward with clarity.' },
]

const plans = [
  {
    name: 'Starter',
    price: '₱1,699',
    note: 'For solo operators and small teams.',
    features: ['5 team members', '1,000 contacts', 'Core CRM', 'Tasks and notes', 'Basic reporting'],
    href: '/signup?plan=starter',
  },
  {
    name: 'Professional',
    price: '₱4,599',
    note: 'For growing sales teams.',
    features: ['10 team members', '10,000 contacts', 'Recordings and transcripts', 'AI summaries', 'Advanced reporting'],
    href: '/signup?plan=professional',
    featured: true,
  },
  {
    name: 'Business',
    price: '₱11,599',
    note: 'For larger revenue organizations.',
    features: ['30 team members', 'Advanced permissions', 'Priority onboarding', 'Security support', 'Premium integrations'],
    href: '/signup?plan=business',
  },
  {
    name: 'Enterprise',
    price: '₱28,999',
    note: 'For high-volume organizations.',
    features: ['Unlimited team members', 'Unlimited contacts', 'Enterprise roles and controls', 'Priority onboarding and support', 'Premium integrations'],
    href: '/signup?plan=enterprise',
  },
]

const easing = [0.22, 1, 0.36, 1] as const

function Brand() {
  return (
    <Link href="/" className="inline-flex items-center gap-3" aria-label="Flowtix home">
      <span className="grid h-10 w-10 place-items-center rounded-2xl border border-blue-400/20 bg-blue-400/10">
        <Logo className="h-7 w-7" />
      </span>
      <span className="text-xl font-semibold tracking-tight text-white">Flowtix</span>
    </Link>
  )
}

function AuroraBackground() {
  const reduceMotion = useReducedMotion()

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_34%),radial-gradient(circle_at_75%_15%,rgba(14,165,233,0.14),transparent_30%),linear-gradient(180deg,#030817_0%,#030716_50%,#040a18_100%)]" />
      <motion.div
        className="absolute -left-40 top-16 h-[34rem] w-[34rem] rounded-full bg-blue-600/15 blur-[120px]"
        animate={reduceMotion ? undefined : { x: [0, 120, 30, 0], y: [0, 40, 120, 0], scale: [1, 1.15, 0.92, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute right-[-12rem] top-40 h-[38rem] w-[38rem] rounded-full bg-cyan-500/12 blur-[130px]"
        animate={reduceMotion ? undefined : { x: [0, -90, -20, 0], y: [0, 100, 20, 0], scale: [1, 0.9, 1.12, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute left-[42%] top-[32rem] h-[30rem] w-[30rem] rounded-full bg-violet-500/10 blur-[120px]"
        animate={reduceMotion ? undefined : { x: [0, 80, -40, 0], y: [0, -70, 30, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(148,163,184,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.08)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_72%)]" />
      <div className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-blue-500/[0.04] to-transparent" />
    </div>
  )
}

function Header() {
  const [open, setOpen] = useState(false)

  return (
    <header className="relative z-50 border-b border-white/[0.06] bg-[#030817]/75 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
        <Brand />
        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-300 lg:flex" aria-label="Primary navigation">
          <a href="#features" className="transition hover:text-white">Features</a>
          <a href="#ai" className="transition hover:text-white">AI</a>
          <a href="#platform" className="transition hover:text-white">Platform</a>
          <a href="#integrations" className="transition hover:text-white">Integrations</a>
          <a href="#pricing" className="transition hover:text-white">Pricing</a>
          <Link href="/help" className="transition hover:text-white">Resources</Link>
        </nav>
        <div className="hidden items-center gap-4 sm:flex">
          <Link href="/login" className="px-3 py-2 text-sm font-semibold text-slate-300 transition hover:text-white">Log in</Link>
          <Link href="/signup" className="rounded-full border border-blue-400/30 bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_35px_-12px_rgba(37,99,235,.9)] transition hover:-translate-y-0.5 hover:bg-blue-500">
            Start Free Trial
          </Link>
        </div>
        <button
          type="button"
          className="rounded-xl border border-white/10 p-2 text-slate-200 sm:hidden"
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-white/10 bg-[#050b18] px-5 py-5 sm:hidden">
          <nav className="grid gap-2 text-sm text-slate-200" aria-label="Mobile navigation">
            {['features', 'ai', 'platform', 'integrations', 'pricing'].map((item) => (
              <a key={item} href={`#${item}`} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 capitalize hover:bg-white/5">{item}</a>
            ))}
            <Link href="/login" className="rounded-xl px-3 py-3 hover:bg-white/5">Log in</Link>
            <Link href="/signup" className="mt-2 rounded-xl bg-blue-600 px-4 py-3 text-center font-semibold text-white">Start Free Trial</Link>
          </nav>
        </div>
      )}
    </header>
  )
}

function DashboardPreview() {
  const [period, setPeriod] = useState<ChartPeriod>('30D')
  const reduceMotion = useReducedMotion()
  const metrics = metricSets[period]
  const path = chartPaths[period]

  return (
    <div className="relative mx-auto w-full max-w-[800px] lg:mx-0">
      <div className="absolute -inset-16 -z-10 rounded-full bg-blue-500/20 blur-[100px]" />
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 26, rotateX: 4 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.9, ease: easing, delay: 0.15 }}
        className="relative overflow-hidden rounded-[30px] border border-blue-300/20 bg-[#07111f]/95 shadow-[0_45px_110px_-38px_rgba(37,99,235,.88)]"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-slate-400">Live workspace preview</span>
        </div>
        <div className="grid min-h-[500px] md:grid-cols-[150px_1fr]">
          <aside className="hidden border-r border-white/10 bg-[#050b18]/95 p-4 md:block">
            <div className="flex items-center gap-2 text-sm font-semibold text-white"><Logo className="h-6 w-6" /> Flowtix</div>
            <div className="mt-7 space-y-1.5">
              {[
                [Gauge, 'Dashboard'],
                [ContactRound, 'Contacts'],
                [Layers3, 'Pipelines'],
                [PhoneCall, 'Calls'],
                [Workflow, 'Campaigns'],
                [Bot, 'AI Workspace'],
                [BarChart3, 'Reports'],
                [ShieldCheck, 'Settings'],
              ].map(([Icon, label], index) => {
                const MenuIcon = Icon as typeof Gauge
                return (
                  <div key={label as string} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs ${index === 0 ? 'bg-blue-500/15 text-white' : 'text-slate-500'}`}>
                    <MenuIcon className="h-3.5 w-3.5" /> {label as string}
                  </div>
                )
              })}
            </div>
          </aside>
          <div className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-300">Sales command center</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Good morning, Jordan.</h3>
              </div>
              <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1" aria-label="Chart time range">
                {(['7D', '30D', '90D'] as ChartPeriod[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPeriod(item)}
                    aria-pressed={period === item}
                    className={`rounded-lg px-3 py-1.5 text-[11px] transition ${period === item ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {metrics.map((metric) => (
                <motion.div key={`${period}-${metric.label}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3.5">
                  <p className="text-[10px] text-slate-500">{metric.label}</p>
                  <p className="mt-1.5 text-lg font-semibold text-white">{metric.value}</p>
                  <p className="mt-1 text-[10px] text-emerald-300">{metric.delta}</p>
                </motion.div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1.55fr_0.75fr]">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Calls overview</span>
                  <span className="text-[10px] text-slate-500">{period}</span>
                </div>
                <svg viewBox="0 0 500 165" className="mt-4 w-full" role="img" aria-label={`Rising call activity over ${period}`}>
                  <defs>
                    <linearGradient id="flowtixArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.38" />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[35, 70, 105, 140].map((y) => <line key={y} x1="0" x2="500" y1={y} y2={y} stroke="rgba(148,163,184,.08)" />)}
                  <motion.path key={`${period}-area`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} d={`${path} L500 165 L0 165 Z`} fill="url(#flowtixArea)" />
                  <motion.path key={`${period}-line`} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: easing }} d={path} fill="none" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                <p className="text-xs font-semibold text-white">Call outcomes</p>
                <div className="relative mx-auto mt-5 grid h-28 w-28 place-items-center rounded-full bg-[conic-gradient(#22d3ee_0_72%,#2563eb_72%_88%,rgba(255,255,255,.08)_88%)]">
                  <div className="grid h-20 w-20 place-items-center rounded-full bg-[#07111f] text-xl font-semibold text-white">72%</div>
                </div>
                <p className="mt-4 text-center text-[10px] text-slate-500">Connected rate</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="absolute -left-8 bottom-10 hidden w-52 rounded-2xl border border-cyan-300/25 bg-[#08172a]/95 p-4 shadow-2xl backdrop-blur-xl sm:block"
        animate={reduceMotion ? undefined : { y: [0, -10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <p className="flex items-center gap-2 text-xs text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Live call</p>
        <p className="mt-3 font-semibold text-white">Esther Howard</p>
        <p className="mt-1 text-xs text-slate-400">00:02:53</p>
        <div className="mt-4 flex items-center justify-between text-slate-300">
          <Mic2 className="h-4 w-4" /><PhoneCall className="h-4 w-4" /><span className="grid h-8 w-8 place-items-center rounded-full bg-rose-500"><Phone className="h-4 w-4 rotate-[135deg] text-white" /></span>
        </div>
      </motion.div>

      <motion.div
        id="ai"
        className="absolute -right-2 top-7 hidden w-56 rounded-2xl border border-violet-300/25 bg-[#0a1830]/95 p-4 shadow-2xl backdrop-blur-xl xl:block"
        animate={reduceMotion ? undefined : { y: [0, 8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
      >
        <p className="flex items-center gap-2 text-xs font-semibold text-white"><Sparkles className="h-4 w-4 text-violet-300" /> AI Assistant</p>
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] p-3 text-[11px] leading-5 text-slate-300">
          The prospect is interested in the Professional plan. Recommend a demo and pricing follow-up.
        </div>
        <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500"><span>Ask anything...</span><Send className="h-3.5 w-3.5" /></div>
      </motion.div>

      <motion.div
        className="absolute -bottom-24 right-4 hidden w-[168px] rounded-[34px] border border-white/20 bg-[#050b18] p-2 shadow-[0_30px_70px_-20px_rgba(0,0,0,.9)] lg:block"
        animate={reduceMotion ? undefined : { rotate: [-3, -1, -3], y: [0, -8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="rounded-[27px] border border-white/10 bg-gradient-to-b from-[#08152a] to-[#030817] px-4 pb-4 pt-3 text-center">
          <div className="mx-auto h-1.5 w-14 rounded-full bg-white/15" />
          <p className="mt-6 text-[9px] text-slate-500">Mobile Dialer</p>
          <p className="mt-4 text-sm font-semibold text-white">Robert Ford</p>
          <p className="mt-1 text-[9px] text-slate-500">(555) 012-4472</p>
          <p className="mt-3 text-[10px] text-emerald-300">00:01:32</p>
          <div className="mt-5 grid grid-cols-3 gap-2 text-slate-300">
            {[Mic2, Gauge, Headphones, Activity, Users, Radio].map((Icon, index) => (
              <span key={index} className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06]"><Icon className="h-3.5 w-3.5" /></span>
            ))}
          </div>
          <span className="mx-auto mt-5 grid h-10 w-10 place-items-center rounded-full bg-rose-500"><Phone className="h-4 w-4 rotate-[135deg] text-white" /></span>
        </div>
      </motion.div>
    </div>
  )
}

function Hero() {
  const reduceMotion = useReducedMotion()

  return (
    <section className="relative overflow-hidden pb-32 pt-14 sm:pt-20 lg:pb-40 lg:pt-24">
      <div className="mx-auto grid max-w-[1480px] items-center gap-16 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-12">
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: easing }}>
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">
            <Sparkles className="h-4 w-4" /> AI-powered cloud dialer & CRM
          </div>
          <h1 className="mt-6 max-w-2xl text-5xl font-semibold tracking-[-0.055em] text-white sm:text-6xl lg:text-[5.3rem] lg:leading-[0.98]">
            Power every conversation <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">with AI.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-400 sm:text-xl">
            Call, organize, automate, coach, and grow from one intelligent sales workspace built for modern teams.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_45px_-16px_rgba(37,99,235,.95)] transition hover:-translate-y-0.5">
              Start 7-Day Free Trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/contact" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/[0.07]">
              <Play className="h-4 w-4" /> Book a Demo
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
            {['PayMongo hosted checkout', 'Secure billing', 'Philippine payment methods'].map((item) => (
              <span key={item} className="inline-flex items-center gap-2"><Check className="h-3.5 w-3.5 text-cyan-300" /> {item}</span>
            ))}
          </div>
        </motion.div>
        <DashboardPreview />
      </div>
      <div className="mx-auto mt-28 max-w-[1480px] px-5 sm:px-8 lg:px-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Trusted by fast-growing teams</p>
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
          {companies.map((company, index) => (
            <motion.div key={company} initial={reduceMotion ? false : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.06 }} className="flex items-center gap-2 text-lg font-medium text-slate-400">
              <span className="h-5 w-5 rounded-md border border-white/10 bg-white/[0.04]" /> {company}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProductStrip() {
  return (
    <section id="features" className="relative z-10 pb-24">
      <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-3 rounded-[28px] border border-white/10 bg-white/[0.025] p-3 md:grid-cols-2 xl:grid-cols-4">
          {productCards.map((item) => (
            <motion.article key={item.title} whileHover={{ y: -5 }} transition={{ duration: 0.25 }} className={`relative overflow-hidden rounded-[22px] border border-white/[0.09] bg-gradient-to-br ${item.accent} p-5`}>
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.05]"><item.icon className="h-5 w-5 text-blue-200" /></div>
              <h2 className="mt-5 text-lg font-semibold text-white">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
              <Link href="/features" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-blue-300">Learn more <ChevronRight className="h-4 w-4" /></Link>
            </motion.article>
          ))}
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.38fr]">
          <div className="grid gap-3 rounded-[24px] border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              [BrainCircuit, 'AI-powered productivity'],
              [Workflow, 'Automate workflows'],
              [Target, 'Close more deals'],
              [LockKeyhole, 'Enterprise-grade security'],
              [Users, 'Scale with your team'],
            ].map(([Icon, label]) => {
              const FeatureIcon = Icon as typeof BrainCircuit
              return <div key={label as string} className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm text-slate-300"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-500/10"><FeatureIcon className="h-4 w-4 text-blue-300" /></span>{label as string}</div>
            })}
          </div>
          <div className="rounded-[24px] border border-amber-300/35 bg-gradient-to-br from-amber-400/[0.08] to-transparent p-5">
            <div className="flex items-center gap-1 text-amber-300" aria-label="Five out of five stars">{Array.from({ length: 5 }).map((_, index) => <Star key={index} className="h-4 w-4 fill-current" />)}</div>
            <p className="mt-3 text-sm font-medium text-white">4.9/5 from 1,200+ teams</p>
            <p className="mt-1 text-sm text-slate-400">One platform sales teams love.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function PlatformSection() {
  return (
    <section id="platform" className="border-y border-white/[0.06] bg-white/[0.015] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">One revenue workspace</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Everything your team needs to turn conversations into growth.</h2>
          <p className="mt-5 text-lg leading-8 text-slate-400">Flowtix replaces scattered tools with one secure, collaborative system for calls, customer context, automation, and insight.</p>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {platformFeatures.map((feature, index) => (
            <motion.article key={feature.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.55, delay: index * 0.05, ease: easing }} className="rounded-[26px] border border-white/[0.08] bg-[#07111f]/70 p-6">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-blue-300/15 bg-blue-400/10"><feature.icon className="h-5 w-5 text-blue-300" /></span>
              <h3 className="mt-5 text-lg font-semibold text-white">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{feature.copy}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}

function AISection() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">AI that understands the work</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Turn every call into a clear next move.</h2>
          <p className="mt-5 text-lg leading-8 text-slate-400">Flowtix AI helps teams prepare, capture the conversation, summarize outcomes, coach performance, and create follow-up work without losing context.</p>
          <div className="mt-8 space-y-4">
            {[
              [Mic2, 'Live transcription and searchable conversation history'],
              [WandSparkles, 'Automatic summaries, tasks, and follow-up messaging'],
              [BrainCircuit, 'Coaching insights, objection signals, and recommended actions'],
            ].map(([Icon, copy]) => {
              const RowIcon = Icon as typeof Mic2
              return <div key={copy as string} className="flex gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/10"><RowIcon className="h-4 w-4 text-violet-300" /></span><p className="pt-2 text-sm text-slate-300">{copy as string}</p></div>
            })}
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-10 -z-10 rounded-full bg-violet-500/15 blur-[100px]" />
          <motion.div whileHover={{ rotateX: 1.5, rotateY: -1.5 }} transition={{ duration: 0.3 }} className="rounded-[30px] border border-violet-300/20 bg-gradient-to-br from-[#101530] to-[#07111f] p-5 shadow-2xl">
            <div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-500/15"><Bot className="h-5 w-5 text-violet-300" /></span><div><p className="font-semibold text-white">AI Conversation Brief</p><p className="text-xs text-slate-500">Generated from call context</p></div></div><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">Ready</span></div>
            <div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/20 p-5">
              <p className="text-sm font-semibold text-white">Prospect intent</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">The buyer is evaluating a cloud dialer for a 12-person sales team and needs reporting, recordings, and CRM automation.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-white/[0.04] p-4"><p className="text-xs text-slate-500">Sentiment</p><p className="mt-2 font-semibold text-emerald-300">Positive</p></div><div className="rounded-xl bg-white/[0.04] p-4"><p className="text-xs text-slate-500">Recommended step</p><p className="mt-2 font-semibold text-white">Book technical demo</p></div></div>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-blue-300/15 bg-blue-500/[0.06] p-4"><Sparkles className="h-5 w-5 text-blue-300" /><p className="text-sm text-slate-300">Draft a personalized follow-up email and create a demo task.</p><ArrowRight className="ml-auto h-4 w-4 text-blue-300" /></div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function WorkflowSection() {
  return (
    <section className="pb-24 sm:pb-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="rounded-[34px] border border-white/[0.08] bg-gradient-to-br from-blue-500/[0.06] via-white/[0.02] to-violet-500/[0.05] p-6 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
            <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Simple by design</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">From first call to closed deal.</h2><p className="mt-4 leading-7 text-slate-400">A focused workflow keeps every team member aligned without adding operational complexity.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {workflowSteps.map((step, index) => (
                <div key={step.label} className="relative rounded-2xl border border-white/[0.08] bg-[#07111f]/80 p-5"><span className="text-xs font-semibold text-blue-300">0{index + 1}</span><step.icon className="mt-5 h-5 w-5 text-white" /><h3 className="mt-4 font-semibold text-white">{step.label}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{step.detail}</p></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function IntegrationsSection() {
  const integrations = useMemo(() => [
    ['Twilio', PhoneCall], ['Telnyx', Radio], ['Google Calendar', Clock3], ['Microsoft Teams', Users], ['Zoom', Cloud], ['Email', Mail], ['API', KeyRound],
  ], [])

  return (
    <section id="integrations" className="border-y border-white/[0.06] bg-white/[0.015] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 text-center sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">Connect your stack</p>
        <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Built to work with the providers and tools your business already trusts.</h2>
        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {integrations.map(([name, Icon]) => {
            const IntegrationIcon = Icon as typeof PhoneCall
            return <div key={name as string} className="rounded-2xl border border-white/[0.08] bg-[#07111f]/80 p-5"><IntegrationIcon className="mx-auto h-5 w-5 text-blue-300" /><p className="mt-3 text-xs font-medium text-slate-300">{name as string}</p></div>
          })}
        </div>
        <Link href="/integrations" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-blue-300">Explore integrations <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </section>
  )
}

function PricingSection() {
  return (
    <section id="pricing" className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto max-w-3xl text-center"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">Flexible plans</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Start focused. Scale confidently.</h2><p className="mt-5 text-lg text-slate-400">Choose the workspace size that fits your team. Carrier and provider usage are billed separately.</p></div>
        <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <article key={plan.name} className={`relative rounded-[28px] border p-7 ${plan.featured ? 'border-blue-400/35 bg-gradient-to-b from-blue-500/[0.12] to-[#07111f]' : 'border-white/[0.08] bg-[#07111f]/75'}`}>
              {plan.featured && <span className="absolute right-5 top-5 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
              <p className="font-semibold text-white">{plan.name}</p><p className="mt-4 text-4xl font-semibold tracking-tight text-white">{plan.price}<span className="text-sm font-normal text-slate-500">/month</span></p><p className="mt-3 text-sm text-slate-400">{plan.note}</p>
              <ul className="mt-7 space-y-3 text-sm text-slate-300">{plan.features.map((feature) => <li key={feature} className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />{feature}</li>)}</ul>
              <Link href={plan.href} className={`mt-8 inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${plan.featured ? 'bg-blue-600 text-white hover:bg-blue-500' : 'border border-white/15 text-white hover:bg-white/[0.05]'}`}>Choose plan</Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="pb-24 sm:pb-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="relative overflow-hidden rounded-[36px] border border-blue-300/20 bg-gradient-to-br from-blue-600/25 via-[#09152a] to-violet-600/15 px-6 py-16 text-center sm:px-12 sm:py-20">
          <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_20%,rgba(34,211,238,.18),transparent_28%),radial-gradient(circle_at_80%_70%,rgba(139,92,246,.18),transparent_32%)]" />
          <div className="relative"><Zap className="mx-auto h-7 w-7 text-cyan-300" /><h2 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Build a better sales conversation from the first hello.</h2><p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">Bring calling, CRM, AI, automation, and analytics together in Flowtix.</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/signup" className="rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-slate-950">Start 7-Day Free Trial</Link><Link href="/contact" className="rounded-full border border-white/20 bg-white/[0.05] px-6 py-3.5 text-sm font-semibold text-white">Book a Demo</Link></div></div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.07] bg-[#020611]">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.2fr_repeat(3,0.7fr)]">
        <div><Brand /><p className="mt-4 max-w-sm text-sm leading-6 text-slate-500">AI-powered cloud calling and CRM for teams that want every conversation to move the business forward.</p></div>
        <div><p className="text-sm font-semibold text-white">Product</p><div className="mt-4 grid gap-3 text-sm text-slate-500"><Link href="/features">Features</Link><Link href="/ai-features">AI</Link><Link href="/integrations">Integrations</Link><Link href="/pricing">Pricing</Link></div></div>
        <div><p className="text-sm font-semibold text-white">Company</p><div className="mt-4 grid gap-3 text-sm text-slate-500"><Link href="/about">About</Link><Link href="/blog">Blog</Link><Link href="/contact">Contact</Link><Link href="/status">Status</Link></div></div>
        <div><p className="text-sm font-semibold text-white">Resources</p><div className="mt-4 grid gap-3 text-sm text-slate-500"><Link href="/docs">Documentation</Link><Link href="/help">Help Center</Link><Link href="/security">Security</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></div>
      </div>
      <div className="border-t border-white/[0.06] px-5 py-5 text-center text-xs text-slate-600">© {new Date().getFullYear()} Flowtix. All rights reserved.</div>
    </footer>
  )
}

export default function FlowtixLandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030817] text-white selection:bg-blue-500/35">
      <AuroraBackground />
      <div className="relative">
        <Header />
        <main>
          <Hero />
          <ProductStrip />
          <PlatformSection />
          <AISection />
          <WorkflowSection />
          <IntegrationsSection />
          <PricingSection />
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </div>
  )
}