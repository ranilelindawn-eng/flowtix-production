import Link from 'next/link'

import OwnerSelect from '@/components/ownership/OwnerSelect'
import { getAssignableMembers } from '@/lib/ownership'
import { getCurrentOrganization } from '@/lib/team'

import { createCompany } from '../../crm-actions'

const input = 'min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white outline-none focus:border-blue-500'

export default async function NewCompanyPage() {
  const membership = await getCurrentOrganization()
  if (!membership) throw new Error('Unable to determine the current organization.')
  const owners = await getAssignableMembers(membership)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/dashboard/companies" className="text-sm text-cyan-400">← Companies</Link>
        <h1 className="mt-3 text-3xl font-semibold text-white">Add company</h1>
      </div>
      <form action={createCompany} className="grid gap-5 rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6 md:grid-cols-2">
        <label className="md:col-span-2 text-sm text-slate-300">Company name<input required name="name" className={`${input} mt-2`}/></label>
        <label className="text-sm text-slate-300">Legal name<input name="legal_name" className={`${input} mt-2`}/></label>
        <OwnerSelect members={owners} className={input} />
        <label className="text-sm text-slate-300">Company type<select name="company_type" className={`${input} mt-2`}><option value="prospect">Prospect</option><option value="customer">Customer</option><option value="partner">Partner</option><option value="vendor">Vendor</option><option value="competitor">Competitor</option><option value="other">Other</option></select></label>
        <label className="text-sm text-slate-300">Status<select name="status" className={`${input} mt-2`}><option value="prospect">Prospect</option><option value="active">Active</option><option value="customer">Customer</option><option value="inactive">Inactive</option></select></label>
        <label className="text-sm text-slate-300">Domain<input name="domain" className={`${input} mt-2`}/></label>
        <label className="text-sm text-slate-300">Industry<input name="industry" className={`${input} mt-2`}/></label>
        <label className="text-sm text-slate-300">Email<input type="email" name="email" className={`${input} mt-2`}/></label>
        <label className="text-sm text-slate-300">Phone<input name="phone" className={`${input} mt-2`}/></label>
        <label className="text-sm text-slate-300">Employees<input type="number" min="0" name="employee_count" className={`${input} mt-2`}/></label>
        <label className="text-sm text-slate-300">Annual revenue<input type="number" min="0" step="0.01" name="annual_revenue" className={`${input} mt-2`}/></label>
        <label className="text-sm text-slate-300">Currency<input name="currency_code" defaultValue="USD" maxLength={3} className={`${input} mt-2`}/></label>
        <label className="text-sm text-slate-300">Founded year<input type="number" min="1000" max="9999" name="founded_year" className={`${input} mt-2`}/></label>
        <label className="text-sm text-slate-300">LinkedIn URL<input name="linkedin_url" className={`${input} mt-2`}/></label>
        <label className="text-sm text-slate-300">Timezone<input name="timezone" placeholder="Asia/Manila" className={`${input} mt-2`}/></label>
        <label className="text-sm text-slate-300">Locale<input name="locale" placeholder="en-PH" className={`${input} mt-2`}/></label>
        <label className="text-sm text-slate-300">Website<input name="website" className={`${input} mt-2`}/></label>
        <label className="md:col-span-2 text-sm text-slate-300">Address<input name="address" className={`${input} mt-2`}/></label>
        <label className="text-sm text-slate-300">City<input name="city" className={`${input} mt-2`}/></label>
        <label className="text-sm text-slate-300">Country<input name="country" className={`${input} mt-2`}/></label>
        <label className="md:col-span-2 text-sm text-slate-300">Description<textarea name="description" rows={5} className={`${input} mt-2 py-3`}/></label>
        <button className="md:col-span-2 min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500">Create company</button>
      </form>
    </div>
  )
}
