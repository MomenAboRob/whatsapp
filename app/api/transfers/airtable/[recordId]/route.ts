import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth';
import { updateAirtableTransfer } from '@/lib/airtable';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ recordId: string }> },
) {
  if (!getAuthUserFromRequest(request)) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  try {
    const { recordId } = await params;
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields)) {
      return NextResponse.json({ success: false, error: 'بيانات التعديل غير صالحة' }, { status: 400 });
    }
    const record = await updateAirtableTransfer(recordId, body.fields);
    return NextResponse.json({ success: true, record });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر حفظ التعديل';
    const badRequest = /غير صالح|غير صالحة|غير قابل|مطلوب|لا توجد تغييرات/.test(message);
    return NextResponse.json({ success: false, error: message }, { status: badRequest ? 400 : 502 });
  }
}
