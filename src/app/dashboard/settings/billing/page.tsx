import Link from 'next/link'
import { CreditCard } from 'lucide-react'
import { requirePermission } from '@/lib/auth'
export default async function SettingsBillingPage() {
  await requirePermission('billing.view')
  return <div className="space-y-6"><div><h1 className="text-3xl font-bold">Billing Settings</h1><p className="mt-2 text-muted-foreground">Manage your subscription, usage, upgrades, downgrades, and cancellation.</p></div><div className="rounded-xl border border-border bg-card p-6"><CreditCard className="h-8 w-8 text-primary"/><h2 className="mt-4 text-xl font-semibold">Subscription and usage</h2><p className="mt-2 text-muted-foreground">Open the billing workspace to view plans and manage PayMongo subscription payments and billing history.</p><Link href="/dashboard/billing" className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">Open Billing</Link></div></div>
}
