import { NextResponse } from 'next/server'
import { createExportSchedule, listExportSchedules } from '@/lib/exports'
export async function GET(){try{return NextResponse.json({schedules:await listExportSchedules()})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to load schedules.'},{status:500})}}
export async function POST(r:Request){try{return NextResponse.json({schedule:await createExportSchedule(await r.json())},{status:201})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to create schedule.'},{status:400})}}
