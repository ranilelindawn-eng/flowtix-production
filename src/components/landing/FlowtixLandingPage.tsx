'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  Check,
  ContactRound,
  Headphones,
  Layers3,
  LockKeyhole,
  Menu,
  PhoneCall,
  Play,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  X,
  Zap,
} from 'lucide-react'

import {
  FLOWTIX_PLAN_ORDER,
  FLOWTIX_PLANS,
} from '@/lib/plans/catalog'

const plans = FLOWTIX_PLAN_ORDER.map((code) => {
  const plan = FLOWTIX_PLANS[code]
  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(plan.publicPriceUsdCents / 100)

  return {
    name: plan.name,
    price: plan.priceStartsAt ? `From ${formattedPrice}` : formattedPrice,
    description: plan.description,
    features: plan.marketingFeatures.slice(0, 7),
    href: plan.selfService ? `/signup?plan=${plan.publicSlug}` : '/contact?topic=enterprise',
    cta: plan.selfService ? 'Start Free Trial' : 'Contact Flowtix',
    featured: plan.code === 'pro',
  }
})

const features = [
  {
    icon: PhoneCall,
    title: 'Cloud Dialer',
    copy: 'Call from the Flowtix workspace with provider-connected numbers, contact context, recordings, and call controls.',
    href: '/ai-cloud-dialer',
  },
  {
    icon: BrainCircuit,
    title: 'AI Assistant',
    copy: 'Turn conversations into summaries, coaching insights, follow-up drafts, and useful next actions.',
    href: '/ai-features',
  },
  {
    icon: Layers3,
    title: 'Pipelines & CRM',
    copy: 'Organize contacts, companies, deals, tasks, activities, and sales progress in one connected workspace.',
    href: '/sales-crm',
  },
  {
    icon: Workflow,
    title: 'Automation',
    copy: 'Coordinate sequences, campaigns, post-call follow-up, and background work with controlled automation.',
    href: '/sales-automation',
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    copy: 'Review call, agent, campaign, sales, and operational performance from your Flowtix reporting workspace.',
    href: '/features',
  },
]

const proofPoints = [
  ['Multi-tenant', 'Organization-isolated workspace'],
  ['Provider-ready', 'Connect supported calling providers'],
  ['AI-assisted', 'Summaries, analysis, and follow-up'],
  ['Production-focused', 'Security, permissions, and auditability'],
]

function Brand() {
  return (
    <Link href="/" className="inline-flex items-center gap-3" aria-label="Flowtix home">
      <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-cyan-300/30 bg-[#07111f] shadow-[0_0_28px_rgba(14,165,233,.22)]">
        <Image
          src="/flowtix-logo-512.png"
          alt=""
          width={40}
          height={40}
          className="h-full w-full object-cover"
        />
      </span>
      <span className="text-xl font-semibold tracking-tight text-white">Flowtix</span>
    </Link>
  )
}

function Header() {
  const [open, setOpen] = useState(false)

  return (
    <header className="relative z-50 border-b border-white/[0.06] bg-[#030711]/80 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
        <Brand />
        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-300 lg:flex" aria-label="Primary navigation">
          <a href="#features" className="transition hover:text-white">Features</a>
          <a href="#ai" className="transition hover:text-white">AI</a>
          <a href="#platform" className="transition hover:text-white">Platform</a>
          <Link href="/integrations" className="transition hover:text-white">Integrations</Link>
          <a href="#pricing" className="transition hover:text-white">Pricing</a>
          <Link href="/help" className="transition hover:text-white">Resources</Link>
        </nav>
        <div className="hidden items-center gap-4 sm:flex">
          <Link href="/login" className="px-3 py-2 text-sm font-semibold text-slate-300 transition hover:text-white">Log in</Link>
          <Link href="/signup" className="rounded-xl border border-fuchsia-300/30 bg-gradient-to-r from-blue-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_30px_rgba(124,58,237,.32)] transition hover:-translate-y-0.5">
            Start Free Trial <ArrowRight className="ml-1 inline h-4 w-4" />
          </Link>
        </div>
        <button type="button" className="rounded-xl border border-white/10 p-2 text-slate-200 sm:hidden" aria-label={open ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <nav className="grid gap-2 border-t border-white/10 bg-[#050914] px-5 py-5 text-sm text-slate-200 sm:hidden" aria-label="Mobile navigation">
          <a href="#features" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 hover:bg-white/5">Features</a>
          <a href="#ai" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 hover:bg-white/5">AI</a>
          <a href="#platform" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 hover:bg-white/5">Platform</a>
          <Link href="/integrations" className="rounded-xl px-3 py-3 hover:bg-white/5">Integrations</Link>
          <a href="#pricing" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 hover:bg-white/5">Pricing</a>
          <Link href="/login" className="rounded-xl px-3 py-3 hover:bg-white/5">Log in</Link>
          <Link href="/signup" className="mt-2 rounded-xl bg-gradient-to-r from-blue-600 to-fuchsia-600 px-4 py-3 text-center font-semibold text-white">Start Free Trial</Link>
        </nav>
      )}
    </header>
  )
}

function AmbientBackground() {
  const reduceMotion = useReducedMotion()
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(37,99,235,.18),transparent_28%),radial-gradient(circle_at_76%_16%,rgba(168,85,247,.14),transparent_30%),linear-gradient(180deg,#02050d_0%,#030817_48%,#020611_100%)]" />
      <motion.div className="absolute left-[42%] top-24 h-[30rem] w-[30rem] rounded-full border border-blue-400/10" animate={reduceMotion ? undefined : { rotate: 360 }} transition={{ duration: 36, repeat: Infinity, ease: 'linear' }} />
      <motion.div className="absolute left-[45%] top-36 h-[24rem] w-[42rem] rounded-[50%] border border-fuchsia-400/10" animate={reduceMotion ? undefined : { rotate: -360 }} transition={{ duration: 42, repeat: Infinity, ease: 'linear' }} />
      <div className="absolute left-[58%] top-40 h-80 w-80 rounded-full bg-blue-600/15 blur-[120px]" />
      <div className="absolute right-[4%] top-28 h-72 w-72 rounded-full bg-fuchsia-600/10 blur-[120px]" />
    </div>
  )
}

function BrandBannerVisual() {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="relative mx-auto w-full max-w-[760px] overflow-hidden rounded-[28px] border border-cyan-300/25 bg-[#07101f] shadow-[0_35px_100px_-35px_rgba(14,165,233,.78)]"
    >
      <Image
        src="/flowtix-hero-banner.png"
        alt="Flowtix.work AI cloud dialer and CRM"
        width={1270}
        height={375}
        priority
        sizes="(max-width: 1024px) 100vw, 760px"
        className="h-auto w-full object-cover"
      />
      <div className="border-t border-white/10 bg-[#050a14]/95 px-5 py-4 sm:px-6">
        <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-cyan-300">
          AI cloud dialer · CRM · automation · analytics
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Bring calling, customer context, AI assistance, workflows, and reporting into one Flowtix workspace.
        </p>
      </div>
    </motion.div>
  )
}

function Hero() {
  return (
    <section className="relative pb-20 pt-16 sm:pb-24 sm:pt-24">
      <div className="mx-auto grid max-w-[1480px] gap-16 px-5 sm:px-8 lg:grid-cols-[.78fr_1.22fr] lg:items-center lg:px-10">
        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-xl border border-violet-300/15 bg-violet-500/[0.07] px-3 py-2 text-[11px] font-semibold uppercase tracking-[.16em] text-violet-200"><Sparkles className="h-3.5 w-3.5" /> AI-powered cloud dialer & CRM</div>
          <h1 className="mt-7 text-5xl font-semibold leading-[.98] tracking-[-.055em] text-white sm:text-6xl lg:text-[4.7rem]">Power every <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">conversation.</span></h1>
          <p className="mt-7 max-w-lg text-lg leading-8 text-slate-400">Call, organize, automate, coach, and grow from one intelligent sales workspace built for modern teams.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-fuchsia-600 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_0_35px_rgba(124,58,237,.3)] transition hover:-translate-y-0.5">Start 7-Day Free Trial <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/contact" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.025] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/[0.06]"><Play className="h-4 w-4" /> Book a Demo</Link>
          </div>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-xs text-slate-500"><span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> No credit card</span><span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Secure billing</span><span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Cancel during trial</span></div>
        </div>
        <BrandBannerVisual />
      </div>
    </section>
  )
}

function FeatureSection() {
  return (
    <section id="features" className="border-y border-white/[0.06] bg-[#020611]/65 py-20 sm:py-24">
      <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300">Built for modern sales teams</p><h2 className="mt-4 text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl">Everything you need to sell smarter.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5">{features.map((feature, index) => <article key={feature.title} className="group rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.035] to-transparent p-6 transition duration-300 hover:-translate-y-1 hover:border-violet-300/25"><span className={`grid h-11 w-11 place-items-center rounded-xl ${['bg-emerald-500/10 text-emerald-300','bg-violet-500/10 text-violet-300','bg-cyan-500/10 text-cyan-300','bg-amber-500/10 text-amber-300','bg-emerald-500/10 text-emerald-300'][index]}`}><feature.icon className="h-5 w-5" /></span><h3 className="mt-5 font-semibold text-white">{feature.title}</h3><p className="mt-3 text-sm leading-6 text-slate-500">{feature.copy}</p><Link href={feature.href} className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-blue-300">Learn more <ArrowRight className="h-3.5 w-3.5" /></Link></article>)}</div>
      </div>
    </section>
  )
}

function PlatformSection() {
  return (
    <section id="platform" className="py-20 sm:py-24">
      <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{proofPoints.map(([title, copy], index) => <div key={title} className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${index === 0 ? 'bg-blue-500/10 text-blue-300' : index === 1 ? 'bg-emerald-500/10 text-emerald-300' : index === 2 ? 'bg-violet-500/10 text-violet-300' : 'bg-amber-500/10 text-amber-300'}`}>{index === 0 ? <Users className="h-5 w-5" /> : index === 1 ? <PhoneCall className="h-5 w-5" /> : index === 2 ? <Sparkles className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}</span><div><p className="font-semibold text-white">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{copy}</p></div></div>)}</div>
      </div>
    </section>
  )
}

function PricingSection() {
  return (
    <section id="pricing" className="border-t border-white/[0.06] py-20 sm:py-24">
      <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300">Simple, transparent pricing</p><h2 className="mt-4 text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl">Choose the plan that’s right for you.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{plans.map((plan) => <article key={plan.name} className={`relative flex flex-col rounded-2xl border p-6 ${plan.featured ? 'border-fuchsia-400/40 bg-gradient-to-b from-violet-500/[0.12] to-[#07101f] shadow-[0_0_42px_rgba(168,85,247,.16)]' : 'border-white/[0.09] bg-[#06101e]/80'}`}>{plan.featured && <span className="absolute right-5 top-5 rounded-full bg-blue-600 px-3 py-1 text-[10px] font-semibold text-white">Most Popular</span>}<h3 className="text-lg font-semibold text-white">{plan.name}</h3><p className="mt-3 min-h-14 text-sm leading-6 text-slate-500">{plan.description}</p><p className="mt-5 text-3xl font-semibold tracking-tight text-white">{plan.price}<span className="text-xs font-normal text-slate-500">/month</span></p><ul className="mt-7 flex-1 space-y-3 text-sm text-slate-300">{plan.features.map((item) => <li key={item} className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{item}</li>)}</ul><Link href={plan.href} className={`mt-8 inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition ${plan.featured ? 'bg-gradient-to-r from-blue-600 to-fuchsia-600 text-white' : 'border border-blue-400/30 text-blue-300 hover:bg-blue-500/10'}`}>{plan.cta}</Link></article>)}</div>
        <p className="mt-6 text-center text-xs leading-5 text-slate-500">Public plan prices are listed in USD. PayMongo settlement is processed in PHP, with the exact PHP amount shown in Billing and at checkout. Carrier and provider usage are billed separately.</p>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="pb-20 sm:pb-24">
      <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
        <div className="relative overflow-hidden rounded-2xl border border-fuchsia-300/25 bg-gradient-to-r from-violet-600/30 via-blue-600/20 to-fuchsia-600/30 p-7 sm:p-10"><div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.08),transparent_25%),radial-gradient(circle_at_85%_70%,rgba(59,130,246,.18),transparent_30%)]" /><div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-5"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10"><Image src="/flowtix-logo-512.png" alt="" width={36} height={36} className="h-9 w-9 rounded-lg object-cover" /></span><div><h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Ready to power your conversations?</h2><p className="mt-2 text-sm text-slate-300">Bring your sales workflow together with Flowtix.</p></div></div><Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-fuchsia-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg">Start Your 7-Day Free Trial <ArrowRight className="h-4 w-4" /></Link></div></div>
        <div className="mt-8 grid gap-6 md:grid-cols-3"><div className="flex gap-4"><Zap className="h-6 w-6 text-violet-300" /><div><p className="font-semibold text-white">Fast onboarding</p><p className="mt-1 text-sm text-slate-500">Create your workspace and configure the tools your team needs.</p></div></div><div className="flex gap-4"><LockKeyhole className="h-6 w-6 text-violet-300" /><div><p className="font-semibold text-white">Secure & reliable</p><p className="mt-1 text-sm text-slate-500">Organization isolation, permissions, and security controls are built in.</p></div></div><div className="flex gap-4"><Headphones className="h-6 w-6 text-violet-300" /><div><p className="font-semibold text-white">Support that scales</p><p className="mt-1 text-sm text-slate-500">Support options grow with your Flowtix plan.</p></div></div></div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.07] bg-[#02050c]">
      <div className="mx-auto grid max-w-[1480px] gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.2fr_repeat(3,.7fr)] lg:px-10"><div><Brand /><p className="mt-4 max-w-sm text-sm leading-6 text-slate-500">AI-powered cloud calling and CRM for modern sales teams.</p></div><div><p className="text-sm font-semibold text-white">Product</p><div className="mt-4 grid gap-3 text-sm text-slate-500"><Link href="/features">Features</Link><Link href="/ai-features">AI</Link><Link href="/integrations">Integrations</Link><Link href="/pricing">Pricing</Link></div></div><div><p className="text-sm font-semibold text-white">Company</p><div className="mt-4 grid gap-3 text-sm text-slate-500"><Link href="/about">About</Link><Link href="/blog">Blog</Link><Link href="/contact">Contact</Link><Link href="/status">Status</Link></div></div><div><p className="text-sm font-semibold text-white">Resources</p><div className="mt-4 grid gap-3 text-sm text-slate-500"><Link href="/docs">Documentation</Link><Link href="/help">Help Center</Link><Link href="/security">Security</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></div></div>
      <div className="border-t border-white/[0.06] px-5 py-5 text-center text-xs text-slate-600">© {new Date().getFullYear()} Flowtix. All rights reserved.</div>
    </footer>
  )
}

export default function FlowtixLandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#02050d] text-white">
      <AmbientBackground />
      <div className="relative"><Header /><main><Hero /><FeatureSection /><PlatformSection /><PricingSection /><FinalCTA /></main><Footer /></div>
    </div>
  )
}
