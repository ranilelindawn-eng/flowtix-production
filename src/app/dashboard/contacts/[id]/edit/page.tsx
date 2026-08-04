import Link from 'next/link';
import { notFound } from 'next/navigation';

import ContactForm from '@/components/contacts/ContactForm';
import { updateContact } from '@/app/dashboard/contacts/actions';
import { getContact } from '@/lib/contacts';
import { requirePermission } from '@/lib/auth';
import { getAssignableMembers, canAssignOtherMembers } from '@/lib/ownership';

type EditContactPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditContactPage({
  params,
}: EditContactPageProps) {
  const { id } = await params;
  const membership = await requirePermission('contacts.update');
  const [contact, owners] = await Promise.all([
    getContact(id),
    getAssignableMembers(membership),
  ]);

  if (!contact) {
    notFound();
  }

  const fullName =
    `${contact.first_name} ${contact.last_name}`.trim() || 'Unnamed contact';

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-cyan-400">
            Edit contact
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Update {fullName}
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Make changes to this contact and keep your workspace records
            current.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/contacts"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] hover:text-white"
          >
            Back to contacts
          </Link>

          <Link
            href={`/dashboard/contacts/${id}`}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            View contact
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-black/10">
        <div className="mb-6 border-b border-white/10 pb-5">
          <h2 className="text-xl font-semibold text-white">
            Contact information
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Update the personal and professional details below.
          </p>
        </div>

        <ContactForm
          initialValues={contact}
          hiddenId={id}
          action={updateContact}
          submitLabel="Save changes"
          ownerOptions={owners.map((owner) => ({
            id: owner.membershipId,
            full_name: owner.name,
          }))}
          canAssignOthers={canAssignOtherMembers(membership.role)}
        />
      </section>
    </div>
  );
}