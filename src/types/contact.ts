export type ContactLifecycleStage =
  | 'lead'
  | 'marketing_qualified'
  | 'sales_qualified'
  | 'opportunity'
  | 'customer'
  | 'evangelist'
  | 'inactive'

export type Contact = {
  id: string
  organization_id: string
  first_name: string
  last_name: string
  preferred_name: string | null
  company: string | null
  company_id: string | null
  email: string
  phone: string | null
  title: string | null
  status: 'active' | 'inactive' | 'archived'
  lifecycle_stage: ContactLifecycleStage
  source: string
  lead_score: number
  timezone: string | null
  locale: string | null
  do_not_email: boolean
  do_not_sms: boolean
  do_not_call: boolean
  last_contacted_at: string | null
  next_follow_up_at: string | null
  custom_fields: Record<string, unknown>
  merged_into_contact_id: string | null
  owner_membership_id: string | null
  owner_user_id: string | null
  owner_name: string | null
  metadata: {
    mobile?: string
    tags?: string[]
    owner_id?: string
    owner_name?: string
    notes?: string
  }
  created_by: string
  created_at: string
  updated_at: string
}

export type ContactProfile = {
  id: string
  user_id: string
  full_name: string
}

export type ContactDuplicate = {
  contact_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  match_reasons: string[]
}
