import { NextResponse } from 'next/server'

import {
  deleteExportSchedule,
  updateExportSchedule,
} from '@/lib/exports'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const schedule = await updateExportSchedule(id, await request.json())
    return NextResponse.json({ schedule })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to update schedule.',
      },
      { status: 400 },
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await deleteExportSchedule(id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to delete schedule.',
      },
      { status: 400 },
    )
  }
}
