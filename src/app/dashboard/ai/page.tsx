import { requireOrganization } from '@/lib/auth'
import AIWorkspace from './AIWorkspace'

export default async function AIPage() {
  await requireOrganization()
  return <div className="space-y-6"><div><p className="text-sm font-medium text-blue-400">CallFlow intelligence</p><h1 className="mt-1 text-3xl font-bold text-white">AI Workspace</h1><p className="mt-2 text-sm text-slate-400">Turn conversations and CRM context into clear actions.</p></div><AIWorkspace /></div>
}
