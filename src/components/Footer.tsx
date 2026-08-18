import Image from 'next/image'
import Link from 'next/link'

const groups = [
  { title: 'Product', links: [['Features','/features'],['Pricing','/pricing'],['AI Features','/ai-features'],['Integrations','/integrations']] },
  { title: 'Resources', links: [['Help Center','/help'],['Documentation','/docs'],['Blog','/blog'],['System Status','/status']] },
  { title: 'Company', links: [['About','/about'],['Contact','/contact'],['Security','/security'],['Acceptable Use','/acceptable-use']] },
  { title: 'Legal', links: [['Privacy','/privacy'],['Terms','/terms'],['Recording Consent','/recording-consent']] },
]

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#070A18]/80 px-6 py-14 text-white/50 backdrop-blur-xl">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.2fr_2fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-3" aria-label="Flowtix home">
            <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-[10px] border border-violet-300/20 bg-white/[0.04]">
              <Image src="/flowtix-logo-512.png" alt="" width={36} height={36} className="h-full w-full object-cover" />
            </span>
            <span className="text-lg font-bold tracking-tight text-white">Flowtix</span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-7">AI-powered cloud dialer and CRM for modern sales teams. Call, organize, automate, coach, and grow from one workspace.</p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {groups.map((group) => (
            <div key={group.title}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">{group.title}</h2>
              <div className="mt-4 grid gap-3">
                {group.links.map(([label, href]) => (
                  <Link key={href} href={href} className="text-sm transition hover:text-white">{label}</Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-12 flex max-w-7xl flex-col gap-3 border-t border-white/[0.06] pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} Flowtix. All rights reserved.</span>
        <span className="text-white/35">flowtix.work</span>
      </div>
    </footer>
  )
}
