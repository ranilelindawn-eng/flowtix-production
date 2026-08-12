import { createClient } from '@supabase/supabase-js'

import type { JsonValue } from '@/lib/jobs/types'

import {
  EXPORT_FORMATS,
  EXPORT_RESOURCES,
  EXPORT_RESOURCE_LABELS,
  type ExportFormat,
  type ExportResource,
} from './types'

type Payload = {
  exportId: string
  organizationId: string
  resource: ExportResource
  format: ExportFormat
  filters?: Record<string, unknown>
}

type ExportColumn = {
  label: string
  value: (row: Record<string, unknown>, lookups: LookupContext) => unknown
  kind?: 'text' | 'phone' | 'boolean' | 'date' | 'number' | 'duration'
}

type ResourceSpec = {
  table: string
  select: string
  columns: ExportColumn[]
}

type LookupContext = {
  contacts: Map<string, string>
  companies: Map<string, string>
  campaigns: Map<string, string>
  pipelines: Map<string, string>
  stages: Map<string, string>
  opportunities: Map<string, string>
  users: Map<string, string>
}

type PreparedExport = {
  title: string
  columns: ExportColumn[]
  rows: Record<string, unknown>[]
  lookups: LookupContext
}

const emptyLookups = (): LookupContext => ({
  contacts: new Map(),
  companies: new Map(),
  campaigns: new Map(),
  pipelines: new Map(),
  stages: new Map(),
  opportunities: new Map(),
  users: new Map(),
})

const direct = (
  key: string,
  label: string,
  kind: ExportColumn['kind'] = 'text',
): ExportColumn => ({
  label,
  kind,
  value: (row) => row[key],
})

const lookup = (
  key: string,
  label: string,
  source: keyof LookupContext,
): ExportColumn => ({
  label,
  value: (row, lookups) => {
    const id = row[key]
    if (typeof id !== 'string' || !id) return ''
    return lookups[source].get(id) ?? ''
  },
})

const jsonSummary = (value: unknown): string => {
  if (value == null) return ''

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return Object.entries(item as Record<string, unknown>)
            .map(([key, child]) => `${humanize(key)}: ${scalarText(child)}`)
            .join(' | ')
        }
        return scalarText(item)
      })
      .filter(Boolean)
      .join(' ; ')
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => `${humanize(key)}: ${scalarText(child)}`)
      .filter(Boolean)
      .join(' ; ')
  }

  return String(value)
}

const scalarText = (value: unknown): string => {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return jsonSummary(value)
  return String(value)
}

const humanize = (value: string): string =>
  value
    .split('_')
    .map((part) => {
      const upper: Record<string, string> = {
        ai: 'AI',
        sms: 'SMS',
        roi: 'ROI',
        id: 'ID',
        url: 'URL',
      }
      return upper[part] ?? `${part.charAt(0).toUpperCase()}${part.slice(1)}`
    })
    .join(' ')

const jsonColumn = (key: string, label: string): ExportColumn => ({
  label,
  value: (row) => jsonSummary(row[key]),
})

const RESOURCE_SPECS: Record<ExportResource, ResourceSpec> = {
  contacts: {
    table: 'contacts',
    select:
      'id,first_name,last_name,preferred_name,email,phone,company,title,status,lifecycle_stage,source,lead_score,timezone,locale,last_contacted_at,next_follow_up_at,do_not_email,do_not_sms,do_not_call,custom_fields,created_at,updated_at',
    columns: [
      direct('first_name', 'First Name'),
      direct('last_name', 'Last Name'),
      direct('preferred_name', 'Preferred Name'),
      direct('email', 'Email'),
      direct('phone', 'Phone', 'phone'),
      direct('company', 'Company'),
      direct('title', 'Job Title'),
      direct('status', 'Status'),
      direct('lifecycle_stage', 'Lifecycle Stage'),
      direct('source', 'Source'),
      direct('lead_score', 'Lead Score', 'number'),
      direct('timezone', 'Timezone'),
      direct('locale', 'Locale'),
      direct('last_contacted_at', 'Last Contacted', 'date'),
      direct('next_follow_up_at', 'Next Follow-up', 'date'),
      direct('do_not_email', 'Do Not Email', 'boolean'),
      direct('do_not_sms', 'Do Not SMS', 'boolean'),
      direct('do_not_call', 'Do Not Call', 'boolean'),
      jsonColumn('custom_fields', 'Custom Fields'),
      direct('created_at', 'Created At', 'date'),
      direct('updated_at', 'Updated At', 'date'),
    ],
  },

  companies: {
    table: 'companies',
    select:
      'id,name,legal_name,domain,industry,company_type,status,phone,email,website,address,city,country,employee_count,annual_revenue,currency_code,linkedin_url,timezone,locale,founded_year,parent_company_id,owner_id,description,custom_fields,created_at,updated_at',
    columns: [
      direct('name', 'Company Name'),
      direct('legal_name', 'Legal Name'),
      direct('domain', 'Domain'),
      direct('industry', 'Industry'),
      direct('company_type', 'Company Type'),
      direct('status', 'Status'),
      direct('phone', 'Phone', 'phone'),
      direct('email', 'Email'),
      direct('website', 'Website'),
      direct('address', 'Address'),
      direct('city', 'City'),
      direct('country', 'Country'),
      direct('employee_count', 'Employees', 'number'),
      direct('annual_revenue', 'Annual Revenue', 'number'),
      direct('currency_code', 'Currency'),
      direct('linkedin_url', 'LinkedIn'),
      direct('timezone', 'Timezone'),
      direct('locale', 'Locale'),
      direct('founded_year', 'Founded Year', 'number'),
      lookup('parent_company_id', 'Parent Company', 'companies'),
      lookup('owner_id', 'Owner', 'users'),
      direct('description', 'Description'),
      jsonColumn('custom_fields', 'Custom Fields'),
      direct('created_at', 'Created At', 'date'),
      direct('updated_at', 'Updated At', 'date'),
    ],
  },

  opportunities: {
    table: 'opportunities',
    select:
      'id,name,pipeline_id,stage_id,company_id,contact_id,value,currency,probability,expected_close_date,owner_id,status,description,next_step,next_step_due_at,source,loss_reason,custom_fields,created_at,updated_at',
    columns: [
      direct('name', 'Deal Name'),
      lookup('pipeline_id', 'Pipeline', 'pipelines'),
      lookup('stage_id', 'Stage', 'stages'),
      lookup('company_id', 'Company', 'companies'),
      lookup('contact_id', 'Contact', 'contacts'),
      direct('value', 'Deal Value', 'number'),
      direct('currency', 'Currency'),
      direct('probability', 'Probability (%)', 'number'),
      direct('expected_close_date', 'Expected Close Date', 'date'),
      lookup('owner_id', 'Owner', 'users'),
      direct('status', 'Status'),
      direct('source', 'Source'),
      direct('next_step', 'Next Step'),
      direct('next_step_due_at', 'Next Step Due', 'date'),
      direct('loss_reason', 'Loss Reason'),
      direct('description', 'Description'),
      jsonColumn('custom_fields', 'Custom Fields'),
      direct('created_at', 'Created At', 'date'),
      direct('updated_at', 'Updated At', 'date'),
    ],
  },

  calls: {
    table: 'calls',
    select:
      'id,campaign_id,contact_id,direction,status,started_at,duration_seconds,recording_available,notes,created_at,updated_at',
    columns: [
      lookup('contact_id', 'Contact', 'contacts'),
      lookup('campaign_id', 'Campaign', 'campaigns'),
      direct('direction', 'Direction'),
      direct('status', 'Status'),
      direct('started_at', 'Started At', 'date'),
      direct('duration_seconds', 'Duration', 'duration'),
      direct('recording_available', 'Recording Available', 'boolean'),
      direct('notes', 'Notes'),
      direct('created_at', 'Created At', 'date'),
      direct('updated_at', 'Updated At', 'date'),
    ],
  },

  campaigns: {
    table: 'campaigns',
    select: 'id,name,description,status,start_date,end_date,created_at,updated_at',
    columns: [
      direct('name', 'Campaign Name'),
      direct('description', 'Description'),
      direct('status', 'Status'),
      direct('start_date', 'Start Date', 'date'),
      direct('end_date', 'End Date', 'date'),
      direct('created_at', 'Created At', 'date'),
      direct('updated_at', 'Updated At', 'date'),
    ],
  },

  tasks: {
    table: 'contact_tasks',
    select:
      'id,contact_id,title,description,due_at,status,priority,assigned_to,completed_at,custom_fields,created_at,updated_at',
    columns: [
      direct('title', 'Task'),
      lookup('contact_id', 'Contact', 'contacts'),
      direct('description', 'Description'),
      direct('due_at', 'Due At', 'date'),
      direct('status', 'Status'),
      direct('priority', 'Priority'),
      lookup('assigned_to', 'Assigned To', 'users'),
      direct('completed_at', 'Completed At', 'date'),
      jsonColumn('custom_fields', 'Custom Fields'),
      direct('created_at', 'Created At', 'date'),
      direct('updated_at', 'Updated At', 'date'),
    ],
  },

  activities: {
    table: 'crm_activities',
    select:
      'id,contact_id,company_id,opportunity_id,activity_type,direction,status,subject,body,outcome,occurred_at,duration_seconds,source,visibility,created_by,custom_fields,created_at,updated_at',
    columns: [
      direct('activity_type', 'Activity Type'),
      direct('subject', 'Subject'),
      lookup('contact_id', 'Contact', 'contacts'),
      lookup('company_id', 'Company', 'companies'),
      lookup('opportunity_id', 'Opportunity', 'opportunities'),
      direct('direction', 'Direction'),
      direct('status', 'Status'),
      direct('outcome', 'Outcome'),
      direct('occurred_at', 'Occurred At', 'date'),
      direct('duration_seconds', 'Duration', 'duration'),
      direct('source', 'Source'),
      direct('visibility', 'Visibility'),
      lookup('created_by', 'Created By', 'users'),
      direct('body', 'Details'),
      jsonColumn('custom_fields', 'Custom Fields'),
      direct('created_at', 'Created At', 'date'),
      direct('updated_at', 'Updated At', 'date'),
    ],
  },

  recordings: {
    table: 'call_recordings',
    select:
      'id,call_id,provider,status,duration_seconds,channels,created_at,updated_at',
    columns: [
      direct('call_id', 'Call ID'),
      direct('provider', 'Provider'),
      direct('status', 'Status'),
      direct('duration_seconds', 'Duration', 'duration'),
      direct('channels', 'Channels', 'number'),
      direct('created_at', 'Recorded At', 'date'),
      direct('updated_at', 'Updated At', 'date'),
    ],
  },

  transcripts: {
    table: 'call_transcripts',
    select:
      'id,call_id,provider,language,status,content,created_at,updated_at',
    columns: [
      direct('call_id', 'Call ID'),
      direct('provider', 'Provider'),
      direct('language', 'Language'),
      direct('status', 'Status'),
      direct('content', 'Transcript'),
      direct('created_at', 'Created At', 'date'),
      direct('updated_at', 'Updated At', 'date'),
    ],
  },

  sales_analytics: {
    table: 'sales_analytics_snapshots',
    select:
      'id,period,period_start,period_end,currency_code,created_deals,open_deals,won_deals,lost_deals,pipeline_value,weighted_pipeline_value,won_revenue,average_deal_size,win_rate,average_sales_cycle_days,stale_deals,overdue_next_steps,stage_metrics,owner_metrics,source_metrics,forecast_metrics,trend_metrics,captured_at',
    columns: [
      direct('period', 'Period'),
      direct('period_start', 'Period Start', 'date'),
      direct('period_end', 'Period End', 'date'),
      direct('currency_code', 'Currency'),
      direct('created_deals', 'Created Deals', 'number'),
      direct('open_deals', 'Open Deals', 'number'),
      direct('won_deals', 'Won Deals', 'number'),
      direct('lost_deals', 'Lost Deals', 'number'),
      direct('pipeline_value', 'Pipeline Value', 'number'),
      direct('weighted_pipeline_value', 'Weighted Pipeline Value', 'number'),
      direct('won_revenue', 'Won Revenue', 'number'),
      direct('average_deal_size', 'Average Deal Size', 'number'),
      direct('win_rate', 'Win Rate (%)', 'number'),
      direct('average_sales_cycle_days', 'Average Sales Cycle (Days)', 'number'),
      direct('stale_deals', 'Stale Deals', 'number'),
      direct('overdue_next_steps', 'Overdue Next Steps', 'number'),
      jsonColumn('stage_metrics', 'Stage Breakdown'),
      jsonColumn('owner_metrics', 'Owner Breakdown'),
      jsonColumn('source_metrics', 'Source Breakdown'),
      jsonColumn('forecast_metrics', 'Forecast'),
      jsonColumn('trend_metrics', 'Trend'),
      direct('captured_at', 'Captured At', 'date'),
    ],
  },

  call_analytics: {
    table: 'call_analytics_snapshots',
    select:
      'id,period,period_start,period_end,total_calls,inbound_calls,outbound_calls,connected_calls,failed_calls,missed_calls,connect_rate,total_talk_seconds,average_duration_seconds,average_answer_seconds,recorded_calls,recording_rate,queue_entries,queue_answered,queue_abandoned,queue_abandon_rate,routing_attempts,routing_failures,provider_metrics,direction_metrics,agent_metrics,queue_metrics,routing_metrics,trend_metrics,captured_at',
    columns: [
      direct('period', 'Period'),
      direct('period_start', 'Period Start', 'date'),
      direct('period_end', 'Period End', 'date'),
      direct('total_calls', 'Total Calls', 'number'),
      direct('inbound_calls', 'Inbound Calls', 'number'),
      direct('outbound_calls', 'Outbound Calls', 'number'),
      direct('connected_calls', 'Connected Calls', 'number'),
      direct('failed_calls', 'Failed Calls', 'number'),
      direct('missed_calls', 'Missed Calls', 'number'),
      direct('connect_rate', 'Connect Rate (%)', 'number'),
      direct('total_talk_seconds', 'Total Talk Time', 'duration'),
      direct('average_duration_seconds', 'Average Call Duration', 'duration'),
      direct('average_answer_seconds', 'Average Answer Time', 'duration'),
      direct('recorded_calls', 'Recorded Calls', 'number'),
      direct('recording_rate', 'Recording Rate (%)', 'number'),
      direct('queue_entries', 'Queue Entries', 'number'),
      direct('queue_answered', 'Queue Answered', 'number'),
      direct('queue_abandoned', 'Queue Abandoned', 'number'),
      direct('queue_abandon_rate', 'Queue Abandon Rate (%)', 'number'),
      direct('routing_attempts', 'Routing Attempts', 'number'),
      direct('routing_failures', 'Routing Failures', 'number'),
      jsonColumn('provider_metrics', 'Provider Breakdown'),
      jsonColumn('direction_metrics', 'Direction Breakdown'),
      jsonColumn('agent_metrics', 'Agent Breakdown'),
      jsonColumn('queue_metrics', 'Queue Breakdown'),
      jsonColumn('routing_metrics', 'Routing Breakdown'),
      jsonColumn('trend_metrics', 'Trend'),
      direct('captured_at', 'Captured At', 'date'),
    ],
  },

  agent_analytics: {
    table: 'agent_analytics_snapshots',
    select:
      'id,period,period_start,period_end,total_agents,available_agents,busy_agents,away_agents,offline_agents,total_calls,connected_calls,connect_rate,total_talk_seconds,completed_tasks,overdue_tasks,completed_activities,attendance_seconds,average_coaching_score,average_productivity_score,agent_metrics,trend_metrics,captured_at',
    columns: [
      direct('period', 'Period'),
      direct('period_start', 'Period Start', 'date'),
      direct('period_end', 'Period End', 'date'),
      direct('total_agents', 'Total Agents', 'number'),
      direct('available_agents', 'Available Agents', 'number'),
      direct('busy_agents', 'Busy Agents', 'number'),
      direct('away_agents', 'Away Agents', 'number'),
      direct('offline_agents', 'Offline Agents', 'number'),
      direct('total_calls', 'Total Calls', 'number'),
      direct('connected_calls', 'Connected Calls', 'number'),
      direct('connect_rate', 'Connect Rate (%)', 'number'),
      direct('total_talk_seconds', 'Total Talk Time', 'duration'),
      direct('completed_tasks', 'Completed Tasks', 'number'),
      direct('overdue_tasks', 'Overdue Tasks', 'number'),
      direct('completed_activities', 'Completed Activities', 'number'),
      direct('attendance_seconds', 'Attendance Time', 'duration'),
      direct('average_coaching_score', 'Average Coaching Score', 'number'),
      direct('average_productivity_score', 'Average Productivity Score', 'number'),
      jsonColumn('agent_metrics', 'Agent Breakdown'),
      jsonColumn('trend_metrics', 'Trend'),
      direct('captured_at', 'Captured At', 'date'),
    ],
  },

  campaign_analytics: {
    table: 'campaign_analytics_snapshots',
    select:
      'id,period,period_start,period_end,total_campaigns,active_campaigns,enrollments,completed_enrollments,delivery_attempts,delivered,failed,email_sent,email_opened,email_clicked,email_replied,email_bounced,sms_sent,sms_delivered,sms_replied,calls,connected_calls,conversions,revenue,cost,delivery_rate,open_rate,click_rate,reply_rate,bounce_rate,sms_delivery_rate,sms_reply_rate,call_connect_rate,conversion_rate,roi,campaign_metrics,funnel_metrics,trend_metrics,captured_at',
    columns: [
      direct('period', 'Period'),
      direct('period_start', 'Period Start', 'date'),
      direct('period_end', 'Period End', 'date'),
      direct('total_campaigns', 'Total Campaigns', 'number'),
      direct('active_campaigns', 'Active Campaigns', 'number'),
      direct('enrollments', 'Enrollments', 'number'),
      direct('completed_enrollments', 'Completed Enrollments', 'number'),
      direct('delivery_attempts', 'Delivery Attempts', 'number'),
      direct('delivered', 'Delivered', 'number'),
      direct('failed', 'Failed', 'number'),
      direct('email_sent', 'Emails Sent', 'number'),
      direct('email_opened', 'Emails Opened', 'number'),
      direct('email_clicked', 'Emails Clicked', 'number'),
      direct('email_replied', 'Email Replies', 'number'),
      direct('email_bounced', 'Email Bounces', 'number'),
      direct('sms_sent', 'SMS Sent', 'number'),
      direct('sms_delivered', 'SMS Delivered', 'number'),
      direct('sms_replied', 'SMS Replies', 'number'),
      direct('calls', 'Calls', 'number'),
      direct('connected_calls', 'Connected Calls', 'number'),
      direct('conversions', 'Conversions', 'number'),
      direct('revenue', 'Revenue', 'number'),
      direct('cost', 'Cost', 'number'),
      direct('delivery_rate', 'Delivery Rate (%)', 'number'),
      direct('open_rate', 'Open Rate (%)', 'number'),
      direct('click_rate', 'Click Rate (%)', 'number'),
      direct('reply_rate', 'Reply Rate (%)', 'number'),
      direct('bounce_rate', 'Bounce Rate (%)', 'number'),
      direct('sms_delivery_rate', 'SMS Delivery Rate (%)', 'number'),
      direct('sms_reply_rate', 'SMS Reply Rate (%)', 'number'),
      direct('call_connect_rate', 'Call Connect Rate (%)', 'number'),
      direct('conversion_rate', 'Conversion Rate (%)', 'number'),
      direct('roi', 'ROI', 'number'),
      jsonColumn('campaign_metrics', 'Campaign Breakdown'),
      jsonColumn('funnel_metrics', 'Funnel Breakdown'),
      jsonColumn('trend_metrics', 'Trend'),
      direct('captured_at', 'Captured At', 'date'),
    ],
  },
}

function formatDuration(value: unknown): string {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds < 0) return value == null ? '' : String(value)

  const rounded = Math.round(seconds)
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const remaining = rounded % 60

  if (hours) return `${hours}h ${minutes}m ${remaining}s`
  if (minutes) return `${minutes}m ${remaining}s`
  return `${remaining}s`
}

function formatDate(value: unknown): string {
  if (value == null || value === '') return ''
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}

function formattedValue(
  raw: unknown,
  kind: ExportColumn['kind'],
): string {
  if (raw == null) return ''

  if (kind === 'boolean') {
    return raw === true ? 'Yes' : raw === false ? 'No' : String(raw)
  }

  if (kind === 'date') return formatDate(raw)
  if (kind === 'duration') return formatDuration(raw)
  if (kind === 'number') return String(raw)

  if (typeof raw === 'object') return jsonSummary(raw)
  return String(raw)
}

function excelSafeText(value: string, kind: ExportColumn['kind']): string {
  if (!value) return ''

  // Keep phone numbers as text so Excel does not convert +63 / +1 numbers
  // into scientific notation or strip their leading + sign.
  if (kind === 'phone') {
    return value.startsWith("'") ? value : `'${value}`
  }

  // Prevent spreadsheet formula injection from CRM text.
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`
  }

  return value
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function csv(prepared: PreparedExport): Buffer {
  const header = prepared.columns.map((column) => csvEscape(column.label))
  const body = prepared.rows.map((row) =>
    prepared.columns.map((column) => {
      const value = formattedValue(
        column.value(row, prepared.lookups),
        column.kind,
      )
      return csvEscape(excelSafeText(value, column.kind))
    }),
  )

  // UTF-8 BOM + CRLF makes direct opening in Windows Excel reliable.
  return Buffer.from(
    `\uFEFF${[header, ...body].map((line) => line.join(',')).join('\r\n')}`,
    'utf8',
  )
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function excel(prepared: PreparedExport): Buffer {
  const worksheetRow = (values: string[], bold = false) =>
    `<Row>${values
      .map(
        (value) =>
          `<Cell${bold ? ' ss:StyleID="Header"' : ''}><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`,
      )
      .join('')}</Row>`

  const header = prepared.columns.map((column) => column.label)
  const body = prepared.rows.map((row) =>
    prepared.columns.map((column) =>
      formattedValue(column.value(row, prepared.lookups), column.kind),
    ),
  )

  const xml =
    '<?xml version="1.0"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    '<Styles><Style ss:ID="Header"><Font ss:Bold="1"/></Style></Styles>' +
    `<Worksheet ss:Name="${escapeXml(prepared.title.slice(0, 31))}"><Table>` +
    worksheetRow(header, true) +
    body.map((values) => worksheetRow(values)).join('') +
    '</Table></Worksheet></Workbook>'

  return Buffer.from(xml, 'utf8')
}

function pdf(prepared: PreparedExport): Buffer {
  const lines = [
    `Flowtix - ${prepared.title}`,
    `Rows: ${prepared.rows.length}`,
    '',
    ...prepared.rows.slice(0, 1000).flatMap((row, index) => [
      `Record ${index + 1}`,
      ...prepared.columns.map((column) => {
        const value = formattedValue(
          column.value(row, prepared.lookups),
          column.kind,
        )
        return `${column.label}: ${value}`
      }),
      '',
    ]),
  ]

  const safe = lines.map((line) =>
    line
      .replace(/[()\\]/g, '\\$&')
      .replace(/[^\x20-\x7E]/g, '?')
      .slice(0, 170),
  )

  let content = 'BT /F1 8 Tf 30 810 Td '
  let rowCount = 0

  for (const line of safe) {
    content += `(${line}) Tj 0 -12 Td `
    rowCount += 1
    if (rowCount >= 62) break
  }

  content += 'ET'

  const objects = [
    null,
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]

  let output = '%PDF-1.4\n'
  const offsets: number[] = []

  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(output)
    output += `${index} 0 obj\n${objects[index]}\nendobj\n`
  }

  const xref = Buffer.byteLength(output)
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`

  for (let index = 1; index < objects.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }

  output +=
    `trailer << /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xref}\n%%EOF`

  return Buffer.from(output, 'binary')
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    throw new Error('Missing Supabase service-role configuration.')
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function parse(payload: JsonValue): Payload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid export payload.')
  }

  const object = payload as Record<string, unknown>

  if (
    typeof object.exportId !== 'string' ||
    typeof object.organizationId !== 'string' ||
    !EXPORT_RESOURCES.includes(object.resource as ExportResource) ||
    !EXPORT_FORMATS.includes(object.format as ExportFormat)
  ) {
    throw new Error('Invalid export payload.')
  }

  return {
    exportId: object.exportId,
    organizationId: object.organizationId,
    resource: object.resource as ExportResource,
    format: object.format as ExportFormat,
    filters:
      object.filters &&
      typeof object.filters === 'object' &&
      !Array.isArray(object.filters)
        ? (object.filters as Record<string, unknown>)
        : {},
  }
}

async function nameMap(
  supabase: ReturnType<typeof client>,
  table: string,
  organizationId: string,
  select: string,
  label: (row: Record<string, unknown>) => string,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from(table)
    .select(select)
    .eq('organization_id', organizationId)
    .limit(50000)

  return new Map(
    ((data ?? []) as unknown as Record<string, unknown>[])
      .map((row) => [String(row.id ?? ''), label(row)] as const)
      .filter(([id]) => Boolean(id)),
  )
}

async function loadLookups(
  supabase: ReturnType<typeof client>,
  organizationId: string,
): Promise<LookupContext> {
  const lookups = emptyLookups()

  const [
    contacts,
    companies,
    campaigns,
    pipelines,
    stages,
    opportunities,
    profiles,
  ] = await Promise.all([
    nameMap(
      supabase,
      'contacts',
      organizationId,
      'id,first_name,last_name,email',
      (row) =>
        [row.first_name, row.last_name]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        String(row.email ?? ''),
    ),
    nameMap(
      supabase,
      'companies',
      organizationId,
      'id,name',
      (row) => String(row.name ?? ''),
    ),
    nameMap(
      supabase,
      'campaigns',
      organizationId,
      'id,name',
      (row) => String(row.name ?? ''),
    ),
    nameMap(
      supabase,
      'pipelines',
      organizationId,
      'id,name',
      (row) => String(row.name ?? ''),
    ),
    nameMap(
      supabase,
      'pipeline_stages',
      organizationId,
      'id,name',
      (row) => String(row.name ?? ''),
    ),
    nameMap(
      supabase,
      'opportunities',
      organizationId,
      'id,name',
      (row) => String(row.name ?? ''),
    ),
    supabase
      .from('profiles')
      .select('id,full_name,email')
      .eq('organization_id', organizationId)
      .limit(5000),
  ])

  lookups.contacts = contacts
  lookups.companies = companies
  lookups.campaigns = campaigns
  lookups.pipelines = pipelines
  lookups.stages = stages
  lookups.opportunities = opportunities

  const profileRows =
    (profiles.data ?? []) as unknown as Array<Record<string, unknown>>

  for (const profile of profileRows) {
    const userId = profile.id
    if (typeof userId !== 'string' || !userId) continue

    const fullName =
      typeof profile.full_name === 'string' ? profile.full_name.trim() : ''
    const email =
      typeof profile.email === 'string' ? profile.email.trim() : ''

    lookups.users.set(userId, fullName || email || 'Workspace member')
  }

  return lookups
}

export async function processExport(payload: JsonValue) {
  const input = parse(payload)
  const supabase = client()
  const resourceSpec = RESOURCE_SPECS[input.resource]

  const exportLookup = await supabase
    .from('export_jobs')
    .select('id,owner_user_id')
    .eq('id', input.exportId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (exportLookup.error || !exportLookup.data?.owner_user_id) {
    throw new Error(
      exportLookup.error?.message ??
        'The export owner could not be resolved.',
    )
  }

  const ownerUserId = String(exportLookup.data.owner_user_id)

  const processingUpdate = await supabase
    .from('export_jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', input.exportId)
    .eq('organization_id', input.organizationId)

  if (processingUpdate.error) {
    throw new Error(
      `Unable to start export: ${processingUpdate.error.message}`,
    )
  }

  const [{ data, error }, lookups] = await Promise.all([
    supabase
      .from(resourceSpec.table)
      .select(resourceSpec.select)
      .eq('organization_id', input.organizationId)
      .limit(50000),
    loadLookups(supabase, input.organizationId),
  ])

  if (error) {
    throw new Error(`Unable to read export data: ${error.message}`)
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[]
  const prepared: PreparedExport = {
    title: EXPORT_RESOURCE_LABELS[input.resource],
    columns: resourceSpec.columns,
    rows,
    lookups,
  }

  const extension = input.format === 'excel' ? 'xls' : input.format
  const mimeType =
    input.format === 'csv'
      ? 'text/csv'
      : input.format === 'excel'
        ? 'application/vnd.ms-excel'
        : 'application/pdf'

  const bytes =
    input.format === 'csv'
      ? csv(prepared)
      : input.format === 'excel'
        ? excel(prepared)
        : pdf(prepared)

  const storagePath = `${ownerUserId}/${input.organizationId}/${input.exportId}.${extension}`
  const upload = await supabase.storage
    .from('exports')
    .upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: true,
    })

  if (upload.error) {
    throw new Error(`Unable to store export: ${upload.error.message}`)
  }

  const completed = new Date()
  const { error: updateError } = await supabase
    .from('export_jobs')
    .update({
      status: 'completed',
      storage_bucket: 'exports',
      storage_path: storagePath,
      file_name: `${input.resource}-${completed.toISOString().slice(0, 10)}.${extension}`,
      mime_type: mimeType,
      row_count: rows.length,
      file_size_bytes: bytes.length,
      completed_at: completed.toISOString(),
      expires_at: new Date(
        completed.getTime() + 30 * 86_400_000,
      ).toISOString(),
    })
    .eq('id', input.exportId)
    .eq('organization_id', input.organizationId)

  if (updateError) {
    throw new Error(`Unable to finalize export: ${updateError.message}`)
  }

  return {
    exportId: input.exportId,
    rowCount: rows.length,
    fileSizeBytes: bytes.length,
  }
}
