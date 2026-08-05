import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

export type CompanyFieldType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select'
export type CompanyFieldDefinition = { id:string; organization_id:string; field_key:string; label:string; field_type:CompanyFieldType; options:unknown[]; is_required:boolean; is_active:boolean; position:number }
export type CompanyDuplicate = { company_id:string; name:string; domain:string|null; match_reasons:string[] }

function normalizeFieldKey(value:string){ const key=value.trim().toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'').slice(0,64); if(!key) throw new Error('A field key is required.'); return key }
export async function listCompanyFieldDefinitions():Promise<CompanyFieldDefinition[]>{
 const organization=await getCurrentOrganization(); if(!organization) return []
 const supabase=await createClient(); const {data,error}=await supabase.from('company_field_definitions').select('id,organization_id,field_key,label,field_type,options,is_required,is_active,position').eq('organization_id',organization.organization_id).order('position').order('label')
 if(error) throw new Error(`Failed to load company fields: ${error.message}`)
 return (data??[]).map(row=>({...row,field_type:row.field_type as CompanyFieldType,options:Array.isArray(row.options)?row.options:[]}))
}
export async function upsertCompanyFieldDefinition(input:{id?:string;fieldKey:string;label:string;fieldType:CompanyFieldType;options?:unknown[];isRequired?:boolean;isActive?:boolean;position?:number}){
 const organization=await getCurrentOrganization(); if(!organization) throw new Error('Unable to determine the current organization.')
 const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) throw new Error('Authentication required.')
 const payload={organization_id:organization.organization_id,field_key:normalizeFieldKey(input.fieldKey),label:input.label.trim().slice(0,120),field_type:input.fieldType,options:input.options??[],is_required:input.isRequired??false,is_active:input.isActive??true,position:Math.max(0,Math.floor(input.position??0)),created_by:user.id,updated_at:new Date().toISOString()}
 if(!payload.label) throw new Error('A field label is required.')
 const result=input.id?await supabase.from('company_field_definitions').update(payload).eq('id',input.id).eq('organization_id',organization.organization_id).select('id,organization_id,field_key,label,field_type,options,is_required,is_active,position').single():await supabase.from('company_field_definitions').insert(payload).select('id,organization_id,field_key,label,field_type,options,is_required,is_active,position').single()
 if(result.error) throw new Error(`Failed to save company field: ${result.error.message}`)
 return {...result.data,field_type:result.data.field_type as CompanyFieldType,options:Array.isArray(result.data.options)?result.data.options:[]}
}
export async function findCompanyDuplicates(input:{companyId?:string;name?:string;domain?:string}):Promise<CompanyDuplicate[]>{
 const organization=await getCurrentOrganization(); if(!organization) return []
 const supabase=await createClient(); const {data,error}=await supabase.rpc('find_company_duplicates',{p_organization_id:organization.organization_id,p_company_id:input.companyId??null,p_name:input.name??null,p_domain:input.domain??null})
 if(error) throw new Error(`Failed to find company duplicates: ${error.message}`)
 return (data??[]) as CompanyDuplicate[]
}
