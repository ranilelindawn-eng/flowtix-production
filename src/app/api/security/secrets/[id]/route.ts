import { NextRequest,NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
export async function DELETE(_request:NextRequest,{params}:{params:Promise<{id:string}>}){const membership=await requireOwner();const {id}=await params;const supabase=await createClient();const {error}=await supabase.rpc('revoke_organization_secret',{p_organization_id:membership.organization_id,p_secret_id:id});if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({ok:true})}
