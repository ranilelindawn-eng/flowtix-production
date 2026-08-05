import { NextResponse } from 'next/server'
import { createDashboard, listDashboards } from '@/lib/dashboards'
export async function GET(){try{return NextResponse.json({dashboards:await listDashboards()})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to load dashboards'},{status:500})}}
export async function POST(request:Request){try{const body=await request.json();if(!body?.name||typeof body.name!=='string')return NextResponse.json({error:'name is required'},{status:400});return NextResponse.json({dashboard:await createDashboard(body)},{status:201})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to create dashboard'},{status:500})}}
