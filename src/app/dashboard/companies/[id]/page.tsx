import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

import { createComment, deleteCompany, uploadAttachment } from '../../crm-actions'
import DeleteCompanyButton from './delete-company-button'

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const membership = await requirePermission('companies.view')
  const supabase = await createClient()

  const [
    { data: company },
    { data: contacts },
    { data: comments },
    { data: attachments },
  ] = await Promise.all([
    supabase
      .from('companies')
      .select('*')
      .eq('organization_id', membership.organization_id)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('contacts')
      .select('id,first_name,last_name,email,phone,job_title')
      .eq('organization_id', membership.organization_id)
      .eq('company_id', id),
    supabase
      .from('internal_comments')
      .select('id,body,created_at,created_by')
      .eq('organization_id', membership.organization_id)
      .eq('entity_type', 'company')
      .eq('entity_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('attachments')
      .select('id,file_name,mime_type,size_bytes,created_at')
      .eq('organization_id', membership.organization_id)
      .eq('entity_type', 'company')
      .eq('entity_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (!company) notFound()

  const field =
    'min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white outline-none focus:border-blue-500'

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/companies"
            className="text-sm font-medium text-cyan-400 hover:text-cyan-300"
          >
            ← Companies
          </Link>

          <p className="mt-4 text-sm uppercase tracking-[.24em] text-cyan-400">
            Company details
          </p>

          <h1 className="mt-2 text-3xl font-semibold text-white">
            {company.name}
          </h1>

          <p className="mt-2 text-slate-400">
            {company.description || 'No company description yet.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/dashboard/companies/${id}/edit`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:border-cyan-400/30 hover:bg-white/10"
          >
            Edit company
          </Link>

          <form action={deleteCompany}>
            <input type="hidden" name="id" value={id} />
            <DeleteCompanyButton companyName={company.name} />
          </form>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 xl:col-span-2">
          <h2 className="font-semibold text-white">Company contacts</h2>

          <div className="mt-4 space-y-3">
            {contacts?.map((contact) => (
              <Link
                key={contact.id}
                href={`/dashboard/contacts/${contact.id}`}
                className="block rounded-xl border border-white/10 p-4 transition hover:border-cyan-400/30"
              >
                <p className="font-medium text-white">
                  {`${contact.first_name} ${contact.last_name}`.trim() ||
                    contact.email}
                </p>

                <p className="mt-1 text-sm text-slate-400">
                  {contact.job_title || 'Contact'} ·{' '}
                  {contact.email || contact.phone || 'No contact details'}
                </p>
              </Link>
            ))}

            {!contacts?.length && (
              <p className="text-sm text-slate-500">
                No linked contacts yet. Set company_id when editing or importing
                contacts.
              </p>
            )}
          </div>
        </section>

        <aside className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5">
          <h2 className="font-semibold text-white">Account information</h2>

          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd className="capitalize text-slate-200">
                {company.status || '—'}
              </dd>
            </div>

            <div><dt className="text-slate-500">Company type</dt><dd className="capitalize text-slate-200">{company.company_type || '—'}</dd></div>
            <div><dt className="text-slate-500">Legal name</dt><dd className="text-slate-200">{company.legal_name || '—'}</dd></div>
            <div><dt className="text-slate-500">Employees</dt><dd className="text-slate-200">{company.employee_count ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Annual revenue</dt><dd className="text-slate-200">{company.annual_revenue != null ? `${company.currency_code || 'USD'} ${Number(company.annual_revenue).toLocaleString()}` : '—'}</dd></div>
            <div><dt className="text-slate-500">Founded</dt><dd className="text-slate-200">{company.founded_year || '—'}</dd></div>
            <div><dt className="text-slate-500">Timezone / locale</dt><dd className="text-slate-200">{[company.timezone, company.locale].filter(Boolean).join(' · ') || '—'}</dd></div>

            <div>
              <dt className="text-slate-500">Industry</dt>
              <dd className="text-slate-200">{company.industry || '—'}</dd>
            </div>

            <div>
              <dt className="text-slate-500">Domain</dt>
              <dd className="text-slate-200">{company.domain || '—'}</dd>
            </div>

            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="break-all text-slate-200">
                {company.email || '—'}
              </dd>
            </div>

            <div>
              <dt className="text-slate-500">Phone</dt>
              <dd className="text-slate-200">{company.phone || '—'}</dd>
            </div>

            <div>
              <dt className="text-slate-500">Website</dt>
              <dd className="break-all text-slate-200">
                {company.website || '—'}
              </dd>
            </div>

            <div>
              <dt className="text-slate-500">Location</dt>
              <dd className="text-slate-200">
                {[company.address, company.city, company.country]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </dd>
            </div>
          </dl>
        </aside>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5">
          <h2 className="font-semibold text-white">
            Internal comments & mentions
          </h2>

          <form action={createComment} className="mt-4 space-y-3">
            <input type="hidden" name="entity_type" value="company" />
            <input type="hidden" name="entity_id" value={id} />

            <textarea
              required
              name="body"
              rows={3}
              placeholder="Write a comment. Mention a team member with @[user-uuid]."
              className={`${field} py-3`}
            />

            <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
              Post comment
            </button>
          </form>

          <div className="mt-5 space-y-3">
            {comments?.map((comment) => (
              <article
                key={comment.id}
                className="rounded-xl border border-white/10 p-3"
              >
                <p className="whitespace-pre-wrap text-sm text-slate-200">
                  {comment.body}
                </p>

                <time className="mt-2 block text-xs text-slate-500">
                  {new Date(comment.created_at).toLocaleString()}
                </time>
              </article>
            ))}

            {!comments?.length && (
              <p className="text-sm text-slate-500">No comments yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5">
          <h2 className="font-semibold text-white">Files & attachments</h2>

          <form action={uploadAttachment} className="mt-4 space-y-3">
            <input type="hidden" name="entity_type" value="company" />
            <input type="hidden" name="entity_id" value={id} />

            <input
              required
              type="file"
              name="file"
              className={`${field} py-2`}
            />

            <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
              Upload file
            </button>
          </form>

          <div className="mt-5 space-y-3">
            {attachments?.map((file) => (
              <div
                key={file.id}
                className="rounded-xl border border-white/10 p-3"
              >
                <p className="truncate text-sm text-white">{file.file_name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {Math.ceil(Number(file.size_bytes) / 1024)} KB
                </p>
              </div>
            ))}

            {!attachments?.length && (
              <p className="text-sm text-slate-500">No files uploaded yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}