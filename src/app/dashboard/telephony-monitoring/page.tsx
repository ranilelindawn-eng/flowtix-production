import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function TelephonyMonitoringPage() {
  redirect('/dashboard/organization#telephony-operations')
}
