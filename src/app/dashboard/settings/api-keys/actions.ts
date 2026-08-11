'use server'

import { redirect } from 'next/navigation'

export async function createApiKey() {
  redirect('/dashboard/settings/profile')
}

export async function revokeApiKey() {
  redirect('/dashboard/settings/profile')
}
