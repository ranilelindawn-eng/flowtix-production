'use server'

import { revalidatePath } from 'next/cache'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type AttendanceActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
}

const initialErrorMessage =
  'The attendance request could not be completed. Please try again.'

function publicMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : initialErrorMessage
}

async function runAttendanceAction(
  functionName: 'clock_in_attendance' | 'clock_out_attendance',
  successMessage: string,
): Promise<AttendanceActionState> {
  try {
    const organization = await requirePermission('attendance.clock')
    const supabase = await createClient()
    const { error } = await supabase.rpc(functionName, {
      target_organization_id: organization.organization_id,
    })

    if (error) {
      throw new Error(error.message)
    }

    revalidatePath('/dashboard/attendance')
    revalidatePath('/dashboard/team')

    return {
      status: 'success',
      message: successMessage,
    }
  } catch (error) {
    console.error(`${functionName} failed:`, error)

    return {
      status: 'error',
      message: publicMessage(error),
    }
  }
}

export async function clockIn(
  _previousState: AttendanceActionState,
  _formData: FormData,
): Promise<AttendanceActionState> {
  return runAttendanceAction(
    'clock_in_attendance',
    'You are now clocked in.',
  )
}

export async function clockOut(
  _previousState: AttendanceActionState,
  _formData: FormData,
): Promise<AttendanceActionState> {
  return runAttendanceAction(
    'clock_out_attendance',
    'You are now clocked out.',
  )
}
