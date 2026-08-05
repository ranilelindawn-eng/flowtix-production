import AdministrationConsole from '@/components/admin/AdministrationConsole'
import { getPlatformAdminOverview } from '@/lib/platform-admin'

export default async function AdministrationPage() {
  const overview = await getPlatformAdminOverview()
  return <main className="space-y-8"><div><p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Platform administration</p><h1 className="mt-2 text-3xl font-semibold text-white">Organization control center</h1><p className="mt-2 max-w-3xl text-slate-400">Manage organization structure, teams, roles, permissions, feature flags, configuration, and operational health.</p></div><AdministrationConsole overview={overview} /></main>
}
