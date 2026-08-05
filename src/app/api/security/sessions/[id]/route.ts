import { NextRequest,NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export async function DELETE(_request:NextRequest,{params}:{params:Promise<{id:string}>}){const {id}=await params;const supabase=await createClient();const {data,error}=await supabase.rpc('revoke_user_session',{p_session_id:id,p_reason:'user_revoked'});if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({revoked:Boolean(data)})}
