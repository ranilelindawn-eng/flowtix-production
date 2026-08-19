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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name,avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('Unable to load profile settings:', profileError)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">
          Profile Settings
        </h1>

        <p className="mt-2 text-muted-foreground">
          Update your personal information. Your name and profile photo are used in Team Chat and member-facing Flowtix views.
        </p>
      </div>

      <ProfileSettingsForm
        userId={user.id}
        email={user.email ?? ''}
        fullName={
          profile?.full_name?.trim() ||
          (user.user_metadata?.full_name as string | undefined) ||
          user.email?.split('@')[0] ||
          ''
        }
        avatarUrl={
          profile?.avatar_url ??
          (user.user_metadata?.avatar_url as string | undefined) ??
          null
        }
      />
    </div>
  )
}