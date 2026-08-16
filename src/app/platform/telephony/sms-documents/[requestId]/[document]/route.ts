import { NextResponse } from 'next/server'
import { getPlatformSmsSenderDocument } from '@/lib/platform/sms-provisioning'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'
const BUCKET='sms-provisioning-documents'
export async function GET(_request:Request,{params}:{params:Promise<{requestId:string;document:string}>}){const{requestId,document}=await params;if(document!=='loa'&&document!=='invoice')return NextResponse.json({error:'Unknown provisioning document.'},{status:404});const file=await getPlatformSmsSenderDocument({requestId,document});if(!file)return NextResponse.json({error:'Document not found.'},{status:404});const admin=createTelephonyAdminClient();const{data,error}=await admin.storage.from(BUCKET).createSignedUrl(file.path,60,{download:file.fileName});if(error||!data?.signedUrl)return NextResponse.json({error:'Unable to create a secure document link.'},{status:500});return NextResponse.redirect(data.signedUrl)}
