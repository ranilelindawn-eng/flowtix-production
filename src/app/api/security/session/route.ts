import { createHash } from 'crypto'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export async function POST(){
 const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
 const h=await headers(); const ua=h.get('user-agent')??'Unknown browser'; const ip=h.get('x-forwarded-for')?.split(',')[0]?.trim()??null; const fingerprint=createHash('sha256').update(`${user.id}:${ua}:${ip??''}`).digest('hex')
 const {data:profile}=await supabase.from('profiles').select('organization_id').eq('id',user.id).maybeSingle()
 const deviceName=/mobile/i.test(ua)?'Mobile device':/windows/i.test(ua)?'Windows device':/mac/i.test(ua)?'Mac device':'Web browser'
 const {error}=await supabase.from('user_sessions').upsert({user_id:user.id,organization_id:profile?.organization_id??null,session_fingerprint:fingerprint,ip_address:ip,user_agent:ua,device_name:deviceName,last_seen_at:new Date().toISOString()},{onConflict:'user_id,session_fingerprint'})
 return NextResponse.json(error?{error:error.message}:{ok:true},{status:error?500:200})
}
