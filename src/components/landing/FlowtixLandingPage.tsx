'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
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
    copy: 'Carrier-ready calling workflows with contact context, recordings, and smart call controls.',
    href: '/ai-cloud-dialer',
    accent: 'from-emerald-500/10 to-transparent text-emerald-300',
  },
  {
    icon: BrainCircuit,
    title: 'AI Assistant',
    copy: 'Summaries, coaching insights, follow-up drafts, and useful next actions from customer conversations.',
    href: '/ai-features',
    accent: 'from-violet-500/15 to-transparent text-violet-300',
  },
  {
    icon: Layers3,
    title: 'Pipelines & CRM',
    copy: 'Contacts, companies, opportunities, tasks, activities, and sales progress in one connected workspace.',
    href: '/sales-crm',
    accent: 'from-zinc-500/10 to-transparent text-slate-300',
  },
  {
    icon: Workflow,
    title: 'Automation',
    copy: 'Sequences, campaigns, post-call follow-up, and background workflows with controlled automation.',
    href: '/sales-automation',
    accent: 'from-yellow-500/10 to-transparent text-amber-300',
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    copy: 'Call, agent, campaign, sales, and operational performance from a unified reporting workspace.',
    href: '/features',
    accent: 'from-teal-500/10 to-transparent text-teal-300',
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
    <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Flowtix home">
      <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-[10px] border border-violet-300/20 bg-gradient-to-br from-[#4F8BFF]/25 to-[#C05CFF]/25 shadow-[0_0_22px_rgba(123,92,255,.28)]">
        <Image src="/flowtix-logo-512.png" alt="" width={36} height={36} className="h-full w-full object-cover" />
      </span>
      <span className="text-[17px] font-bold tracking-[-0.02em] text-white">Flowtix</span>
    </Link>
  )
}

function Header() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#070A18]/75 backdrop-blur-2xl">
      <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between px-6 md:px-8">
        <div className="flex items-center gap-10">
          <Brand />
          <nav className="hidden items-center gap-7 text-[13px] font-medium text-white/55 lg:flex" aria-label="Primary navigation">
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#ai" className="transition hover:text-white">AI</a>
            <a href="#platform" className="transition hover:text-white">Platform</a>
            <Link href="/integrations" className="transition hover:text-white">Integrations</Link>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
            <Link href="/help" className="transition hover:text-white">Resources</Link>
          </nav>
        </div>
        <div className="hidden items-center gap-4 sm:flex">
          <Link href="/login" className="px-3 py-2 text-sm font-medium text-white/70 transition hover:text-white">Log in</Link>
          <Link href="/signup" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#4F8BFF] via-[#7B5CFF] to-[#9A5CFF] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_26px_rgba(123,92,255,.32)] transition hover:-translate-y-0.5">
            Start Free Trial <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <button type="button" className="rounded-xl border border-white/10 p-2 text-white/75 sm:hidden" aria-label={open ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open ? (
        <nav className="grid gap-2 border-t border-white/[0.06] bg-[#070A18]/95 px-6 py-5 text-sm text-white/75 sm:hidden" aria-label="Mobile navigation">
          <a href="#features" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 hover:bg-white/5">Features</a>
          <a href="#ai" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 hover:bg-white/5">AI</a>
          <a href="#platform" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 hover:bg-white/5">Platform</a>
          <Link href="/integrations" className="rounded-xl px-3 py-3 hover:bg-white/5">Integrations</Link>
          <a href="#pricing" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 hover:bg-white/5">Pricing</a>
          <Link href="/login" className="rounded-xl px-3 py-3 hover:bg-white/5">Log in</Link>
          <Link href="/signup" className="mt-2 rounded-full bg-gradient-to-r from-[#4F8BFF] to-[#9A5CFF] px-4 py-3 text-center font-semibold text-white">Start Free Trial</Link>
        </nav>
      ) : null}
    </header>
  )
}

function WorkspacePreview() {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 22, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.75, ease: 'easeOut' }}
      className="relative mx-auto w-full max-w-[560px] lg:max-w-none"
    >
      <div className="absolute -inset-10 rounded-full bg-violet-500/10 blur-[80px]" />
      <div className="relative rounded-[28px] border border-[#7B5CFF]/30 bg-[#121631]/90 p-4 shadow-[0_20px_80px_rgba(0,0,0,.6),inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-xl sm:p-5">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
          <div className="flex gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" /><span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" /><span className="h-2.5 w-2.5 rounded-full bg-[#28CA42]" /></div>
          <span className="inline-flex items-center gap-2 text-[11px] text-white/45"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,.8)]" />Calling workspace · Live</span>
        </div>
        <div className="grid gap-3 pt-4 sm:grid-cols-[46px_1fr]">
          <div className="hidden flex-col items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#0B0F22]/80 p-2 sm:flex">
            <Image src="/flowtix-logo-512.png" alt="" width={30} height={30} className="rounded-lg" />
            {[0, 1, 2, 3].map((item) => <span key={item} className="h-7 w-7 rounded-lg border border-white/[0.07] bg-white/[0.05]" />)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Cloud calling', 'Carrier-ready dialer with smart routing', 'bg-emerald-500/20 text-emerald-300'],
              ['CRM context', 'Contact, deal, and history in one view', 'bg-violet-500/20 text-violet-300'],
              ['AI assistance', 'Summaries, coaching, next-best action', 'bg-[#7B5CFF]/20 text-violet-200'],
              ['Automation', 'Sequences, triggers, and workflows', 'bg-amber-500/20 text-amber-300'],
            ].map(([title, copy, tone]) => (
              <div key={title} className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 transition hover:bg-white/[0.055]">
                <div className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-lg ${tone}`}><span className="h-2.5 w-2.5 rounded-[2px] bg-current" /></span><p className="text-sm font-semibold text-white">{title}</p></div>
                <p className="mt-3 text-xs leading-5 text-white/45">{copy}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/[0.06] bg-[#0B0F22]/75 px-4 py-3">
          <div className="flex items-center gap-3"><span className="h-9 w-9 rounded-full bg-gradient-to-br from-[#4F8BFF] to-[#8B5CF6]" /><div><p className="text-xs font-semibold text-white/80">Calling workspace</p><p className="text-[10px] text-white/35">Call controls · HD voice</p></div></div>
          <div className="flex items-center gap-2"><span className="h-2 w-20 rounded-full bg-white/15" /><span className="h-2 w-12 rounded-full bg-white/10" /></div>
        </div>
      </div>
      <motion.div animate={reduceMotion ? undefined : { y: [0, -7, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }} className="absolute -right-2 -top-6 hidden w-48 rounded-2xl border border-[#7B5CFF]/30 bg-[#151938]/95 p-4 shadow-[0_16px_40px_rgba(0,0,0,.5)] backdrop-blur-xl md:block">
        <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#4F8BFF] text-white"><Sparkles className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-white">AI Assistant</p><p className="mt-1 text-[10px] leading-4 text-white/45">Summarizing · 94% intent</p></div></div>
      </motion.div>
    </motion.div>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-16 md:px-8 md:pb-24 md:pt-[84px]">
      <div className="mx-auto grid max-w-[1280px] items-center gap-16 lg:grid-cols-[1.05fr_.95fr]">
        <div className="relative z-10 max-w-[620px]">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#7B5CFF]/30 bg-[#7B5CFF]/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70"><span className="h-2 w-2 rounded-full bg-[#7B5CFF]" />AI-powered cloud dialer & CRM</div>
          <h1 className="mt-7 text-balance text-[44px] font-extrabold leading-[0.95] tracking-[-0.04em] text-white md:text-[64px] lg:text-[72px]">Power every <span className="bg-gradient-to-r from-[#7B5CFF] via-[#9A5CFF] to-[#FF5CAA] bg-clip-text text-transparent">conversation.</span></h1>
          <p className="mt-7 max-w-[520px] text-[16px] leading-7 text-[#8B90A7]">Call, organize, automate, coach, and grow from one intelligent sales workspace built for modern teams.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="group inline-flex h-[46px] items-center gap-2 rounded-full bg-gradient-to-r from-[#4F8BFF] to-[#9A5CFF] px-6 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(124,92,255,.35)] transition hover:-translate-y-0.5">Start Your Free Trial <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
            <Link href="/contact" className="inline-flex h-[46px] items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-6 text-sm font-semibold text-white transition hover:bg-white/[0.08]"><span className="grid h-6 w-6 place-items-center rounded-full bg-white text-[#0A0D1F]"><Play className="h-3 w-3 fill-current" /></span>Book a Demo</Link>
          </div>
          <div className="mt-7 flex flex-wrap gap-x-7 gap-y-3 text-[12px] text-white/35"><span className="flex items-center gap-2"><Check className="h-4 w-4 text-white/35" />No credit card</span><span className="flex items-center gap-2"><Check className="h-4 w-4 text-white/35" />Secure billing</span><span className="flex items-center gap-2"><Check className="h-4 w-4 text-white/35" />Cancel during trial</span></div>
        </div>
        <WorkspacePreview />
      </div>
    </section>
  )
}

function FeatureSection() {
  return (
    <section id="features" className="relative border-y border-white/[0.06] px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-[1280px]">
        <div className="mx-auto max-w-[720px] text-center">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold tracking-widest text-white/60">BUILT FOR MODERN SALES TEAMS</div>
          <h2 className="mt-4 text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-white md:text-[42px]">Everything you need to sell smarter.</h2>
          <p className="mt-3 text-[14.5px] leading-6 text-[#8B90A7]">From first dial to closed-won, Flowtix unifies calling, CRM, automation, and AI-assisted workflows in one fast workspace.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-12 md:gap-5">
          {features.map((feature, index) => {
            const spans = ['md:col-span-7', 'md:col-span-5', 'md:col-span-5', 'md:col-span-4', 'md:col-span-3']
            return (
              <Link key={feature.title} href={feature.href} className={`${spans[index]} flowtix-glass-card group relative overflow-hidden rounded-[24px] bg-gradient-to-br ${feature.accent} p-6 transition duration-500 hover:-translate-y-1.5 md:p-7`}>
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.06]"><feature.icon className="h-5 w-5" /></span>
                <h3 className="mt-6 text-[18px] font-semibold text-white">{feature.title}</h3>
                <p className="mt-3 text-[13px] leading-6 text-white/45">{feature.copy}</p>
                <span className="mt-6 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/50 transition group-hover:translate-x-1 group-hover:text-white">→</span>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function PlatformSection() {
  return (
    <section id="platform" className="px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-[1280px]">
        <div className="grid gap-4 md:grid-cols-4 md:gap-5">
          {proofPoints.map(([title, copy], index) => (
            <div key={title} className="flowtix-glass-card flex items-center gap-4 rounded-[24px] p-5">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${index === 0 ? 'bg-blue-500/10 text-blue-300' : index === 1 ? 'bg-emerald-500/10 text-emerald-300' : index === 2 ? 'bg-violet-500/10 text-violet-300' : 'bg-amber-500/10 text-amber-300'}`}>{index === 0 ? <Users className="h-5 w-5" /> : index === 1 ? <PhoneCall className="h-5 w-5" /> : index === 2 ? <Sparkles className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}</span>
              <div><p className="font-semibold text-white">{title}</p><p className="mt-1 text-xs leading-5 text-white/40">{copy}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PricingSection() {
  return (
    <section id="pricing" className="border-t border-white/[0.06] px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-[1280px]">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300">Simple, transparent pricing</p>
        <h2 className="mt-4 text-3xl font-bold tracking-[-.04em] text-white sm:text-4xl">Choose the plan that’s right for you.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <article key={plan.name} className={`relative flex flex-col rounded-[24px] border p-6 transition duration-300 hover:-translate-y-1 ${plan.featured ? 'border-[#7B5CFF]/50 bg-[#151938]/90 shadow-[0_0_0_1px_rgba(123,92,255,.3),0_20px_60px_rgba(123,92,255,.18)]' : 'border-white/[0.07] bg-white/[0.03]'}`}>
              {plan.featured ? <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-[#4F8BFF] to-[#C05CFF] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">Most Popular</span> : null}
              <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
              <p className="mt-3 min-h-14 text-sm leading-6 text-white/40">{plan.description}</p>
              <p className="mt-5 text-3xl font-bold tracking-tight text-white">{plan.price}<span className="text-xs font-normal text-white/40">/month</span></p>
              <ul className="mt-7 flex-1 space-y-3 text-sm text-white/65">{plan.features.map((item) => <li key={item} className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{item}</li>)}</ul>
              <Link href={plan.href} className={`mt-8 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${plan.featured ? 'bg-gradient-to-r from-[#4F8BFF] to-[#9A5CFF] text-white shadow-[0_8px_20px_rgba(124,92,255,.35)]' : 'border border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.08]'}`}>{plan.cta}</Link>
            </article>
          ))}
        </div>
        <p className="mt-6 text-center text-xs leading-5 text-white/35">Public plan prices are listed in USD. PayMongo settlement is processed in PHP, with the exact PHP amount shown in Billing and at checkout. Carrier and provider usage are billed separately.</p>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section id="ai" className="px-6 pb-20 md:px-8 md:pb-24">
      <div className="mx-auto max-w-[1280px]">
        <div className="relative overflow-hidden rounded-[32px] border border-[#7B5CFF]/30 bg-gradient-to-r from-[#4F8BFF] via-[#8B5CF6] to-[#C05CFF] p-7 shadow-[0_20px_80px_rgba(0,0,0,.45)] md:p-10">
          <div className="absolute inset-0 bg-[#0A0D1F]/55" />
          <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-[560px]"><div className="flex items-center gap-3"><Image src="/flowtix-logo-512.png" alt="" width={36} height={36} className="rounded-xl" /><span className="font-bold text-white">Flowtix</span></div><h2 className="mt-5 text-[28px] font-bold leading-[1.05] tracking-[-0.03em] text-white md:text-[36px]">Ready to power your conversations?</h2><p className="mt-3 text-sm leading-6 text-white/70">Launch your workspace, automate the busywork, and keep customer context in one place.</p></div>
            <Link href="/signup" className="group inline-flex h-[46px] shrink-0 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#1A1A2E] shadow-[0_12px_28px_rgba(0,0,0,.25)] transition hover:-translate-y-0.5">Start Your 7-Day Free Trial <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
          </div>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-3"><div className="flex gap-4"><Zap className="h-6 w-6 text-violet-300" /><div><p className="font-semibold text-white">Fast onboarding</p><p className="mt-1 text-sm text-white/40">Create your workspace and configure the tools your team needs.</p></div></div><div className="flex gap-4"><LockKeyhole className="h-6 w-6 text-violet-300" /><div><p className="font-semibold text-white">Secure & reliable</p><p className="mt-1 text-sm text-white/40">Organization isolation, permissions, and security controls are built in.</p></div></div><div className="flex gap-4"><Headphones className="h-6 w-6 text-violet-300" /><div><p className="font-semibold text-white">Support that scales</p><p className="mt-1 text-sm text-white/40">Support options grow with your Flowtix plan.</p></div></div></div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#070A18]/80 backdrop-blur-xl">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-6 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-8 md:py-14">
        <div><Brand /><p className="mt-4 max-w-[300px] text-[13px] leading-6 text-white/45">AI-powered cloud dialer & CRM for modern sales teams. Call, organize, automate, coach, and grow.</p></div>
        {[
          ['Product', [['Features','/features'],['AI Assistant','/ai-features'],['Integrations','/integrations'],['Pricing','/pricing']]],
          ['Company', [['About','/about'],['Blog','/blog'],['Contact','/contact'],['Security','/security']]],
          ['Resources', [['Documentation','/docs'],['Help Center','/help'],['Privacy','/privacy'],['Terms','/terms']]],
        ].map(([title, links]) => (
          <div key={String(title)}><div className="text-xs font-semibold tracking-widest text-white/35">{String(title).toUpperCase()}</div><div className="mt-4 space-y-2.5">{(links as string[][]).map(([label, href]) => <Link key={href} href={href} className="block text-[13.5px] text-white/50 transition hover:text-white">{label}</Link>)}</div></div>
        ))}
      </div>
      <div className="border-t border-white/[0.06]"><div className="mx-auto flex min-h-[64px] max-w-[1280px] flex-col items-center justify-between gap-2 px-6 py-4 text-[11.5px] text-white/30 md:flex-row md:px-8"><span>© {new Date().getFullYear()} Flowtix. All rights reserved.</span><span>flowtix.work</span></div></div>
    </footer>
  )
}

export default function FlowtixLandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-transparent text-white">
      <div className="relative"><Header /><main><Hero /><FeatureSection /><PlatformSection /><PricingSection /><FinalCTA /></main><Footer /></div>
    </div>
  )
}
