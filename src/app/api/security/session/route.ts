import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRequestIdentity } from '@/lib/security/platform'

export async function POST() {
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const identity=await getRequestIdentity(user.id)
  const {data:profile,error:profileError}=await supabase.from('profiles').select('organization_id').eq('id',user.id).maybeSingle()
  if(profileError)return NextResponse.json({error:'Unable to resolve session organization.'},{status:500})
  const now=new Date().toISOString()
  const {error:deviceError}=await supabase.from('user_devices').upsert({user_id:user.id,organization_id:profile?.organization_id??null,device_fingerprint:identity.fingerprint,device_name:identity.deviceName,device_type:'browser',platform:identity.platform,browser:identity.browser,first_ip:identity.ipAddress,last_ip:identity.ipAddress,last_seen_at:now},{onConflict:'user_id,device_fingerprint'})
  if(deviceError)return NextResponse.json({error:'Unable to record device.'},{status:500})
  const {error}=await supabase.from('user_sessions').upsert({user_id:user.id,organization_id:profile?.organization_id??null,session_fingerprint:identity.fingerprint,ip_address:identity.ipAddress,user_agent:identity.userAgent,device_name:identity.deviceName,last_seen_at:now,last_authenticated_at:now,expires_at:new Date(Date.now()+24*60*60*1000).toISOString(),metadata:{platform:identity.platform,browser:identity.browser}},{onConflict:'user_id,session_fingerprint'})
  if(error)return NextResponse.json({error:'Unable to record authenticated session.'},{status:500})
  return NextResponse.json({ok:true,fingerprint:identity.fingerprint})
}
