import type { AttendanceMember } from '@/lib/attendance'

import { getCurrentOrganizationTimezone } from '@/lib/team'
function durationLabel(start: string, end: string | null): string {
  const milliseconds =
    new Date(end ?? Date.now()).getTime() - new Date(start).getTime()
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${minutes}m`
}

type AttendanceMonitorProps = {
  members: AttendanceMember[]
  canViewAll: boolean
}

export default async function AttendanceMonitor({
  members,
  canViewAll,
}: AttendanceMonitorProps) {
  const timeZone = await getCurrentOrganizationTimezone()
  const entries = members
    .flatMap((member) =>
      member.entries.map((entry) => ({ member, entry })),
    )
    .sort(
      (a, b) =>
        new Date(b.entry.clocked_in_at).getTime() -
        new Date(a.entry.clocked_in_at).getTime(),
    )

  return (
    <div className="space-y-6">
      {canViewAll ? (
        <section>
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-white">
              Member status
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Live duty status for everyone in this organization.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {members.map((member) => (
              <article
                key={member.user_id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-white">
                      {member.full_name || member.email || 'Team member'}
                    </h3>
                    <p className="mt-1 text-xs capitalize text-slate-500">
                      {member.role}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      member.is_active
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {member.is_active ? 'Active' : 'Offline'}
                  </span>
                </div>
                <p className="mt-4 text-sm text-slate-400">
                  {member.active_since
                    ? `On duty since ${new Date(member.active_since).toLocaleString('en-US', { timeZone })}`
                    : 'No active duty session.'}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 px-5 py-4">
          <h2 className="font-semibold text-white">
            {canViewAll ? 'Attendance history' : 'Your attendance history'}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Time-in and time-out records from the last 30 days.
          </p>
        </div>

        {entries.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">
            No attendance records yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  {canViewAll ? <th className="px-5 py-4">Member</th> : null}
                  <th className="px-5 py-4">Time in</th>
                  <th className="px-5 py-4">Time out</th>
                  <th className="px-5 py-4">Duration</th>
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {entries.map(({ member, entry }) => (
                  <tr key={entry.id}>
                    {canViewAll ? (
                      <td className="px-5 py-4 text-white">
                        {member.full_name || member.email || 'Team member'}
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap px-5 py-4 text-slate-300">
                      {new Date(entry.clocked_in_at).toLocaleString('en-US', { timeZone })}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-300">
                      {entry.clocked_out_at
                        ? new Date(entry.clocked_out_at).toLocaleString('en-US', { timeZone })
                        : '—'}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-300">
                      {durationLabel(
                        entry.clocked_in_at,
                        entry.clocked_out_at,
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          entry.clocked_out_at
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-emerald-500/10 text-emerald-300'
                        }`}
                      >
                        {entry.clocked_out_at ? 'Completed' : 'Active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
