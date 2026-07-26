'use client'

import { Search } from 'lucide-react'

export default function ContactSearch({ value }: { value: string }) {
  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        name="search"
        defaultValue={value}
        type="search"
        placeholder="Search contacts"
        className="w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 py-3 pl-11 pr-4 text-sm text-white outline-none transition focus:border-[#22D3EE]/40"
      />
    </div>
  )
}
