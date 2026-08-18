import Link from 'next/link'
import { signOut } from '@/app/auth/actions'

export default function PlatformTopNav({ email }: { email: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] bg-[#070A18]/60 px-6 py-4 backdrop-blur-xl lg:px-8">
      <div>
        <p className="text-sm font-medium text-white">Platform Administration</p>
        <p className="text-xs text-slate-500">Isolated from customer workspaces</p>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <Link href="/dashboard" className="rounded-full border border-white/[0.08] px-3 py-2 text-slate-300 hover:bg-white/5">Customer workspace</Link>
        <span className="hidden text-slate-500 sm:inline">{email}</span>
        <form action={signOut}>
          <button type="submit" className="rounded-full bg-white/[0.05] px-3 py-2 text-slate-200 hover:bg-white/10">Sign out</button>
        </form>
      </div>
    </header>
  )
}
