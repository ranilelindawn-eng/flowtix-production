'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import { deleteActivity } from '@/app/dashboard/activities/actions'

export default function DeleteActivityButton({ activityId }: { activityId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm('Delete this manually logged activity? This action cannot be undone.')) return
        startTransition(async () => {
          const formData = new FormData()
          formData.set('activityId', activityId)
          await deleteActivity(formData)
          router.push('/dashboard/activities')
          router.refresh()
        })
      }}
      className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-400/[0.12] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Trash2 className="h-4 w-4" />
      {pending ? 'Deleting…' : 'Delete'}
    </button>
  )
}
