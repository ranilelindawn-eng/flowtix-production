'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

const LIVE_TABLES = [
  'contacts',
  'calls',
  'campaigns',
  'contact_tasks',
  'opportunities',
  'communication_messages',
  'calendar_events',
] as const

type DashboardLiveRefreshProps = {
  organizationId: string
}

type LiveState = 'connecting' | 'live' | 'fallback'

export default function DashboardLiveRefresh({
  organizationId,
}: DashboardLiveRefreshProps) {
  const router = useRouter()
  const [liveState, setLiveState] = useState<LiveState>('connecting')
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => new Date())
  const refreshTimerRef = useRef<number | null>(null)

  const refreshDashboard = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current)
    }

    refreshTimerRef.current = window.setTimeout(() => {
      setLastUpdatedAt(new Date())
      router.refresh()
      refreshTimerRef.current = null
    }, 500)
  }, [router])

  useEffect(() => {
    if (!organizationId) return

    const supabase = createClient()
    const channel = supabase.channel(`flowtix-dashboard-live:${organizationId}`)

    for (const table of LIVE_TABLES) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `organization_id=eq.${organizationId}`,
        },
        refreshDashboard,
      )
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setLiveState('live')
        return
      }

      if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        setLiveState('fallback')
      }
    })

    const fallbackRefresh = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setLastUpdatedAt(new Date())
        router.refresh()
      }
    }, 30_000)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshDashboard()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      window.clearInterval(fallbackRefresh)
      document.removeEventListener('visibilitychange', handleVisibility)
      void supabase.removeChannel(channel)
    }
  }, [organizationId, refreshDashboard, router])

  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(lastUpdatedAt)

  const isLive = liveState === 'live'

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
        isLive
          ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
          : 'border-amber-400/20 bg-amber-400/10 text-amber-200'
      }`}
      title={`Dashboard last refreshed at ${timeLabel}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isLive ? 'bg-emerald-300' : 'bg-amber-300'
        }`}
      />
      {isLive ? 'Live updates' : 'Auto refresh'}
      <span className="hidden font-medium text-slate-400 sm:inline">
        · {timeLabel}
      </span>
    </span>
  )
}
