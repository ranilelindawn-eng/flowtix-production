import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { findCompanyDuplicates } from '@/lib/company-advanced'
export async function GET(request:Request){ await requirePermission('companies.view'); const url=new URL(request.url); return NextResponse.json({duplicates:await findCompanyDuplicates({companyId:url.searchParams.get('companyId')??undefined,name:url.searchParams.get('name')??undefined,domain:url.searchParams.get('domain')??undefined})}) }
