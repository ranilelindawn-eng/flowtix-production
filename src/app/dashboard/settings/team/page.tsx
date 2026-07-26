import Link from 'next/link'
import { UsersRound } from 'lucide-react'
export default function TeamSettingsPage() {
  return <div className="space-y-6"><div><h1 className="text-3xl font-bold">Team Settings</h1><p className="mt-2 text-muted-foreground">Manage members, invitations, roles, permissions, and seat usage.</p></div><div className="rounded-xl border border-border bg-card p-6"><UsersRound className="h-8 w-8 text-primary"/><h2 className="mt-4 text-xl font-semibold">Team management</h2><p className="mt-2 text-muted-foreground">The complete team workspace is available from the Team page.</p><Link href="/dashboard/team" className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">Open Team Management</Link></div></div>
}
