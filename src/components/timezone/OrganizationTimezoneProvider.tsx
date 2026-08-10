'use client'

import { createContext, useContext, type ReactNode } from 'react'

import { normalizeTimeZone } from '@/lib/timezone'

const OrganizationTimezoneContext = createContext('UTC')

export function OrganizationTimezoneProvider({
  timeZone,
  children,
}: {
  timeZone: string
  children: ReactNode
}) {
  return (
    <OrganizationTimezoneContext.Provider value={normalizeTimeZone(timeZone)}>
      {children}
    </OrganizationTimezoneContext.Provider>
  )
}

export function useOrganizationTimezone(): string {
  return useContext(OrganizationTimezoneContext)
}
