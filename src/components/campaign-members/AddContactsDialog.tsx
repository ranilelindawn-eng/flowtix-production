'use client'

import {
  FormEvent,
  useActionState,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react'
import {
  Check,
  Loader2,
  Plus,
  Search,
  UserPlus,
  X,
} from 'lucide-react'

export type AddContactsDialogContact = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  company: string | null
  title: string | null
  status: 'active' | 'inactive' | 'archived'
}

export type AddContactsDialogState = {
  status: 'idle' | 'success' | 'error'
  message: string
  addedCount?: number
  skippedCount?: number
}

export const initialAddContactsDialogState: AddContactsDialogState = {
  status: 'idle',
  message: '',
}

type AddContactsDialogAction = (
  previousState: AddContactsDialogState,
  formData: FormData,
) => Promise<AddContactsDialogState>

type AddContactsDialogProps = {
  campaignId: string
  campaignName: string
  contacts: AddContactsDialogContact[]
  existingContactIds?: string[]
  action: AddContactsDialogAction
}

function getContactName(
  contact: AddContactsDialogContact,
): string {
  const fullName =
    `${contact.first_name} ${contact.last_name}`.trim()

  return fullName || 'Unnamed contact'
}

function getContactInitials(
  contact: AddContactsDialogContact,
): string {
  const firstInitial = contact.first_name
    .trim()
    .charAt(0)
    .toUpperCase()

  const lastInitial = contact.last_name
    .trim()
    .charAt(0)
    .toUpperCase()

  const initials = `${firstInitial}${lastInitial}`

  return initials || '?'
}

function getStatusClasses(
  status: AddContactsDialogContact['status'],
): string {
  switch (status) {
    case 'active':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'

    case 'inactive':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-400'

    case 'archived':
      return 'border-slate-500/20 bg-slate-500/10 text-slate-400'
  }
}

export default function AddContactsDialog({
  campaignId,
  campaignName,
  contacts,
  existingContactIds = [],
  action,
}: AddContactsDialogProps) {
  const titleId = useId()
  const descriptionId = useId()

  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedContactIds, setSelectedContactIds] =
    useState<string[]>([])

  const [state, formAction, isPending] = useActionState(
    action,
    initialAddContactsDialogState,
  )

  const existingContactIdSet = useMemo(
    () => new Set(existingContactIds),
    [existingContactIds],
  )

  const availableContacts = useMemo(
    () =>
      contacts.filter(
        (contact) => !existingContactIdSet.has(contact.id),
      ),
    [contacts, existingContactIdSet],
  )

  const filteredContacts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()

    if (!normalizedSearch) {
      return availableContacts
    }

    return availableContacts.filter((contact) => {
      const searchableValues = [
        getContactName(contact),
        contact.email,
        contact.phone,
        contact.company,
        contact.title,
      ]

      return searchableValues.some((value) =>
        value
          ?.toLocaleLowerCase()
          .includes(normalizedSearch),
      )
    })
  }, [availableContacts, search])

  const selectedContactIdSet = useMemo(
    () => new Set(selectedContactIds),
    [selectedContactIds],
  )

  const visibleContactIds = filteredContacts.map(
    (contact) => contact.id,
  )

  const selectedVisibleCount = visibleContactIds.filter(
    (contactId) => selectedContactIdSet.has(contactId),
  ).length

  const allVisibleSelected =
    visibleContactIds.length > 0 &&
    selectedVisibleCount === visibleContactIds.length

 useEffect(() => {
  if (state.status !== 'success') {
    return
  }

  const timeout = window.setTimeout(() => {
    setSelectedContactIds([])
    setSearch('')
    setIsOpen(false)
  }, 0)

  return () => {
    window.clearTimeout(timeout)
  }
}, [state.status])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, isPending])

  function closeDialog(): void {
    if (isPending) {
      return
    }

    setIsOpen(false)
  }

  function toggleContact(contactId: string): void {
    setSelectedContactIds((currentIds) => {
      if (currentIds.includes(contactId)) {
        return currentIds.filter((id) => id !== contactId)
      }

      return [...currentIds, contactId]
    })
  }

  function toggleAllVisible(): void {
    if (allVisibleSelected) {
      setSelectedContactIds((currentIds) =>
        currentIds.filter(
          (contactId) => !visibleContactIds.includes(contactId),
        ),
      )

      return
    }

    setSelectedContactIds((currentIds) =>
      Array.from(
        new Set([...currentIds, ...visibleContactIds]),
      ),
    )
  }

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): void {
    if (selectedContactIds.length === 0) {
      event.preventDefault()
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950"
      >
        <UserPlus
          aria-hidden="true"
          className="size-4"
        />

        Add contacts
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDialog()
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0B1726] shadow-2xl sm:rounded-3xl"
          >
            <header className="flex items-start justify-between gap-6 border-b border-white/10 px-5 py-5 sm:px-6">
              <div>
                <div className="flex size-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
                  <UserPlus
                    aria-hidden="true"
                    className="size-5"
                  />
                </div>

                <h2
                  id={titleId}
                  className="mt-4 text-xl font-semibold text-white"
                >
                  Add contacts
                </h2>

                <p
                  id={descriptionId}
                  className="mt-1 text-sm leading-6 text-slate-400"
                >
                  Select contacts to add to{' '}
                  <span className="font-medium text-slate-200">
                    {campaignName}
                  </span>
                  .
                </p>
              </div>

              <button
                type="button"
                onClick={closeDialog}
                disabled={isPending}
                aria-label="Close dialog"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition hover:border-white/20 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X
                  aria-hidden="true"
                  className="size-4"
                />
              </button>
            </header>

            <form
              action={formAction}
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <input
                type="hidden"
                name="campaignId"
                value={campaignId}
              />

              {selectedContactIds.map((contactId) => (
                <input
                  key={contactId}
                  type="hidden"
                  name="contactIds"
                  value={contactId}
                />
              ))}

              <div className="border-b border-white/10 px-5 py-4 sm:px-6">
                <label className="relative block">
                  <span className="sr-only">
                    Search contacts
                  </span>

                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500"
                  />

                  <input
                    type="search"
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                    placeholder="Search by name, email, phone, or company"
                    className="min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
                  />
                </label>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={toggleAllVisible}
                    disabled={visibleContactIds.length === 0}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span
                      className={`flex size-4 items-center justify-center rounded border ${
                        allVisibleSelected
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-white/20 bg-transparent'
                      }`}
                    >
                      {allVisibleSelected ? (
                        <Check
                          aria-hidden="true"
                          className="size-3"
                        />
                      ) : null}
                    </span>

                    {allVisibleSelected
                      ? 'Clear visible'
                      : 'Select visible'}
                  </button>

                  <p className="text-xs text-slate-500">
                    {selectedContactIds.length}{' '}
                    {selectedContactIds.length === 1
                      ? 'contact'
                      : 'contacts'}{' '}
                    selected
                  </p>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                {filteredContacts.length > 0 ? (
                  <div className="space-y-2">
                    {filteredContacts.map((contact) => {
                      const isSelected =
                        selectedContactIdSet.has(contact.id)

                      return (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() =>
                            toggleContact(contact.id)
                          }
                          aria-pressed={isSelected}
                          className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            isSelected
                              ? 'border-blue-500/50 bg-blue-500/10'
                              : 'border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.05]'
                          }`}
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 text-sm font-semibold text-cyan-300">
                            {getContactInitials(contact)}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="truncate font-medium text-white">
                                {getContactName(contact)}
                              </span>

                              <span
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${getStatusClasses(
                                  contact.status,
                                )}`}
                              >
                                {contact.status}
                              </span>
                            </span>

                            <span className="mt-1 block truncate text-sm text-slate-400">
                              {contact.email || 'No email'}
                            </span>

                            <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                              <span>
                                {contact.company ||
                                  'No company'}
                              </span>

                              <span>
                                {contact.phone || 'No phone'}
                              </span>
                            </span>
                          </span>

                          <span
                            className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded border ${
                              isSelected
                                ? 'border-blue-500 bg-blue-500 text-white'
                                : 'border-white/20 bg-transparent'
                            }`}
                          >
                            {isSelected ? (
                              <Check
                                aria-hidden="true"
                                className="size-3.5"
                              />
                            ) : null}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
                      <Search
                        aria-hidden="true"
                        className="size-5"
                      />
                    </div>

                    <h3 className="mt-4 font-semibold text-white">
                      {availableContacts.length === 0
                        ? 'No contacts available'
                        : 'No matching contacts'}
                    </h3>

                    <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                      {availableContacts.length === 0
                        ? 'Every available contact has already been added to this campaign.'
                        : 'Try another name, email address, phone number, or company.'}
                    </p>
                  </div>
                )}
              </div>

              <footer className="border-t border-white/10 bg-[#07111F]/70 px-5 py-4 sm:px-6">
                {state.status === 'error' &&
                state.message ? (
                  <div
                    role="alert"
                    className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                  >
                    {state.message}
                  </div>
                ) : null}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">
                    Contacts already in this campaign are hidden.
                  </p>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={closeDialog}
                      disabled={isPending}
                      className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={
                        isPending ||
                        selectedContactIds.length === 0
                      }
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                    >
                      {isPending ? (
                        <>
                          <Loader2
                            aria-hidden="true"
                            className="size-4 animate-spin"
                          />

                          Adding contacts
                        </>
                      ) : (
                        <>
                          <Plus
                            aria-hidden="true"
                            className="size-4"
                          />

                          Add{' '}
                          {selectedContactIds.length > 0
                            ? selectedContactIds.length
                            : ''}{' '}
                          {selectedContactIds.length === 1
                            ? 'contact'
                            : 'contacts'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  )
}