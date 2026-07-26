import Link from 'next/link'
import Logo from './Logo'

const navItems = [
  { label: 'Features', href: '/features' },
  { label: 'Solutions', href: '/solutions' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Resources', href: '/help' },
]

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07111F]/95 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3" aria-label="CallFlow home">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#22D3EE]/20 to-[#2563EB]/10 ring-1 ring-white/10">
            <Logo className="h-8 w-8" />
          </span>
          <span className="text-xl font-semibold tracking-tight text-white">CallFlow</span>
        </Link>
        <nav aria-label="Primary navigation" className="hidden items-center gap-8 text-sm font-medium text-white/80 md:flex">
          {navItems.map((item) => <Link key={item.href} href={item.href} className="transition hover:text-white">{item.label}</Link>)}
        </nav>
        <div className="flex items-center gap-3 sm:gap-5">
          <Link href="/login" className="text-sm font-medium text-white/80 transition hover:text-white">Login</Link>
          <Link href="/signup" className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#2563EB] to-[#22D3EE] px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5">Start Free</Link>
        </div>
      </div>
    </header>
  )
}
