import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
export async function POST(){const membership=await requireAdmin();const supabase=await createClient();const {data,error}=await supabase.rpc('capture_security_monitoring_snapshot',{p_organization_id:membership.organization_id});if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({snapshotId:data},{status:201})}
