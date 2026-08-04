export type Contact = {
  id: string
  organization_id: string
  first_name: string
  last_name: string
  company: string | null
  email: string
  phone: string | null
  title: string | null
  status: 'active' | 'inactive' | 'archived'
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
