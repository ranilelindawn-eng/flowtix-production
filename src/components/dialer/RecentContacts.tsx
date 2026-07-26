'use client'

export type RecentContact = {
  id: string
  name: string
  phoneNumber: string
  company?: string
}

type RecentContactsProps = {
  contacts: RecentContact[]
  disabled?: boolean
  onSelect: (contact: RecentContact) => void
}

export default function RecentContacts({
  contacts,
  disabled = false,
  onSelect,
}: RecentContactsProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Recent Contacts
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Quickly redial previous contacts.
          </p>
        </div>

        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400">
          {contacts.length}
        </span>
      </div>

      {contacts.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-white/10 bg-white/[0.02] py-8 text-center">
          <p className="text-sm font-medium text-slate-300">
            No recent contacts
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Your recent calls will appear here.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {contacts.map((contact) => (
            <button
              key={contact.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(contact)}
              className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-blue-500/30 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-white">
                  {contact.name}
                </p>

                {contact.company ? (
                  <p className="truncate text-xs text-slate-500">
                    {contact.company}
                  </p>
                ) : null}
              </div>

              <span className="ml-4 shrink-0 text-sm text-slate-300">
                {contact.phoneNumber}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}