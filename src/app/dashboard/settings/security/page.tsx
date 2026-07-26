import { updatePassword } from './actions'

export default function SecuritySettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">
          Security Settings
        </h1>

        <p className="mt-2 text-muted-foreground">
          Update your account password.
        </p>
      </div>

      <form
        action={updatePassword}
        className="space-y-6 rounded-xl border border-border bg-card p-6"
      >
        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-sm font-medium"
          >
            New Password
          </label>

          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            className="w-full rounded-lg border bg-background px-3 py-2"
            required
          />
        </div>

        <div>
          <label
            htmlFor="confirm_password"
            className="mb-2 block text-sm font-medium"
          >
            Confirm Password
          </label>

          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            className="w-full rounded-lg border bg-background px-3 py-2"
            required
          />
        </div>

        <div className="border-t pt-6">
          <button
            type="submit"
            className="rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground transition hover:opacity-90"
          >
            Update Password
          </button>
        </div>
      </form>
    </div>
  )
}