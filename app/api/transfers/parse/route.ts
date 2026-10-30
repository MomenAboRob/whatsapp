import { NextRequest, NextResponse } from 'next/server';
import { parseTransferText } from '@/lib/parser';
import { checkAirtableDuplicate } from '@/lib/airtable';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'يرجى إرسال نص الحوالة' }, { status: 400 });
    }

    const parsed = parseTransferText(text);

    // فحص التكرار في أيرتيبل (حصراً باسم المشترك أو البريد الإلكتروني - تكرار رقم الحوالة مسموح تماماً)
    let isDuplicate = false;
    let duplicateMessage = '';

    if (parsed.participantName || parsed.email) {
      const duplicateCheck = await checkAirtableDuplicate(undefined, parsed.participantName, parsed.email);
      if (duplicateCheck.isDuplicate) {
        isDuplicate = true;
        duplicateMessage = `تحذير: المشترك مسجل مسبقاً في أيرتيبل بناءً على مطابقة (${duplicateCheck.matchedBy}).`;
      }
    }

    return NextResponse.json({
      success: true,
      data: parsed,
      duplicateCheck: {
        isDuplicate,
        message: duplicateMessage,
      },
    });
  } catch (error: any) {
    console.error('خطأ في تحليل نص الحوالة:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
