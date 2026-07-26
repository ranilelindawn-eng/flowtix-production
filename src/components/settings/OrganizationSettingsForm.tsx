'use client'

import { useState } from 'react'

import ImageUploader from '@/components/ui/ImageUploader'
import { saveOrganizationSettings } from '@/app/dashboard/settings/organization/actions'

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
  const [currentLogoUrl, setCurrentLogoUrl] =
    useState<string | null>(logoUrl)

  return (
    <form
      action={saveOrganizationSettings}
      className="space-y-6 rounded-xl border border-border bg-card p-6"
    >
      <input
        type="hidden"
        name="organization_id"
        value={organizationId}
      />

      <div>
        <label
          htmlFor="organization_name"
          className="mb-2 block text-sm font-medium"
        >
          Organization Name
        </label>

        <input
          id="organization_name"
          name="organization_name"
          defaultValue={name}
          required
          className="w-full rounded-lg border bg-background px-3 py-2"
        />
      </div>

      <div>
        <label
          htmlFor="organization_slug"
          className="mb-2 block text-sm font-medium"
        >
          Organization Slug
        </label>

        <input
          id="organization_slug"
          name="organization_slug"
          defaultValue={slug}
          className="w-full rounded-lg border bg-background px-3 py-2"
        />

        <p className="mt-2 text-sm text-muted-foreground">
          Used in URLs. Only lowercase letters, numbers, and hyphens are recommended.
        </p>
      </div>

      <div className="border-t border-border pt-6">
        <ImageUploader
          bucket="organization-logos"
          folder={organizationId}
          currentUrl={currentLogoUrl}
          label="Organization Logo"
          description="Upload a PNG, JPG, WEBP or SVG image. Maximum file size: 2 MB."
          onUploadComplete={(url) => setCurrentLogoUrl(url)}
          onRemove={() => setCurrentLogoUrl(null)}
        />

        <input
          type="hidden"
          name="logo_url"
          value={currentLogoUrl ?? ''}
        />
      </div>

      <div className="border-t border-border pt-6">
        <button
          type="submit"
          className="rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground transition hover:opacity-90"
        >
          Save Organization
        </button>
      </div>
    </form>
  )
}