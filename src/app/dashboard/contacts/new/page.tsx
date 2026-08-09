import Link from 'next/link'
import ContactForm from '@/components/contacts/ContactForm'
import { createContact } from '@/app/dashboard/contacts/actions'
import { requirePermission } from '@/lib/auth'
import { getContactCompanyOptions } from '@/lib/contacts'
import { getAssignableMembers, canAssignOtherMembers } from '@/lib/ownership'

export default async function NewContactPage() {
  const membership = await requirePermission('contacts.create')
  const [owners, companies] = await Promise.all([
    getAssignableMembers(membership),
    getContactCompanyOptions(),
  ])
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.28em] text-[#22D3EE]">New contact</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Add a new contact</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Create a contact for your team and keep customer details synced across your organization.
          </p>
        </div>
        <Link
          href="/dashboard/contacts"
          className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Back to contacts
        </Link>
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#0B1726]/90 p-6 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
        <ContactForm
          action={createContact}
          submitLabel="Create contact"
          ownerOptions={owners.map((owner) => ({
            id: owner.membershipId,
            full_name: owner.name,
          }))}
          companyOptions={companies}
          canAssignOthers={canAssignOtherMembers(membership.role)}
        />
      </div>
    </div>
  )
}
