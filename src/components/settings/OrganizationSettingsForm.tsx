'use client'

import { useState } from 'react'

import { saveOrganizationSettings } from '@/app/dashboard/settings/organization/actions'
import ImageUploader from '@/components/ui/ImageUploader'

type OrganizationSettingsFormProps = {
  organizationId: string
  name: string
  slug: string
  logoUrl: string | null
}

export default function OrganizationSettingsForm({
  organizationId,
  name,
  slug,
  logoUrl,
}: OrganizationSettingsFormProps) {
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string | null>(logoUrl)

  return (
    <form
      action={saveOrganizationSettings}
      className="space-y-6 rounded-xl border border-border bg-card p-6"
    >
      <input type="hidden" name="organization_id" value={organizationId} />

      <div>
        <h2 className="text-lg font-semibold">Company identity</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Changes are shared with every member of this organization. Only the
          owner can save changes.
        </p>
      </div>

      <div>
        <label
          htmlFor="organization_name"
          className="mb-2 block text-sm font-medium"
        >
          Company Name
        </label>
        <input
          id="organization_name"
          name="organization_name"
          defaultValue={name}
          minLength={2}
          maxLength={120}
          required
          className="w-full rounded-lg border bg-background px-3 py-2"
        />
        <p className="mt-2 text-sm text-muted-foreground">
          This name appears in the dashboard header for the owner and all
          invited members.
        </p>
      </div>

      <div>
        <label
          htmlFor="organization_slug"
          className="mb-2 block text-sm font-medium"
        >
          Workspace Slug
        </label>
        <input
          id="organization_slug"
          name="organization_slug"
          defaultValue={slug}
          minLength={2}
          maxLength={80}
          className="w-full rounded-lg border bg-background px-3 py-2"
        />
        <p className="mt-2 text-sm text-muted-foreground">
          Use lowercase letters, numbers, and hyphens. Leave it unchanged
          unless you need to update the workspace URL identifier.
        </p>
      </div>

      <div className="border-t border-border pt-6">
        <ImageUploader
          bucket="organization-logos"
          folder={organizationId}
          currentUrl={currentLogoUrl}
          label="Company Logo"
          description="Upload a PNG, JPG, WEBP, or SVG image. Maximum file size: 2 MB."
          onUploadComplete={(url) => setCurrentLogoUrl(url)}
          onRemove={() => setCurrentLogoUrl(null)}
        />
        <input type="hidden" name="logo_url" value={currentLogoUrl ?? ''} />
      </div>

      <div className="border-t border-border pt-6">
        <button
          type="submit"
          className="rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground transition hover:opacity-90"
        >
          Save Company Information
        </button>
      </div>
    </form>
  )
}
