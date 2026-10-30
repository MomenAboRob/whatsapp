import { NextRequest, NextResponse } from 'next/server';
import { localExtensionCors } from '@/lib/local-extension-cors';
import { getAuthUserFromRequest } from '@/lib/auth';

let pendingPortalData: any = null;

export function getPendingPortalData() {
  return pendingPortalData;
}

export function setPendingPortalData(data: any) {
  pendingPortalData = data;
}

// السماح لصفحة بوابة عقليات وسياق الإضافة والواجهة بقراءة البيانات
export async function POST(req: NextRequest) {
  if (!getAuthUserFromRequest(req)) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  try {
    const data = await req.json();
    pendingPortalData = data;
    return NextResponse.json({ success: true, data: pendingPortalData }, { headers: localExtensionCors(req, 'GET, POST, OPTIONS') });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500, headers: localExtensionCors(req, 'GET, POST, OPTIONS') });
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json(pendingPortalData || {}, { headers: localExtensionCors(req, 'GET, POST, OPTIONS') });
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 200, headers: localExtensionCors(req, 'GET, POST, OPTIONS') });
}
