import { cache } from 'react'
import { redirect } from 'next/navigation'

import {
  hasPlatformPermission,
} from '@/lib/platform/permissions'
import type {
  PlatformMembership,
  PlatformPermission,
  PlatformRole,
} from '@/lib/platform/types'
import { createClient } from '@/lib/supabase/server'

function isPlatformRole(value: unknown): value is PlatformRole {
  return (
    value === 'platform_owner' ||
    value === 'platform_admin' ||
    value === 'finance' ||
    value === 'support' ||
    value === 'developer'
  )
}

function parseMembership(value: unknown): PlatformMembership | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>

  if (
    typeof row.platform_user_id !== 'string' ||
    typeof row.user_id !== 'string' ||
    !isPlatformRole(row.role) ||
    row.is_active !== true
  ) {
    return null
  }

  return {
    platform_user_id: row.platform_user_id,
    user_id: row.user_id,
    role: row.role,
    is_active: true,
  }
}

export const getCurrentPlatformMembership = cache(
  async (): Promise<PlatformMembership | null> => {
    const supabase = await createClient()
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims()
    const userId = claimsData?.claims?.sub

    if (
      claimsError ||
      typeof userId !== 'string' ||
      userId.length === 0
    ) {
      return null
    }

    const { data, error } = await supabase.rpc(
      'get_current_platform_membership',
    )

    if (error) {
      throw new Error(
        `Unable to verify platform access: ${error.message}`,
      )
    }

    const raw = Array.isArray(data) ? data[0] ?? null : data
    const membership = parseMembership(raw)

    return membership?.user_id === userId ? membership : null
  },
)

export async function requirePlatformAccess(): Promise<PlatformMembership> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (typeof userId !== 'string' || userId.length === 0) {
    redirect('/login?next=/platform')
  }

  const membership = await getCurrentPlatformMembership()
  if (!membership) redirect('/dashboard')

  return membership
}

export async function requirePlatformPermission(
  permission: PlatformPermission,
): Promise<PlatformMembership> {
  const membership = await requirePlatformAccess()

  if (!hasPlatformPermission(membership.role, permission)) {
    redirect('/platform/access-denied')
  }

  return membership
}
