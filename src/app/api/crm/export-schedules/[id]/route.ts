import { NextResponse } from 'next/server'
import { deleteExportSchedule } from '@/lib/exports'
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;await deleteExportSchedule(id);return new NextResponse(null,{status:204})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to delete schedule.'},{status:400})}}
