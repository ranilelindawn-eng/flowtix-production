import { requireFeature } from '@/lib/auth'
import { rolePermissions } from '@/lib/permissions'
import type { TeamRole } from '@/lib/team'

const roles: TeamRole[] = ['owner', 'admin', 'manager', 'agent']

export default async function RolesPage() {
  await requireFeature('team.advanced', 'team.update_roles')
  const permissions = Array.from(new Set(Object.values(rolePermissions).flat()))

  return (
    <div className="space-y-6">
      <div><p className="text-sm font-medium text-cyan-400">Access control</p><h1 className="mt-1 text-3xl font-bold text-white">Roles & Permissions</h1><p className="mt-2 text-slate-400">Review the permission matrix applied throughout Flowtix.</p></div>
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-800 text-slate-400"><tr><th className="px-5 py-4">Permission</th>{roles.map((role) => <th key={role} className="px-5 py-4 capitalize">{role}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-800">
            {permissions.map((permission) => <tr key={permission}><td className="px-5 py-3 font-mono text-xs text-slate-300">{permission}</td>{roles.map((role) => <td key={role} className="px-5 py-3">{rolePermissions[role].includes(permission) ? <span className="text-emerald-400">Allowed</span> : <span className="text-slate-600">—</span>}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
