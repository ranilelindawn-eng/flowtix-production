import ProfileSettingsForm from '@/components/settings/ProfileSettingsForm'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function ProfileSettingsPage() {
  const supabase = await createServerSupabaseClient()

  if (!supabase) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold">Profile</h1>

        <p className="mt-2 text-muted-foreground">
          Unable to connect to Supabase.
        </p>
      </div>
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold">Profile</h1>

        <p className="mt-2 text-muted-foreground">
          You are not signed in.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">
          Profile Settings
        </h1>

        <p className="mt-2 text-muted-foreground">
          Update your personal information.
        </p>
      </div>

      <ProfileSettingsForm
        userId={user.id}
        email={user.email ?? ''}
        fullName={
          (user.user_metadata?.full_name as string | undefined) ?? ''
        }
        avatarUrl={
          (user.user_metadata?.avatar_url as string | undefined) ?? null
        }
      />
    </div>
  )
}