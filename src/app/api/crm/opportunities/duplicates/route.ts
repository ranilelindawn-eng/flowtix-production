import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { findOpportunityDuplicates } from '@/lib/opportunity-advanced'
export async function GET(request:Request){ await requirePermission('opportunities.view'); const url=new URL(request.url); return NextResponse.json({duplicates:await findOpportunityDuplicates({opportunityId:url.searchParams.get('opportunityId')??undefined,name:url.searchParams.get('name')??undefined,companyId:url.searchParams.get('companyId')??undefined,contactId:url.searchParams.get('contactId')??undefined})}) }
