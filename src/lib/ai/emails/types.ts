export type AIEmailTone = 'professional' | 'friendly' | 'concise' | 'persuasive'
export type AIEmailStatus = 'generated' | 'approved' | 'dismissed'

export type GeneratedAIEmail = {
  subject: string
  body: string
  callToAction: string | null
  personalizationFacts: string[]
  complianceWarnings: string[]
}

export type PersistedAIEmail = {
  id: string
  organization_id: string
  contact_id: string | null
  call_id: string | null
  transcript_id: string | null
  recipient_name: string | null
  recipient_email: string | null
  purpose: string
  tone: AIEmailTone
  context: string | null
  subject: string
  body: string
  call_to_action: string | null
  personalization_facts: string[]
  compliance_warnings: string[]
  status: AIEmailStatus
  source_hash: string
  generation_key: string
  provider: string
  model: string | null
  prompt_key: string
  prompt_version: number
  provider_request_id: string | null
  input_tokens: number | null
  output_tokens: number | null
  latency_ms: number | null
  approved_at: string | null
  approved_by: string | null
  dismissed_at: string | null
  dismissed_by: string | null
  metadata: Record<string, unknown>
  created_at: string
  created_by: string | null
}
