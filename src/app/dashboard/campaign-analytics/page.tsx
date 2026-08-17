import Link from 'next/link'
import { Activity, BadgeDollarSign, Mail, MessageSquareReply, MousePointerClick, PhoneCall, Target, Users } from 'lucide-react'
import MetricCard from '@/components/reports/MetricCard'
import { requireFeature } from '@/lib/auth'
import { getCampaignAnalyticsOverview, normalizeCampaignAnalyticsPeriod } from '@/lib/analytics/campaigns'

type Props = { searchParams: Promise<{ period?: string }> }
const percent = (value: number): string => `${value.toFixed(1)}%`
const money = (value: number): string => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

export default async function CampaignAnalyticsPage({ searchParams }: Props) {
  await requireFeature('analytics.campaigns', 'reports.view')
  const period = normalizeCampaignAnalyticsPeriod((await searchParams).period)
  const { snapshot, history } = await getCampaignAnalyticsOverview(period)
  const ranges = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['365d', '1 year']] as const
  return <div className="space-y-8">
    <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-sm uppercase tracking-[.24em] text-cyan-400">Outreach intelligence</p><h1 className="mt-2 text-3xl font-semibold text-white">Campaign analytics</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">Track enrollment, delivery, email, SMS, calling, sequence execution, funnel conversion, ROI, trends, and durable historical snapshots.</p></div><nav className="flex flex-wrap gap-2" aria-label="Campaign analytics period">{ranges.map(([value, label]) => <Link key={value} href={`/dashboard/campaign-analytics?period=${value}`} className={period === value ? 'rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white' : 'rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white'}>{label}</Link>)}</nav></header>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Campaigns" value={snapshot.totalCampaigns.toLocaleString()} helper={`${snapshot.activeCampaigns} active`} icon={<Target className="h-5 w-5" />} />
      <MetricCard label="Enrollments" value={snapshot.enrollments.toLocaleString()} helper={`${snapshot.completedEnrollments} completed`} icon={<Users className="h-5 w-5" />} />
      <MetricCard label="Delivery rate" value={percent(snapshot.deliveryRate)} helper={`${snapshot.delivered} delivered · ${snapshot.failed} failed`} icon={<Mail className="h-5 w-5" />} />
      <MetricCard label="Conversion rate" value={percent(snapshot.conversionRate)} helper={`${snapshot.conversions} conversions`} icon={<Activity className="h-5 w-5" />} />
    </section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Email open rate" value={percent(snapshot.openRate)} helper={`${snapshot.emailOpened} opens`} icon={<Mail className="h-5 w-5" />} />
      <MetricCard label="Click rate" value={percent(snapshot.clickRate)} helper={`${snapshot.emailClicked} clicks`} icon={<MousePointerClick className="h-5 w-5" />} />
      <MetricCard label="Reply rate" value={percent(snapshot.replyRate)} helper={`${snapshot.emailReplied + snapshot.smsReplied} replies`} icon={<MessageSquareReply className="h-5 w-5" />} />
      <MetricCard label="Campaign ROI" value={percent(snapshot.roi)} helper={`${money(snapshot.revenue)} revenue · ${money(snapshot.cost)} cost`} icon={<BadgeDollarSign className="h-5 w-5" />} />
    </section>
    <section className="grid gap-6 xl:grid-cols-[1fr_2fr]"><div className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6"><h2 className="text-lg font-semibold text-white">Conversion funnel</h2><div className="mt-5 space-y-4">{snapshot.funnel.map((stage) => <div key={stage.key}><div className="flex items-center justify-between text-sm"><span className="text-slate-300">{stage.label}</span><span className="font-semibold text-white">{stage.value.toLocaleString()} · {percent(stage.rate)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, Math.max(0, stage.rate))}%` }} /></div></div>)}</div></div>
    <div className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6"><h2 className="text-lg font-semibold text-white">Channel performance</h2><div className="mt-5 grid gap-4 sm:grid-cols-3"><div className="rounded-xl border border-white/10 bg-white/[.03] p-4"><Mail className="h-5 w-5 text-cyan-400"/><p className="mt-3 text-2xl font-semibold text-white">{snapshot.emailSent}</p><p className="text-sm text-slate-400">Emails sent · {percent(snapshot.bounceRate)} bounce</p></div><div className="rounded-xl border border-white/10 bg-white/[.03] p-4"><MessageSquareReply className="h-5 w-5 text-cyan-400"/><p className="mt-3 text-2xl font-semibold text-white">{snapshot.smsDelivered}</p><p className="text-sm text-slate-400">SMS delivered · {percent(snapshot.smsReplyRate)} reply</p></div><div className="rounded-xl border border-white/10 bg-white/[.03] p-4"><PhoneCall className="h-5 w-5 text-cyan-400"/><p className="mt-3 text-2xl font-semibold text-white">{snapshot.connectedCalls}</p><p className="text-sm text-slate-400">Connected calls · {percent(snapshot.callConnectRate)} connect</p></div></div></div></section>
    <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-white">Campaign performance</h2><span className="text-sm text-slate-500">{history.length} retained snapshots</span></div><div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-[.15em] text-slate-500"><tr><th className="pb-3">Campaign</th><th className="pb-3">Enrollments</th><th className="pb-3">Delivery</th><th className="pb-3">Open</th><th className="pb-3">Click</th><th className="pb-3">Reply</th><th className="pb-3">Calls</th><th className="pb-3">Conversions</th><th className="pb-3">ROI</th></tr></thead><tbody className="divide-y divide-white/5">{snapshot.campaigns.map((campaign) => <tr key={campaign.campaignId}><td className="py-3"><p className="font-medium text-white">{campaign.name}</p><p className="text-xs capitalize text-slate-500">{campaign.status}</p></td><td className="py-3 text-slate-300">{campaign.enrollments}</td><td className="py-3 text-cyan-300">{percent(campaign.deliveryRate)}</td><td className="py-3 text-slate-300">{percent(campaign.openRate)}</td><td className="py-3 text-slate-300">{percent(campaign.clickRate)}</td><td className="py-3 text-slate-300">{percent(campaign.replyRate)}</td><td className="py-3 text-slate-300">{campaign.connectedCalls}/{campaign.calls}</td><td className="py-3 font-semibold text-white">{campaign.conversions}</td><td className="py-3 text-emerald-300">{percent(campaign.roi)}</td></tr>)}</tbody></table></div></section>
  </div>
}

export const dynamic = 'force-dynamic'
