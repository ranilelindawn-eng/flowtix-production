'use client'

import { useState } from 'react'

import ImageUploader from '@/components/ui/ImageUploader'
import { saveProfileSettings } from '@/app/dashboard/settings/profile/actions'

type ProfileSettingsFormProps = {
  userId: string
  email: string
  fullName: string
  avatarUrl: string | null
}

export default function ProfileSettingsForm({
  userId,
  email,
  fullName,
  avatarUrl,
}: ProfileSettingsFormProps) {
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(
    avatarUrl,
  )

  return (
    <form
      action={saveProfileSettings}
      className="space-y-6 rounded-xl border border-border bg-card p-6"
    >
      <div>
        <label
          htmlFor="full_name"
          className="mb-2 block text-sm font-medium"
        >
          Full Name
        </label>

        <input
          id="full_name"
          name="full_name"
          defaultValue={fullName}
          required
          autoComplete="name"
          className="w-full rounded-lg border bg-background px-3 py-2"
        />
      </div>

      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-medium"
        >
          Email Address
        </label>

        <input
          id="email"
          value={email}
          disabled
          className="w-full rounded-lg border bg-muted px-3 py-2 opacity-70"
        />

        <p className="mt-2 text-sm text-muted-foreground">
          Your email address is managed through your account security settings.
        </p>
      </div>

      <div className="border-t border-border pt-6">
        <ImageUploader
          bucket="avatars"
          folder={userId}
          currentUrl={currentAvatarUrl}
          label="Profile Avatar"
          description="Upload a PNG, JPG or WEBP image. Maximum file size: 2 MB."
          onUploadComplete={(publicUrl) => {
            setCurrentAvatarUrl(publicUrl)
          }}
          onRemove={() => {
            setCurrentAvatarUrl(null)
          }}
        />

        <input
          type="hidden"
          name="avatar_url"
          value={currentAvatarUrl ?? ''}
        />
      </div>

      <div className="border-t border-border pt-6">
        <button
          type="submit"
          className="rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground transition hover:opacity-90"
        >
          Save Profile
        </button>
      </div>
    </form>
  )
}