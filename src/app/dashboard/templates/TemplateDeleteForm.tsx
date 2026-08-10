'use client'

import { deleteTemplate } from '../crm-actions'

export default function TemplateDeleteForm({
  templateId,
  templateName,
}: {
  templateId: string
  templateName: string
}) {
  return (
    <form
      action={deleteTemplate}
      onSubmit={(event) => {
        if (!window.confirm(`Delete template “${templateName}”?`)) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="template_id" value={templateId} />
      <button className="rounded-lg border border-rose-400/30 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/10">
        Delete
      </button>
    </form>
  )
}
