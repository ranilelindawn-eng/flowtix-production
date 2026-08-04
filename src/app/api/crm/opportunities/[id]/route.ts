import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'

export async function POST(request: Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params; const membership=await requirePermission('opportunities.update'); const form=await request.formData(); const stageId=form.get('stage_id')?.toString()
 if(!stageId) return NextResponse.json({error:'Stage is required.'},{status:400})
 const supabase=await createClient(); const {data:stage}=await supabase.from('pipeline_stages').select('probability').eq('organization_id',membership.organization_id).eq('id',stageId).maybeSingle()
 if(!stage) return NextResponse.json({error:'Stage not found.'},{status:404})
 const {error}=await supabase.from('opportunities').update({stage_id:stageId,probability:stage.probability,updated_at:new Date().toISOString()}).eq('organization_id',membership.organization_id).eq('id',id)
 if(error) return NextResponse.json({error:error.message},{status:400})
 return NextResponse.redirect(new URL('/dashboard/pipelines',request.url),303)
}
