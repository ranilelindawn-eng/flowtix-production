import { NextResponse } from 'next/server'
import { createExport, listExports } from '@/lib/exports'
export async function GET(){try{return NextResponse.json({exports:await listExports()})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to load exports.'},{status:500})}}
export async function POST(r:Request){try{return NextResponse.json({export:await createExport(await r.json())},{status:202})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to create export.'},{status:400})}}
