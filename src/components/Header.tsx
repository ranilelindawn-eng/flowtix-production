import Image from 'next/image'
import Link from 'next/link'

const navItems = [
  { label: 'Features', href: '/features' },
  { label: 'AI', href: '/ai-features' },
  { label: 'Platform', href: '/solutions' },
  { label: 'Integrations', href: '/integrations' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Resources', href: '/help' },
]

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#070A18]/75 backdrop-blur-2xl">
      <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between gap-5 px-4 sm:px-6">
        <div className="flex items-center gap-9">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Flowtix home">
            <span className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-[10px] border border-violet-300/20 bg-gradient-to-br from-[#4F8BFF]/25 to-[#C05CFF]/25 shadow-[0_0_22px_rgba(123,92,255,.28)]">
              <Image src="/flowtix-logo-512.png" alt="" width={36} height={36} className="h-full w-full object-cover" />
            </span>
            <span className="text-[17px] font-bold tracking-[-0.02em] text-white">Flowtix</span>
          </Link>
          <nav aria-label="Primary navigation" className="hidden items-center gap-7 text-[13px] font-medium text-white/55 lg:flex">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/login" className="text-sm font-medium text-white/70 transition hover:text-white">Log in</Link>
          <Link href="/signup" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#4F8BFF] via-[#7B5CFF] to-[#9A5CFF] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_26px_rgba(123,92,255,.32)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(123,92,255,.45)]">
            Start Free Trial <span aria-hidden="true">›</span>
          </Link>
        </div>
      </div>
    </header>
  )
}
