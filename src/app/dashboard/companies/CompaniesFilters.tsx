'use client'

import { useRef } from 'react'
import { Search } from 'lucide-react'

type CompaniesFiltersProps = {
  search: string
  type: string
}

export default function CompaniesFilters({ search, type }: CompaniesFiltersProps) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      action="/dashboard/companies"
      method="get"
      className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-4"
    >
      <label className="relative block">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
        <input
          name="search"
          defaultValue={search}
          placeholder="Search companies"
          className="min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] pl-10 pr-4 text-sm text-white outline-none focus:border-blue-500"
        />
      </label>

      <select
        name="type"
        defaultValue={type}
        onChange={() => formRef.current?.requestSubmit()}
        className="mt-3 min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white md:w-56"
      >
        <option value="">All company types</option>
        <option value="prospect">Prospects</option>
        <option value="customer">Customers</option>
        <option value="partner">Partners</option>
        <option value="vendor">Vendors</option>
        <option value="competitor">Competitors</option>
        <option value="other">Other</option>
      </select>
    </form>
  )
}
