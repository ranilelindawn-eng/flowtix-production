import Link from 'next/link'

const groups = [
  { title: 'Product', links: [['Features','/features'],['Pricing','/pricing'],['AI Features','/ai-features'],['Integrations','/integrations']] },
  { title: 'Resources', links: [['Help Center','/help'],['Documentation','/docs'],['Blog','/blog'],['System Status','/status']] },
  { title: 'Company', links: [['About','/about'],['Contact','/contact'],['Security','/security'],['Acceptable Use','/acceptable-use']] },
  { title: 'Legal', links: [['Privacy','/privacy'],['Terms','/terms'],['Recording Consent','/recording-consent']] },
]

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#07111F] px-6 py-14 text-slate-400">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.2fr_2fr]">
        <div><div className="text-xl font-semibold text-white">CallFlow</div><p className="mt-4 max-w-sm text-sm leading-7">A multi-tenant cloud dialer and CRM workspace for teams managing customer conversations.</p></div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {groups.map((group) => <div key={group.title}><h2 className="text-sm font-semibold text-white">{group.title}</h2><div className="mt-4 grid gap-3">{group.links.map(([label,href]) => <Link key={href} href={href} className="text-sm transition hover:text-white">{label}</Link>)}</div></div>)}
        </div>
      </div>
      <div className="mx-auto mt-12 max-w-7xl border-t border-white/10 pt-6 text-sm">© {new Date().getFullYear()} CallFlow. All rights reserved.</div>
    </footer>
  )
}
