'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bell,
  ChevronDown,
  LogOut,
  Settings,
} from 'lucide-react'
import GlobalSearch from '@/components/dashboard/GlobalSearch'
import { createClient } from '@/lib/supabase/client'

type TopNavProps = {
  organizationName: string
  userName: string
  userEmail: string
  avatarUrl: string | null
}

function getInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

  return initials || 'U'
}

export default function TopNav({
  organizationName,
  userName,
  userEmail,
  avatarUrl,
}: TopNavProps) {
  const router = useRouter()
  const menuRef = useRef<HTMLDivElement>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  async function handleLogout() {
    setIsLoggingOut(true)
    setIsOpen(false)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut()

      if (error) {
        console.error('Unable to sign out:', error)
        setIsLoggingOut(false)
        return
      }

      router.replace('/login')
      router.refresh()
    } catch (error) {
      console.error('Unexpected logout error:', error)
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div>
        <p className="text-sm uppercase tracking-[0.28em] text-[#22D3EE]">
          Organization
        </p>

        <h1 className="mt-2 text-3xl font-semibold text-white">
          {organizationName}
        </h1>
      </div>

      <div className="flex flex-1 flex-col gap-4 xl:ml-8 xl:flex-row xl:items-center">
        <GlobalSearch />

        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Notifications"
            className="inline-flex h-12 min-w-[3rem] items-center justify-center rounded-3xl border border-white/10 bg-[#0B1726]/90 p-3 text-slate-300 transition hover:border-white/20 hover:text-white"
          >
            <Bell className="h-5 w-5" />
          </button>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsOpen((current) => !current)}
              aria-expanded={isOpen}
              aria-haspopup="menu"
              className="inline-flex items-center gap-3 rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-sm text-white transition hover:border-white/20"
            >
              {avatarUrl ? (
                <span
                  aria-label={`${userName} avatar`}
                  role="img"
                  className="inline-flex h-9 w-9 shrink-0 rounded-full bg-cover bg-center"
                  style={{
                    backgroundImage: `url("${avatarUrl}")`,
                  }}
                />
              ) : (
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#22D3EE] to-[#2563EB] font-semibold text-white">
                  {getInitials(userName)}
                </span>
              )}

              <span className="hidden max-w-36 truncate sm:inline">
                {userName}
              </span>

              <ChevronDown
                className={`h-4 w-4 transition ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isOpen ? (
              <div
                role="menu"
                aria-label="User menu"
                className="absolute right-0 z-50 mt-3 w-64 overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726] p-2 shadow-2xl"
              >
                <div className="border-b border-white/10 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-white">
                    {userName}
                  </p>

                  <p className="mt-1 truncate text-xs text-slate-400">
                    {userEmail}
                  </p>
                </div>

                <div className="py-2">
                  <Link
                    href="/dashboard/settings"
                    role="menuitem"
                    onClick={() => setIsOpen(false)}
                    className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>

                  <button
  type="button"
  role="menuitem"
  onClick={handleLogout}
  disabled={isLoggingOut}
  className="flex w-full appearance-none items-center gap-3 rounded-2xl border-0 !bg-transparent px-4 py-3 text-left text-sm text-red-300 shadow-none transition hover:!bg-red-500/10 hover:text-red-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
>
  <LogOut className="h-4 w-4" />
  {isLoggingOut ? 'Logging out…' : 'Logout'}
</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}