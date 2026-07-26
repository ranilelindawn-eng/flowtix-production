import { redirect } from 'next/navigation'

import { hasPermission, type Permission } from '@/lib/permissions'
import {
  getCurrentOrganization,
  type CurrentOrganizationMembership,
} from '@/lib/team'

export async function requireOrganization(): Promise<CurrentOrganizationMembership> {
  const organization = await getCurrentOrganization()

  if (!organization) {
    redirect('/dashboard')
  }

  return organization
}

export async function requirePermission(
  permission: Permission,
): Promise<CurrentOrganizationMembership> {
  const organization = await requireOrganization()

  if (!hasPermission(organization.role, permission)) {
    redirect('/dashboard')
  }

  return organization
}

export async function requireOwner(): Promise<CurrentOrganizationMembership> {
  const organization = await requireOrganization()

  if (organization.role !== 'owner') {
    redirect('/dashboard')
  }

  return organization
}

export async function requireAdmin(): Promise<CurrentOrganizationMembership> {
  const organization = await requireOrganization()

  if (
    organization.role !== 'owner' &&
    organization.role !== 'admin'
  ) {
    redirect('/dashboard')
  }

  return organization
}

export async function requireManager(): Promise<CurrentOrganizationMembership> {
  const organization = await requireOrganization()

  if (
    organization.role !== 'owner' &&
    organization.role !== 'admin' &&
    organization.role !== 'manager'
  ) {
    redirect('/dashboard')
  }

  return organization
}