import { NextResponse } from 'next/server'
import { deleteDashboard, updateDashboard } from '@/lib/dashboards'
type Context={params:Promise<{id:string}>}
export async function PATCH(request:Request,{params}:Context){try{const {id}=await params;return NextResponse.json({dashboard:await updateDashboard(id,await request.json())})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to update dashboard'},{status:500})}}
export async function DELETE(_:Request,{params}:Context){try{const {id}=await params;await deleteDashboard(id);return new NextResponse(null,{status:204})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to delete dashboard'},{status:500})}}
