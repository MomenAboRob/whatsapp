import { NextRequest, NextResponse } from 'next/server';
import { forwardToWhatsAppGroup } from '@/lib/whatsapp';
import { getWhatsAppManager } from '@/lib/whatsapp-client';

export async function POST(req: NextRequest) {
  try {
    const wa = getWhatsAppManager(req);
    const {
      targetGroup,
      message,
      mediaBase64,
      filename,
      sourceMessageId,
      linkedImageUrl,
      reuseReceiptMsgId,
      skipMediaSend,
    } = await req.json();

    if (!targetGroup) {
      return NextResponse.json({ error: 'يرجى تحديد المجموعة المستهدفة' }, { status: 400 });
    }

    // تحويل رسالة موجودة كما هي (مع صورة الوصل المشبوكة إن وجدت)
    if (sourceMessageId) {
      const result = await wa.forwardOriginalMessage(
        targetGroup,
        sourceMessageId,
        linkedImageUrl,
        reuseReceiptMsgId,
        skipMediaSend
      );
      return NextResponse.json(result);
    }

    const result = await forwardToWhatsAppGroup({
      targetGroupName: targetGroup,
      messageText: message || '',
      mediaBase64,
      mediaFilename: filename,
    }, wa);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('خطأ في توجيه الحوالة لواتساب:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
