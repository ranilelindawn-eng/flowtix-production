'use client'

import { useEffect, useRef } from 'react'

type AutoCheckoutFormProps = {
  planId: string
  planCode: string
}

export function AutoCheckoutForm({
  planId,
  planCode,
}: AutoCheckoutFormProps) {
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    formRef.current?.requestSubmit()
  }, [])

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
      <p>Preparing your secure PayMongo checkout…</p>

      <form
        ref={formRef}
        action="/api/paymongo/checkout"
        method="post"
        className="mt-3"
      >
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="planCode" value={planCode} />

        <button
          type="submit"
          className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-500"
        >
          Continue to PayMongo
        </button>
      </form>
    </div>
  )
}
