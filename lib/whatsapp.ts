import { whatsappManager } from '@/lib/whatsapp-client';

export interface WhatsAppForwardRequest {
  targetGroupName: string;
  messageText: string;
  mediaBase64?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
}

/**
 * إرسال رسالة أو إيصال إلى محادثة أو مجموعة واتساب محددة عبر حساب واتساب المربوط الفعلي
 */
export async function forwardToWhatsAppGroup(
  request: WhatsAppForwardRequest,
  waInstance?: any
): Promise<{ success: boolean; message: string }> {
  try {
    const manager = waInstance || whatsappManager;
    // ملاحظة: المعامل الرابع في forwardMessage هو معرف الرسالة المقتبسة وليس اسم الملف
    const result = await manager.forwardMessage(
      request.targetGroupName,
      request.messageText,
      request.mediaBase64
    );
    return result;
  } catch (error: any) {
    console.error('خطأ أثناء إرسال الرسالة إلى واتساب:', error);
    return {
      success: false,
      message: `خطأ تقني أثناء إرسال الرسالة إلى واتساب: ${error.message}`,
    };
  }
}
