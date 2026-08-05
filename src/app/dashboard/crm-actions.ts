'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireOrganization, requirePermission } from '@/lib/auth'
import { assertEntitlement } from '@/lib/entitlements'
import type { Permission } from '@/lib/permissions'
import { resolveOwnerAssignment } from '@/lib/ownership'
import { createClient } from '@/lib/supabase/server'
import { enqueueJob } from '@/lib/jobs/queue'

const text = (formData: FormData, key: string) => formData.get(key)?.toString().trim() ?? ''
const optional = (value: string) => value || null

async function context(permission?: Permission) {
  const membership = permission
    ? await requirePermission(permission)
    : await requireOrganization()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Authentication required.')
  return { membership, supabase, user }
}

export async function createCompany(formData: FormData) {
  const { membership, supabase, user } = await context('companies.create')
  const name = text(formData, 'name')
  if (!name) throw new Error('Company name is required.')
  const owner = await resolveOwnerAssignment(
    membership,
    text(formData, 'owner_membership_id'),
  )
  const { data, error } = await supabase.from('companies').insert({
    organization_id: membership.organization_id,
    name,
    legal_name: optional(text(formData, 'legal_name')),
    company_type: text(formData, 'company_type') || 'prospect',
    employee_count: text(formData, 'employee_count') ? Number(text(formData, 'employee_count')) : null,
    annual_revenue: text(formData, 'annual_revenue') ? Number(text(formData, 'annual_revenue')) : null,
    currency_code: text(formData, 'currency_code') || 'USD',
    linkedin_url: optional(text(formData, 'linkedin_url')),
    timezone: optional(text(formData, 'timezone')),
    locale: optional(text(formData, 'locale')),
    founded_year: text(formData, 'founded_year') ? Number(text(formData, 'founded_year')) : null,
    parent_company_id: optional(text(formData, 'parent_company_id')),
    domain: optional(text(formData, 'domain')),
    industry: optional(text(formData, 'industry')),
    phone: optional(text(formData, 'phone')),
    email: optional(text(formData, 'email')),
    website: optional(text(formData, 'website')),
    address: optional(text(formData, 'address')),
    city: optional(text(formData, 'city')),
    country: optional(text(formData, 'country')),
    status: text(formData, 'status') || 'active',
    description: optional(text(formData, 'description')),
    owner_id: owner.ownerUserId,
    owner_membership_id: owner.ownerMembershipId,
    created_by: user.id,
  }).select('id').single()
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/companies')
  redirect(`/dashboard/companies/${data.id}`)
}

export async function updateCompany(formData: FormData) {
  const { membership, supabase } = await context('companies.update')
  const companyId = text(formData, 'id')
  const name = text(formData, 'name')

  if (!companyId) throw new Error('Company ID is required.')
  if (!name) throw new Error('Company name is required.')

  const owner = await resolveOwnerAssignment(
    membership,
    text(formData, 'owner_membership_id'),
  )

  const { data: existingCompany, error: loadError } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  if (loadError) {
    throw new Error(`Failed to load company: ${loadError.message}`)
  }

  if (!existingCompany) {
    throw new Error('Company not found.')
  }

  const { error } = await supabase
    .from('companies')
    .update({
      name,
      legal_name: optional(text(formData, 'legal_name')),
      company_type: text(formData, 'company_type') || 'prospect',
      employee_count: text(formData, 'employee_count') ? Number(text(formData, 'employee_count')) : null,
      annual_revenue: text(formData, 'annual_revenue') ? Number(text(formData, 'annual_revenue')) : null,
      currency_code: text(formData, 'currency_code') || 'USD',
      linkedin_url: optional(text(formData, 'linkedin_url')),
      timezone: optional(text(formData, 'timezone')),
      locale: optional(text(formData, 'locale')),
      founded_year: text(formData, 'founded_year') ? Number(text(formData, 'founded_year')) : null,
      parent_company_id: optional(text(formData, 'parent_company_id')),
      domain: optional(text(formData, 'domain')),
      industry: optional(text(formData, 'industry')),
      phone: optional(text(formData, 'phone')),
      email: optional(text(formData, 'email')),
      website: optional(text(formData, 'website')),
      address: optional(text(formData, 'address')),
      city: optional(text(formData, 'city')),
      country: optional(text(formData, 'country')),
      status: text(formData, 'status') || 'active',
      description: optional(text(formData, 'description')),
      owner_id: owner.ownerUserId,
      owner_membership_id: owner.ownerMembershipId,
    })
    .eq('id', companyId)
    .eq('organization_id', membership.organization_id)

  if (error) {
    throw new Error(`Failed to update company: ${error.message}`)
  }

  revalidatePath('/dashboard/companies')
  revalidatePath(`/dashboard/companies/${companyId}`)
  revalidatePath(`/dashboard/companies/${companyId}/edit`)
  redirect(`/dashboard/companies/${companyId}`)
}

export async function deleteCompany(formData: FormData) {
  const { membership, supabase } = await context('companies.delete')
  const companyId = text(formData, 'id')

  if (!companyId) throw new Error('Company ID is required.')

  const { data: existingCompany, error: loadError } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  if (loadError) {
    throw new Error(`Failed to load company: ${loadError.message}`)
  }

  if (!existingCompany) {
    throw new Error('Company not found.')
  }

  const { data: attachments, error: attachmentLoadError } = await supabase
    .from('attachments')
    .select('storage_path')
    .eq('organization_id', membership.organization_id)
    .eq('entity_type', 'company')
    .eq('entity_id', companyId)

  if (attachmentLoadError) {
    throw new Error(
      `Failed to load company attachments: ${attachmentLoadError.message}`,
    )
  }

  const { error: contactsError } = await supabase
    .from('contacts')
    .update({ company_id: null })
    .eq('organization_id', membership.organization_id)
    .eq('company_id', companyId)

  if (contactsError) {
    throw new Error(`Failed to unlink company contacts: ${contactsError.message}`)
  }

  const { error: opportunitiesError } = await supabase
    .from('opportunities')
    .update({ company_id: null })
    .eq('organization_id', membership.organization_id)
    .eq('company_id', companyId)

  if (opportunitiesError) {
    throw new Error(
      `Failed to unlink company opportunities: ${opportunitiesError.message}`,
    )
  }

  const { error: commentsError } = await supabase
    .from('internal_comments')
    .delete()
    .eq('organization_id', membership.organization_id)
    .eq('entity_type', 'company')
    .eq('entity_id', companyId)

  if (commentsError) {
    throw new Error(`Failed to delete company comments: ${commentsError.message}`)
  }

  const { error: attachmentsError } = await supabase
    .from('attachments')
    .delete()
    .eq('organization_id', membership.organization_id)
    .eq('entity_type', 'company')
    .eq('entity_id', companyId)

  if (attachmentsError) {
    throw new Error(
      `Failed to delete company attachment records: ${attachmentsError.message}`,
    )
  }

  const storagePaths =
    attachments
      ?.map((attachment) => attachment.storage_path)
      .filter((path): path is string => Boolean(path)) ?? []

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from('crm-attachments')
      .remove(storagePaths)

    if (storageError) {
      throw new Error(
        `Failed to delete company attachment files: ${storageError.message}`,
      )
    }
  }

  const { error } = await supabase
    .from('companies')
    .delete()
    .eq('id', companyId)
    .eq('organization_id', membership.organization_id)

  if (error) {
    throw new Error(`Failed to delete company: ${error.message}`)
  }

  revalidatePath('/dashboard/companies')
  redirect('/dashboard/companies')
}

export async function createPipeline(formData: FormData) {
  const { membership, supabase, user } = await context()
  const name = text(formData, 'name')
  if (!name) throw new Error('Pipeline name is required.')
  const { data: pipeline, error } = await supabase.from('pipelines').insert({
    organization_id: membership.organization_id,
    name,
    description: optional(text(formData, 'description')),
    pipeline_type: text(formData, 'pipeline_type') || 'sales',
    currency_code: (text(formData, 'currency_code') || 'USD').toUpperCase(),
    stale_after_days: text(formData, 'stale_after_days') ? Number(text(formData, 'stale_after_days')) : null,
    created_by: user.id,
  }).select('id').single()
  if (error) throw new Error(error.message)
  const stages = [
    { name: 'New', probability: 10, stage_type: 'open', color: '#2563eb' },
    { name: 'Qualified', probability: 25, stage_type: 'open', color: '#0891b2' },
    { name: 'Proposal', probability: 50, stage_type: 'open', color: '#7c3aed' },
    { name: 'Negotiation', probability: 75, stage_type: 'open', color: '#d97706' },
    { name: 'Won', probability: 100, stage_type: 'won', color: '#16a34a' },
    { name: 'Lost', probability: 0, stage_type: 'lost', color: '#dc2626' },
  ]
  const { error: stageError } = await supabase.from('pipeline_stages').insert(stages.map((stage, index) => ({
    organization_id: membership.organization_id,
    pipeline_id: pipeline.id,
    name: stage.name,
    position: index + 1,
    probability: stage.probability,
    stage_type: stage.stage_type,
    color: stage.color,
  })))
  if (stageError) throw new Error(stageError.message)
  revalidatePath('/dashboard/pipelines')
}

export async function updatePipeline(formData: FormData) {
  const { membership, supabase } = await context()
  const pipelineId = text(formData, 'id')
  const name = text(formData, 'name')

  if (!pipelineId) throw new Error('Pipeline ID is required.')
  if (!name) throw new Error('Pipeline name is required.')

  const { data: pipeline, error: loadError } = await supabase
    .from('pipelines')
    .select('id')
    .eq('id', pipelineId)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  if (loadError) {
    throw new Error(`Failed to load pipeline: ${loadError.message}`)
  }

  if (!pipeline) {
    throw new Error('Pipeline not found.')
  }

  const { error } = await supabase
    .from('pipelines')
    .update({
      name,
      description: optional(text(formData, 'description')),
      pipeline_type: text(formData, 'pipeline_type') || 'sales',
      status: text(formData, 'status') || 'active',
      currency_code: (text(formData, 'currency_code') || 'USD').toUpperCase(),
      default_probability_mode: text(formData, 'default_probability_mode') || 'stage',
      stage_aging_enabled: formData.get('stage_aging_enabled') === 'on',
      stale_after_days: text(formData, 'stale_after_days') ? Number(text(formData, 'stale_after_days')) : null,
    })
    .eq('id', pipelineId)
    .eq('organization_id', membership.organization_id)

  if (error) {
    throw new Error(`Failed to update pipeline: ${error.message}`)
  }

  revalidatePath('/dashboard/pipelines')
  revalidatePath(`/dashboard/pipelines/${pipelineId}`)
  revalidatePath(`/dashboard/pipelines/${pipelineId}/edit`)
  redirect(`/dashboard/pipelines/${pipelineId}`)
}


export async function upsertPipelineStage(formData: FormData) {
  const { membership, supabase } = await context('opportunities.update')
  const pipelineId = text(formData, 'pipeline_id')
  const stageId = text(formData, 'stage_id')
  const name = text(formData, 'name')
  if (!pipelineId || !name) throw new Error('Pipeline and stage name are required.')

  const payload = {
    organization_id: membership.organization_id,
    pipeline_id: pipelineId,
    name,
    description: optional(text(formData, 'description')),
    position: Number(text(formData, 'position') || 1),
    probability: Number(text(formData, 'probability') || 0),
    stage_type: text(formData, 'stage_type') || 'open',
    color: text(formData, 'color') || '#2563eb',
    target_days: text(formData, 'target_days') ? Number(text(formData, 'target_days')) : null,
    is_active: formData.get('is_active') === 'on',
  }
  const query = stageId
    ? supabase.from('pipeline_stages').update(payload).eq('id', stageId).eq('organization_id', membership.organization_id)
    : supabase.from('pipeline_stages').insert(payload)
  const { error } = await query
  if (error) throw new Error(error.message)
  revalidatePath(`/dashboard/pipelines/${pipelineId}`)
  revalidatePath(`/dashboard/pipelines/${pipelineId}/edit`)
}

export async function archivePipelineStage(formData: FormData) {
  const { membership, supabase } = await context('opportunities.update')
  const pipelineId = text(formData, 'pipeline_id')
  const stageId = text(formData, 'stage_id')
  if (!pipelineId || !stageId) throw new Error('Pipeline and stage are required.')
  const { count, error: countError } = await supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('organization_id', membership.organization_id).eq('stage_id', stageId)
  if (countError) throw new Error(countError.message)
  if ((count ?? 0) > 0) throw new Error('Move opportunities out of this stage before archiving it.')
  const { error } = await supabase.from('pipeline_stages').update({ is_active: false }).eq('id', stageId).eq('organization_id', membership.organization_id)
  if (error) throw new Error(error.message)
  revalidatePath(`/dashboard/pipelines/${pipelineId}`)
  revalidatePath(`/dashboard/pipelines/${pipelineId}/edit`)
}

export async function deletePipeline(formData: FormData) {
  const { membership, supabase } = await context()
  const pipelineId = text(formData, 'id')

  if (!pipelineId) throw new Error('Pipeline ID is required.')

  const { data: pipeline, error: loadError } = await supabase
    .from('pipelines')
    .select('id')
    .eq('id', pipelineId)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  if (loadError) {
    throw new Error(`Failed to load pipeline: ${loadError.message}`)
  }

  if (!pipeline) {
    throw new Error('Pipeline not found.')
  }

  const { error: opportunitiesError } = await supabase
    .from('opportunities')
    .delete()
    .eq('organization_id', membership.organization_id)
    .eq('pipeline_id', pipelineId)

  if (opportunitiesError) {
    throw new Error(
      `Failed to delete pipeline opportunities: ${opportunitiesError.message}`,
    )
  }

  const { error: stagesError } = await supabase
    .from('pipeline_stages')
    .delete()
    .eq('organization_id', membership.organization_id)
    .eq('pipeline_id', pipelineId)

  if (stagesError) {
    throw new Error(`Failed to delete pipeline stages: ${stagesError.message}`)
  }

  const { error } = await supabase
    .from('pipelines')
    .delete()
    .eq('id', pipelineId)
    .eq('organization_id', membership.organization_id)

  if (error) {
    throw new Error(`Failed to delete pipeline: ${error.message}`)
  }

  revalidatePath('/dashboard/pipelines')
  redirect('/dashboard/pipelines')
}

export async function createOpportunity(formData: FormData) {
  const { membership, supabase, user } = await context('opportunities.create')
  const name = text(formData, 'name')
  if (!name) throw new Error('Opportunity name is required.')
  const pipelineId = text(formData, 'pipeline_id')
  let stageId = text(formData, 'stage_id')
  if (!stageId && pipelineId) {
    const { data } = await supabase.from('pipeline_stages').select('id').eq('pipeline_id', pipelineId).order('position').limit(1).maybeSingle()
    stageId = data?.id ?? ''
  }
  if (!pipelineId || !stageId) throw new Error('A pipeline and stage are required.')
  const owner = await resolveOwnerAssignment(
    membership,
    text(formData, 'owner_membership_id'),
  )
  const { error } = await supabase.from('opportunities').insert({
    organization_id: membership.organization_id,
    pipeline_id: pipelineId,
    stage_id: stageId,
    company_id: optional(text(formData, 'company_id')),
    contact_id: optional(text(formData, 'contact_id')),
    name,
    value: Number(text(formData, 'value') || '0'),
    currency: text(formData, 'currency') || 'USD',
    probability: Number(text(formData, 'probability') || '0'),
    expected_close_date: optional(text(formData, 'expected_close_date')),
    opportunity_type: text(formData, 'opportunity_type') || 'new_business',
    source: optional(text(formData, 'source')),
    forecast_category: text(formData, 'forecast_category') || 'pipeline',
    amount_type: text(formData, 'amount_type') || 'one_time',
    recurring_amount: text(formData, 'recurring_amount') ? Number(text(formData, 'recurring_amount')) : null,
    recurring_interval: optional(text(formData, 'recurring_interval')),
    next_step: optional(text(formData, 'next_step')),
    next_step_due_at: optional(text(formData, 'next_step_due_at')),
    loss_reason: optional(text(formData, 'loss_reason')),
    competitor_names: text(formData, 'competitor_names').split(',').map(value => value.trim()).filter(Boolean),
    status: text(formData, 'status') || 'open',
    description: optional(text(formData, 'description')),
    owner_id: owner.ownerUserId,
    owner_membership_id: owner.ownerMembershipId,
    created_by: user.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/pipelines')
}

export async function updateOpportunity(formData: FormData) {
  const { membership, supabase } = await context('opportunities.update')
  const opportunityId = text(formData, 'id')
  const pipelineId = text(formData, 'pipeline_id')
  const stageId = text(formData, 'stage_id')
  const name = text(formData, 'name')

  if (!opportunityId) throw new Error('Opportunity ID is required.')
  if (!pipelineId) throw new Error('Pipeline ID is required.')
  if (!stageId) throw new Error('Stage is required.')
  if (!name) throw new Error('Opportunity name is required.')

  const owner = await resolveOwnerAssignment(
    membership,
    text(formData, 'owner_membership_id'),
  )

  const { data: opportunity, error: opportunityError } = await supabase
    .from('opportunities')
    .select('id')
    .eq('id', opportunityId)
    .eq('organization_id', membership.organization_id)
    .eq('pipeline_id', pipelineId)
    .maybeSingle()

  if (opportunityError) {
    throw new Error(`Failed to load opportunity: ${opportunityError.message}`)
  }

  if (!opportunity) {
    throw new Error('Opportunity not found.')
  }

  const { data: stage, error: stageError } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('id', stageId)
    .eq('pipeline_id', pipelineId)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  if (stageError) {
    throw new Error(`Failed to load pipeline stage: ${stageError.message}`)
  }

  if (!stage) {
    throw new Error('The selected stage does not belong to this pipeline.')
  }

  const value = Number(text(formData, 'value') || '0')
  const probability = Number(text(formData, 'probability') || '0')

  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Opportunity value must be zero or greater.')
  }

  if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
    throw new Error('Probability must be between 0 and 100.')
  }

  const { error } = await supabase
    .from('opportunities')
    .update({
      name,
      stage_id: stageId,
      company_id: optional(text(formData, 'company_id')),
      contact_id: optional(text(formData, 'contact_id')),
      value,
      currency: text(formData, 'currency') || 'USD',
      probability,
      expected_close_date: optional(text(formData, 'expected_close_date')),
      opportunity_type: text(formData, 'opportunity_type') || 'new_business',
      source: optional(text(formData, 'source')),
      forecast_category: text(formData, 'forecast_category') || 'pipeline',
      amount_type: text(formData, 'amount_type') || 'one_time',
      recurring_amount: text(formData, 'recurring_amount') ? Number(text(formData, 'recurring_amount')) : null,
      recurring_interval: optional(text(formData, 'recurring_interval')),
      next_step: optional(text(formData, 'next_step')),
      next_step_due_at: optional(text(formData, 'next_step_due_at')),
      loss_reason: optional(text(formData, 'loss_reason')),
      competitor_names: text(formData, 'competitor_names').split(',').map(value => value.trim()).filter(Boolean),
      status: text(formData, 'status') || 'open',
      description: optional(text(formData, 'description')),
      owner_id: owner.ownerUserId,
      owner_membership_id: owner.ownerMembershipId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', opportunityId)
    .eq('organization_id', membership.organization_id)
    .eq('pipeline_id', pipelineId)

  if (error) {
    throw new Error(`Failed to update opportunity: ${error.message}`)
  }

  revalidatePath('/dashboard/pipelines')
  revalidatePath(`/dashboard/pipelines/${pipelineId}`)
  revalidatePath(
    `/dashboard/pipelines/${pipelineId}/opportunities/${opportunityId}/edit`,
  )
  redirect(`/dashboard/pipelines/${pipelineId}`)
}

export async function moveOpportunityStage(formData: FormData) {
  const { membership, supabase } = await context('opportunities.update')
  const opportunityId = text(formData, 'id')
  const pipelineId = text(formData, 'pipeline_id')
  const stageId = text(formData, 'stage_id')

  if (!opportunityId || !pipelineId || !stageId) {
    throw new Error('Opportunity, pipeline, and stage are required.')
  }

  const { data: stage, error: stageError } = await supabase
    .from('pipeline_stages')
    .select('id,probability')
    .eq('id', stageId)
    .eq('pipeline_id', pipelineId)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  if (stageError) {
    throw new Error(`Failed to load pipeline stage: ${stageError.message}`)
  }

  if (!stage) {
    throw new Error('The selected stage does not belong to this pipeline.')
  }

  const { error } = await supabase
    .from('opportunities')
    .update({
      stage_id: stageId,
      probability: Number(stage.probability || 0),
      updated_at: new Date().toISOString(),
    })
    .eq('id', opportunityId)
    .eq('pipeline_id', pipelineId)
    .eq('organization_id', membership.organization_id)

  if (error) {
    throw new Error(`Failed to move opportunity: ${error.message}`)
  }

  revalidatePath('/dashboard/pipelines')
  revalidatePath(`/dashboard/pipelines/${pipelineId}`)
}

export async function deleteOpportunity(formData: FormData) {
  const { membership, supabase } = await context('opportunities.delete')
  const opportunityId = text(formData, 'id')
  const pipelineId = text(formData, 'pipeline_id')

  if (!opportunityId) throw new Error('Opportunity ID is required.')
  if (!pipelineId) throw new Error('Pipeline ID is required.')

  const { error } = await supabase
    .from('opportunities')
    .delete()
    .eq('id', opportunityId)
    .eq('pipeline_id', pipelineId)
    .eq('organization_id', membership.organization_id)

  if (error) {
    throw new Error(`Failed to delete opportunity: ${error.message}`)
  }

  revalidatePath('/dashboard/pipelines')
  revalidatePath(`/dashboard/pipelines/${pipelineId}`)
  redirect(`/dashboard/pipelines/${pipelineId}`)
}

export async function createTag(formData: FormData) {
  const { membership, supabase } = await context()
  const name = text(formData, 'name')
  if (!name) throw new Error('Tag name is required.')
  const { error } = await supabase.from('tags').insert({ organization_id: membership.organization_id, name, color: text(formData, 'color') || '#2563eb' })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/tags')
}

export async function createTemplate(formData: FormData) {
  const { membership, supabase, user } = await context()
  const { error } = await supabase.from('message_templates').insert({
    organization_id: membership.organization_id,
    name: text(formData, 'name'),
    channel: text(formData, 'channel') || 'email',
    subject: optional(text(formData, 'subject')),
    body: text(formData, 'body'),
    created_by: user.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/templates')
}

export async function createSnippet(formData: FormData) {
  const { membership, supabase, user } = await context()
  const { error } = await supabase.from('snippets').insert({
    organization_id: membership.organization_id,
    name: text(formData, 'name'),
    shortcut: text(formData, 'shortcut'),
    content: text(formData, 'content'),
    created_by: user.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/snippets')
}

export async function createSequence(formData: FormData) {
  await assertEntitlement('automation.sequences')
  const { membership, supabase, user } = await context()
  const { data, error } = await supabase.from('sequences').insert({
    organization_id: membership.organization_id,
    name: text(formData, 'name'),
    description: optional(text(formData, 'description')),
    status: 'draft',
    created_by: user.id,
  }).select('id').single()
  if (error) throw new Error(error.message)
  const { error: stepError } = await supabase.from('sequence_steps').insert({
    organization_id: membership.organization_id,
    sequence_id: data.id,
    position: 1,
    channel: text(formData, 'channel') || 'email',
    delay_days: 0,
    subject: optional(text(formData, 'subject')),
    body: text(formData, 'body'),
  })
  if (stepError) throw new Error(stepError.message)
  revalidatePath('/dashboard/sequences')
}

export async function sendCommunication(formData: FormData) {
  const { membership, supabase, user } = await context()
  const channel = text(formData, 'channel') as 'email' | 'sms'
  const recipient = text(formData, 'recipient')
  const subject = text(formData, 'subject')
  const body = text(formData, 'body')

  if (channel !== 'email' && channel !== 'sms') {
    throw new Error('Choose a valid communication channel.')
  }
  if (!recipient || !body) {
    throw new Error('Recipient and message are required.')
  }
  if (channel === 'sms' && !/^\+[1-9]\d{7,14}$/.test(recipient)) {
    throw new Error('SMS recipients must use E.164 format, for example +15551234567.')
  }

  const { data: message, error } = await supabase
    .from('communication_messages')
    .insert({
      organization_id: membership.organization_id,
      channel,
      direction: 'outbound',
      recipient,
      subject: optional(subject),
      body,
      status: 'queued',
      source: 'manual',
      sent_by: user.id,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Unable to queue communication: ${error.message}`)
  }

  try {
    const job = await enqueueJob({
      organizationId: membership.organization_id,
      queue: 'communications',
      jobType: 'communications.send',
      payload: { messageId: message.id },
      priority: 70,
      maxAttempts: 6,
      idempotencyKey: `communication:${message.id}`,
    })

    const { error: linkError } = await supabase
      .from('communication_messages')
      .update({ background_job_id: job.id })
      .eq('id', message.id)
      .eq('organization_id', membership.organization_id)

    if (linkError) {
      throw new Error(`Unable to link communication job: ${linkError.message}`)
    }
  } catch (queueError) {
    await supabase
      .from('communication_messages')
      .update({
        status: 'failed',
        error_message:
          queueError instanceof Error
            ? queueError.message
            : 'Unable to create the delivery job.',
        last_error_code: 'QUEUE_CREATION_FAILED',
      })
      .eq('id', message.id)
      .eq('organization_id', membership.organization_id)
    throw queueError
  }

  revalidatePath('/dashboard/communications')
}

export async function createComment(formData: FormData) {
  const { membership, supabase, user } = await context()
  const entityType = text(formData, 'entity_type')
  const entityId = text(formData, 'entity_id')
  const body = text(formData, 'body')
  if (!entityType || !entityId || !body) throw new Error('Comment details are required.')
  const { data: comment, error } = await supabase.from('internal_comments').insert({
    organization_id: membership.organization_id,
    entity_type: entityType,
    entity_id: entityId,
    body,
    created_by: user.id,
  }).select('id').single()
  if (error) throw new Error(error.message)
  const mentioned = [...body.matchAll(/@\[([0-9a-f-]{36})\]/gi)].map(match => match[1])
  if (mentioned.length) {
    const { error: mentionError } = await supabase.from('comment_mentions').insert([...new Set(mentioned)].map(mentioned_user_id => ({
      organization_id: membership.organization_id,
      comment_id: comment.id,
      mentioned_user_id,
    })))
    if (mentionError) throw new Error(mentionError.message)
  }
  revalidatePath(`/dashboard/${entityType === 'company' ? 'companies' : 'pipelines'}/${entityId}`)
}

export async function uploadAttachment(formData: FormData) {
  const { membership, supabase, user } = await context()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose a file to upload.')
  if (file.size > 25 * 1024 * 1024) throw new Error('Maximum file size is 25 MB.')
  const entityType = text(formData, 'entity_type') || 'company'
  const entityId = text(formData, 'entity_id')
  if (!entityId) throw new Error('Attachment entity is required.')
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const path = `${membership.organization_id}/${entityType}/${entityId}/${crypto.randomUUID()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from('crm-attachments').upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) throw new Error(uploadError.message)
  const { error } = await supabase.from('attachments').insert({
    organization_id: membership.organization_id,
    entity_type: entityType,
    entity_id: entityId,
    file_name: file.name,
    storage_path: path,
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: user.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/files')
  revalidatePath(`/dashboard/companies/${entityId}`)
}