import Link from 'next/link'
import { Building2, Plus } from 'lucide-react'
import CompaniesFilters from './CompaniesFilters'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; type?: string }>
}) {
  const membership = await requirePermission('companies.view')
  const supabase = await createClient()
  const { search = '', type = '' } = await searchParams

  let query = supabase
    .from('companies')
    .select(
      'id,name,industry,domain,phone,email,status,company_type,employee_count,annual_revenue,currency_code,created_at',
    )
    .eq('organization_id', membership.organization_id)
    .order('created_at', { ascending: false })

  if (type.trim()) query = query.eq('company_type', type.trim())

  if (search.trim()) {
    query = query.or(
      `name.ilike.%${search.trim()}%,domain.ilike.%${search.trim()}%,industry.ilike.%${search.trim()}%`,
    )
  }

  const { data: companies, error } = await query

  if (error) throw new Error(error.message)

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[.24em] text-cyan-400">
            CRM workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Companies</h1>
          <p className="mt-2 text-sm text-slate-400">
            Manage accounts, contacts, comments, and attached files.
          </p>
        </div>

        <Link
          href="/dashboard/companies/new"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500"
        >
          <Plus className="size-4" />
          Add company
        </Link>
      </header>

      <CompaniesFilters search={search} type={type} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {companies?.map((company) => (
          <Link
            key={company.id}
            href={`/dashboard/companies/${company.id}`}
            className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 transition hover:-translate-y-0.5 hover:border-cyan-400/30"
          >
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-blue-500/10 p-3 text-blue-300">
                <Building2 className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate font-semibold text-white">{company.name}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {company.industry || 'Industry not set'}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-1 text-sm text-slate-400">
              <p>{company.domain || 'No domain'}</p>
              <p>{company.email || company.phone || 'No contact details'}</p>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              {company.employee_count != null
                ? `${company.employee_count} employees`
                : 'Employee count not set'}
              {company.annual_revenue != null
                ? ` · ${company.currency_code} ${Number(company.annual_revenue).toLocaleString()}`
                : ''}
            </p>

            <span className="mt-4 inline-flex rounded-full border border-white/10 px-2.5 py-1 text-xs capitalize text-slate-300">
              {company.company_type || company.status}
            </span>
          </Link>
        ))}
      </div>

      {!companies?.length && (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-slate-400">
          No companies found.
        </div>
      )}
    </div>
  )
}
