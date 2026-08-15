'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const REFRESH_MS = 15_000

export default function AgentAnalyticsAutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }

    const interval = window.setInterval(refresh, REFRESH_MS)
    document.addEventListener('visibilitychange', refresh)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [router])

  return null
}
