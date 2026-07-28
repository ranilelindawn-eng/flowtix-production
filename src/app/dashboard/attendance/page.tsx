import AttendanceClock from '@/components/attendance/AttendanceClock'
import AttendanceMonitor from '@/components/attendance/AttendanceMonitor'
import { requirePermission } from '@/lib/auth'
import { getAttendanceDashboard } from '@/lib/attendance'
import { hasPermission } from '@/lib/permissions'

export default async function AttendancePage() {
  const organization = await requirePermission('attendance.view_own')
  const canViewAll = hasPermission(
    organization.role,
    'attendance.view_all',
  )
  const attendance = await getAttendanceDashboard(canViewAll)

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium text-cyan-400">
          Member monitoring
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
          Time & Attendance
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Record daily time in and time out. Organization owners and
          administrators can monitor every member&apos;s duty status and
          attendance history.
        </p>
      </header>

      <AttendanceClock
        isClockedIn={Boolean(attendance.ownOpenEntry)}
        clockedInAt={attendance.ownOpenEntry?.clocked_in_at ?? null}
      />

      <AttendanceMonitor
        members={attendance.members}
        canViewAll={canViewAll}
      />
    </div>
  )
}
