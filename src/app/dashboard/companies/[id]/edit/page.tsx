import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireOrganization } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

import { updateCompany } from '../../../crm-actions'

const input =
  'min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white outline-none focus:border-blue-500'

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const membership = await requireOrganization()
  const supabase = await createClient()

  const { data: company, error } = await supabase
    .from('companies')
    .select(
      'id,name,domain,industry,email,phone,website,status,address,city,country,description',
    )
    .eq('organization_id', membership.organization_id)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load company: ${error.message}`)
  }

  if (!company) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/dashboard/companies/${id}`}
          className="text-sm font-medium text-cyan-400 hover:text-cyan-300"
        >
          ← Company details
        </Link>

        <p className="mt-4 text-sm uppercase tracking-[.24em] text-cyan-400">
          CRM workspace
        </p>

        <h1 className="mt-2 text-3xl font-semibold text-white">
          Edit company
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          Update the account information for {company.name}.
        </p>
      </div>

      <form
        action={updateCompany}
        className="grid gap-5 rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6 md:grid-cols-2"
      >
        <input type="hidden" name="id" value={company.id} />

        <label className="text-sm text-slate-300 md:col-span-2">
          Company name
          <input
            required
            name="name"
            defaultValue={company.name}
            className={`${input} mt-2`}
          />
        </label>

        <label className="text-sm text-slate-300">
          Domain
          <input
            name="domain"
            defaultValue={company.domain ?? ''}
            className={`${input} mt-2`}
          />
        </label>

        <label className="text-sm text-slate-300">
          Industry
          <input
            name="industry"
            defaultValue={company.industry ?? ''}
            className={`${input} mt-2`}
          />
        </label>

        <label className="text-sm text-slate-300">
          Email
          <input
            type="email"
            name="email"
            defaultValue={company.email ?? ''}
            className={`${input} mt-2`}
          />
        </label>

        <label className="text-sm text-slate-300">
          Phone
          <input
            name="phone"
            defaultValue={company.phone ?? ''}
            className={`${input} mt-2`}
          />
        </label>

        <label className="text-sm text-slate-300">
          Website
          <input
            name="website"
            defaultValue={company.website ?? ''}
            className={`${input} mt-2`}
          />
        </label>

        <label className="text-sm text-slate-300">
          Status
          <select
            name="status"
            defaultValue={company.status ?? 'active'}
            className={`${input} mt-2`}
          >
            <option value="prospect">Prospect</option>
            <option value="active">Active</option>
            <option value="customer">Customer</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>

        <label className="text-sm text-slate-300 md:col-span-2">
          Address
          <input
            name="address"
            defaultValue={company.address ?? ''}
            className={`${input} mt-2`}
          />
        </label>

        <label className="text-sm text-slate-300">
          City
          <input
            name="city"
            defaultValue={company.city ?? ''}
            className={`${input} mt-2`}
          />
        </label>

        <label className="text-sm text-slate-300">
          Country
          <input
            name="country"
            defaultValue={company.country ?? ''}
            className={`${input} mt-2`}
          />
        </label>

        <label className="text-sm text-slate-300 md:col-span-2">
          Description
          <textarea
            name="description"
            rows={5}
            defaultValue={company.description ?? ''}
            className={`${input} mt-2 py-3`}
          />
        </label>

        <div className="flex flex-col-reverse gap-3 md:col-span-2 sm:flex-row sm:justify-end">
          <Link
            href={`/dashboard/companies/${id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
          >
            Cancel
          </Link>

          <button className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500">
            Save changes
          </button>
        </div>
      </form>
    </div>
  )
}