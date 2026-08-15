'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const LIVE_CALL_REFRESH_INTERVAL_MS = 5_000

export default function LiveCallsAutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        router.refresh()
      }
    }

    const intervalId = window.setInterval(
      refreshWhenVisible,
      LIVE_CALL_REFRESH_INTERVAL_MS,
    )

    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [router])

  return null
}
