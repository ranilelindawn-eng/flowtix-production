import { NextResponse } from 'next/server'
import { getExportDownload } from '@/lib/exports'
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;return NextResponse.redirect(await getExportDownload(id))}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to download export.'},{status:400})}}
