import OrganizationSettingsForm from '@/components/settings/OrganizationSettingsForm'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function OrganizationSettingsPage() {
  const supabase = await createServerSupabaseClient()

  if (!supabase) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold">Organization</h1>
        <p className="mt-2 text-muted-foreground">
          Unable to connect to Supabase.
        </p>
      </div>
    )
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold">Organization</h1>
        <p className="mt-2 text-muted-foreground">
          You are not signed in.
        </p>
      </div>
    )
  }

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id, role, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold">Organization</h1>
        <p className="mt-2 text-muted-foreground">
          Unable to load your organization membership.
        </p>
      </div>
    )
  }

  if (!membership) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold">Organization</h1>
        <p className="mt-2 text-muted-foreground">
          You are not currently connected to an active organization.
        </p>
      </div>
    )
  }

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('id, name, slug, logo_url')
    .eq('id', membership.organization_id)
    .maybeSingle()

  if (organizationError || !organization) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold">Organization</h1>
        <p className="mt-2 text-muted-foreground">
          Your organization record could not be loaded.
        </p>
      </div>
    )
  }

  const isOwner = membership.role === 'owner'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Organization Settings</h1>
        <p className="mt-2 text-muted-foreground">
          The company name is shared across the workspace and is visible to
          every active member.
        </p>
      </div>

      {!isOwner ? (
        <div className="space-y-6 rounded-xl border border-border bg-card p-6">
          <div>
            <h2 className="text-lg font-semibold">Company information</h2>
            <p className="mt-2 text-muted-foreground">
              Only the organization owner can change the company name, URL
              slug, or logo. Your access is view-only.
            </p>
          </div>

          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Company name</dt>
              <dd className="mt-1 font-medium">{organization.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Workspace slug</dt>
              <dd className="mt-1 break-all font-medium">{organization.slug}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <OrganizationSettingsForm
          organizationId={organization.id}
          name={organization.name}
          slug={organization.slug}
          logoUrl={organization.logo_url}
        />
      )}
    </div>
  )
}
