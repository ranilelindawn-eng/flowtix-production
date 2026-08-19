import { NextResponse } from 'next/server'

import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { verifySignalWireRecordingCallback } from '@/lib/telephony/recording-control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function firstText(
  objects: Record<string, unknown>[],
  keys: string[],
): string {
  for (const object of objects) {
    for (const key of keys) {
      const value = text(object[key])
      if (value) return value
    }
  }
  return ''
}

function firstNumber(
  objects: Record<string, unknown>[],
  keys: string[],
): number | null {
  for (const object of objects) {
    for (const key of keys) {
      const value = finiteNumber(object[key])
      if (value !== null) return value
    }
  }
  return null
}

function metadataValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function safeRecordingUrl(value: string): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url)
    const organizationId = url.searchParams.get('organizationId')?.trim() ?? ''
    const callId = url.searchParams.get('callId')?.trim() ?? ''
    const providerCallId = url.searchParams.get('providerCallId')?.trim() ?? ''
    const controlId = url.searchParams.get('controlId')?.trim() ?? ''
    const token = url.searchParams.get('token')?.trim() ?? ''

    if (
      !organizationId ||
      !callId ||
      !providerCallId ||
      !controlId ||
      !token ||
      organizationId.length > 100 ||
      callId.length > 100 ||
      providerCallId.length > 160 ||
      controlId.length > 160 ||
      token.length > 256
    ) {
      return NextResponse.json({ error: 'Invalid recording callback.' }, { status: 400 })
    }

    const verified = await verifySignalWireRecordingCallback({
      organizationId,
      callId,
      providerCallId,
      controlId,
      token,
    })
    if (!verified) {
      return NextResponse.json({ error: 'Invalid recording callback signature.' }, { status: 401 })
    }

    const rawBody = await request.text()
    const contentType = request.headers.get('content-type') ?? ''
    let parsed: unknown = {}
    try {
      parsed = /json/i.test(contentType)
        ? rawBody
          ? JSON.parse(rawBody)
          : {}
        : Object.fromEntries(new URLSearchParams(rawBody).entries())
    } catch {
      return NextResponse.json({ error: 'Invalid recording callback body.' }, { status: 400 })
    }

    const payload = objectValue(parsed)
    const params = objectValue(payload.params)
    const result = objectValue(params.result)
    const recording = objectValue(params.recording)
    const payloadResult = objectValue(payload.result)
    const payloadRecording = objectValue(payload.recording)
    const candidates = [params, result, recording, payloadResult, payloadRecording, payload]

    const eventType = firstText([payload, params], ['event_type', 'eventType', 'type'])
    if (eventType && !eventType.toLowerCase().includes('record')) {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const callbackCallId = firstText(candidates, ['call_id', 'callId'])
    const callbackControlId = firstText(candidates, ['control_id', 'controlId'])
    if (
      (callbackCallId && callbackCallId !== providerCallId) ||
      (callbackControlId && callbackControlId !== controlId)
    ) {
      return NextResponse.json({ error: 'Recording callback identity mismatch.' }, { status: 409 })
    }

    const state = firstText(candidates, [
      'state',
      'record_state',
      'recordState',
      'status',
    ]).toLowerCase()
    const recordingUrl = safeRecordingUrl(
      firstText(candidates, ['url', 'recording_url', 'recordingUrl']),
    )
    const duration = firstNumber(candidates, [
      'duration',
      'duration_seconds',
      'durationSeconds',
    ])
    const size = firstNumber(candidates, ['size', 'file_size', 'fileSize'])
    const now = new Date().toISOString()

    const admin = createTelephonyAdminClient()
    const { data: call, error: callError } = await admin
      .from('calls')
      .select('id,organization_id,created_by,provider,provider_call_sid,provider_child_call_sid,metadata')
      .eq('id', callId)
      .eq('organization_id', organizationId)
      .eq('provider', 'signalwire')
      .maybeSingle()

    if (callError) throw new Error(callError.message)
    if (!call) {
      return NextResponse.json({ ok: true, ignored: true })
    }
    if (
      call.provider_call_sid !== providerCallId &&
      call.provider_child_call_sid !== providerCallId
    ) {
      return NextResponse.json({ error: 'Recording callback call mismatch.' }, { status: 409 })
    }

    const currentMetadata = metadataValue(call.metadata)
    const finished = ['finished', 'completed', 'complete', 'ended'].includes(state)
    const failed = ['failed', 'error', 'no_input', 'no-input'].includes(state)

    if (recordingUrl && (finished || !state)) {
      const { error: recordingError } = await admin.from('call_recordings').upsert(
        {
          organization_id: organizationId,
          call_id: call.id,
          provider: 'signalwire',
          provider_recording_sid: controlId,
          provider_url: recordingUrl,
          status: 'completed',
          duration_seconds: duration === null ? null : Math.round(duration),
          channels: 2,
          created_by: call.created_by,
          updated_at: now,
        },
        { onConflict: 'provider_recording_sid' },
      )
      if (recordingError) throw new Error(recordingError.message)

      const { error: callUpdateError } = await admin
        .from('calls')
        .update({
          recording_available: true,
          metadata: {
            ...currentMetadata,
            recording_provider_sid: controlId,
            recording_state: state || 'finished',
            recording_completed_at: now,
            recording_size_bytes: size,
            recording_error: null,
          },
          updated_at: now,
        })
        .eq('id', call.id)
        .eq('organization_id', organizationId)
      if (callUpdateError) throw new Error(callUpdateError.message)

      return NextResponse.json({ ok: true, recorded: true })
    }

    const recordingError = failed
      ? `SignalWire recording ended with state ${state || 'failed'}.`
      : finished
        ? 'SignalWire recording finished without a recording URL.'
        : null

    const { error: metadataError } = await admin
      .from('calls')
      .update({
        metadata: {
          ...currentMetadata,
          recording_provider_sid: controlId,
          recording_state: state || 'recording',
          recording_callback_at: now,
          ...(recordingError ? { recording_error: recordingError } : {}),
        },
        updated_at: now,
      })
      .eq('id', call.id)
      .eq('organization_id', organizationId)
    if (metadataError) throw new Error(metadataError.message)

    return NextResponse.json({ ok: true, recorded: false })
  } catch (error) {
    console.error('[Flowtix telephony] recording callback failed:', error)
    return NextResponse.json(
      { error: 'Unable to process SignalWire recording callback.' },
      { status: 500 },
    )
  }
}
