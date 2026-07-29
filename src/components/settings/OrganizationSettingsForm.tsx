'use client'

import { useEffect, useMemo, useState } from 'react'

import { saveOrganizationSettings } from '@/app/dashboard/settings/organization/actions'
import ImageUploader from '@/components/ui/ImageUploader'

const TIMEZONE_OPTIONS = [
  'UTC',
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Halifax',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Athens',
  'Europe/Istanbul',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Manila',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Taipei',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Sydney',
  'Pacific/Auckland',
] as const

type OrganizationSettingsFormProps = {
  organizationId: string
  name: string
  slug: string
  logoUrl: string | null
  timezone: string
}

function formatTimezoneLabel(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date())
    const offset = parts.find((part) => part.type === 'timeZoneName')?.value
    return offset ? `(${offset}) ${timezone}` : timezone
  } catch {
    return timezone
  }
}

export default function OrganizationSettingsForm({
  organizationId,
  name,
  slug,
  logoUrl,
  timezone,
}: OrganizationSettingsFormProps) {
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string | null>(logoUrl)
  const [selectedTimezone, setSelectedTimezone] = useState(timezone || 'UTC')
  const [currentTime, setCurrentTime] = useState('')

  const availableTimezones = useMemo(() => {
    const values = new Set<string>(TIMEZONE_OPTIONS)
    values.add(selectedTimezone)
    return Array.from(values)
  }, [selectedTimezone])

  useEffect(() => {
    const updateCurrentTime = () => {
      try {
        setCurrentTime(
          new Intl.DateTimeFormat('en-US', {
            timeZone: selectedTimezone,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short',
          }).format(new Date()),
        )
      } catch {
        setCurrentTime('Unable to preview this time zone.')
      }
    }

    updateCurrentTime()
    const intervalId = window.setInterval(updateCurrentTime, 1000)
    return () => window.clearInterval(intervalId)
  }, [selectedTimezone])

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
        <label htmlFor="organization_name" className="mb-2 block text-sm font-medium">
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
          This name appears in the dashboard header for the owner and all invited members.
        </p>
      </div>

      <div>
        <label htmlFor="organization_slug" className="mb-2 block text-sm font-medium">
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
          Use lowercase letters, numbers, and hyphens. Leave it unchanged unless you need to update the workspace URL identifier.
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
        <h2 className="text-lg font-semibold">Organization time zone</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This time zone is shared across the workspace and will be used by attendance, calls, reports, campaigns, and scheduled activity.
        </p>

        <div className="mt-5">
          <label htmlFor="timezone" className="mb-2 block text-sm font-medium">
            Time Zone
          </label>
          <select
            id="timezone"
            name="timezone"
            value={selectedTimezone}
            onChange={(event) => setSelectedTimezone(event.target.value)}
            required
            className="w-full rounded-lg border bg-background px-3 py-2"
          >
            {availableTimezones.map((value) => (
              <option key={value} value={value}>
                {formatTimezoneLabel(value)}
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm text-muted-foreground">
            Store an IANA time zone such as Asia/Manila or America/New_York so daylight-saving changes are handled automatically.
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background/60 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Current organization time
          </p>
          <p className="mt-1 font-medium">{currentTime}</p>
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <button
          type="submit"
          className="rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground transition hover:opacity-90"
        >
          Save Organization Settings
        </button>
      </div>
    </form>
  )
}
