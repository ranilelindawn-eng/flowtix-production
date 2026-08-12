'use client'

import Link from 'next/link'
import { BookOpenText } from 'lucide-react'
import { usePathname } from 'next/navigation'

import { getGuidePath } from '@/lib/guide/path-map'

export default function GuideHelpButton() {
  const pathname = usePathname() ?? '/dashboard'

  if (pathname.startsWith('/dashboard/guide')) return null

  const guide = getGuidePath(pathname)
  const href = guide ? `/dashboard/guide/${guide.slug}` : '/dashboard/guide'
  const label = guide ? `Guide: ${guide.title}` : 'Flowtix Guide'

  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-cyan-300/20 bg-[#0B1726]/95 px-4 py-3 text-sm font-semibold text-cyan-100 shadow-2xl shadow-black/30 backdrop-blur transition hover:border-cyan-300/40 hover:bg-[#10233A]"
    >
      <BookOpenText className="h-4 w-4" />
      <span className="hidden sm:inline">Guide</span>
    </Link>
  )
}
