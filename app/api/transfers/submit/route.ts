import { NextRequest, NextResponse } from 'next/server';
import { createAirtableRecord, invalidateAirtableOverview } from '@/lib/airtable';
import { submitToAqleeatPortal } from '@/lib/portal';
import { forwardToWhatsAppGroup } from '@/lib/whatsapp';
import { normalizeDateToISO } from '@/lib/date-utils';
import { getCurrentBatchNumber } from '@/lib/current-batch';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      participantName,
      senderName,
      email,
      phone,
      gender,
      payerCountry,
      residenceCountry,
      amount,
      currency,
      transferNumber,
      paymentDate,
      bankName,
      notes,
      isAishaHandDelivery,
      paymentMethod,
      receiptUrl,
      dataCardUrl,
      linkedReceiptUrl,
      additionalReceiptUrls,
      saveToAirtable = true,
      submitToPortal = true,
      forwardToWhatsApp = true,
    } = body;

    const results: {
      portal?: any;
      airtable?: any;
      whatsapp?: any;
    } = {};

    // تحديد صورة الوصل الأساسية (إما الوصل المرتبط أو الصورة المرفوعة)
    const effectiveReceiptUrl = linkedReceiptUrl || receiptUrl;
    // تحديد صورة بطاقة البيانات المشبوكة
    const effectiveDataCardUrl = dataCardUrl || (linkedReceiptUrl && receiptUrl && linkedReceiptUrl !== receiptUrl ? receiptUrl : undefined);
    // توحيد صيغة التاريخ لضمان التوافق التام مع أيرتيبل (YYYY-MM-DD)
    const effectivePaymentDate = normalizeDateToISO(paymentDate);

    // التأكد من أن اسم المرسل ليس رقم هاتف أو مجرد أرقام
    const isSenderPhone =
      !senderName ||
      /^\+?\d[\d\s\-\(\)]+$/.test(String(senderName).trim()) ||
      String(senderName).replace(/\D/g, '').length >= 5;

    const effectiveSenderName = isSenderPhone
      ? participantName
      : (senderName || participantName);

    // تحديد اسم ملف الإيصال الفعلي مع امتداده الصحيح (PDF أو JPG)
    const isPdfReceipt =
      Boolean(body.receiptFilename?.toLowerCase().endsWith('.pdf')) ||
      Boolean(effectiveReceiptUrl?.toLowerCase().includes('.pdf'));
    const autoExt = isPdfReceipt ? '.pdf' : '.jpg';
    const resolvedReceiptFilename =
      body.receiptFilename ||
      (effectiveReceiptUrl && !effectiveReceiptUrl.startsWith('data:') ? effectiveReceiptUrl.split('/').pop()?.split('?')[0] : undefined) ||
      `${(participantName || 'receipt').replace(/\s+/g, '_')}${autoExt}`;

    // 1. التسجيل في بوابة عقليات (تأخذ صورة الوصل الأصلية الإلزامية)
    if (submitToPortal) {
      const isHandDelivery = paymentMethod === 'استلام باليد' || Boolean(isAishaHandDelivery);
      const effectivePaymentMethod = isHandDelivery ? 'استلام باليد' : (paymentMethod || 'تحويل مصرفي');
      const effectiveTransferNumber = isHandDelivery ? '' : (transferNumber || '');
      const effectiveBankName = isHandDelivery ? '' : (bankName || '');

      const coordinatorVal = (notes?.match(/اسم\s*المنسق\s*:\s*([^\n\r-]+)/i)?.[1]?.trim()) || '';
      const ageVal = (notes?.match(/العمر\s*:\s*([^\n\r-]+)/i)?.[1]?.trim()) || '';
      const notesParts: string[] = [];
      if (coordinatorVal) notesParts.push(`اسم المنسق: ${coordinatorVal}`);
      if (ageVal) notesParts.push(`العمر: ${ageVal}`);
      const effectiveNotes = notesParts.length > 0 ? notesParts.join(' - ') : (notes || '');

      const portalResult = await submitToAqleeatPortal({
        participantName,
        email,
        phone,
        gender,
        payerCountry: payerCountry || 'فلسطين',
        residenceCountry: residenceCountry || 'فلسطين',
        paymentMethod: effectivePaymentMethod,
        senderName: effectiveSenderName,
        transactionNumber: effectiveTransferNumber,
        paymentDate: effectivePaymentDate,
        bankName: effectiveBankName,
        amountLocal: amount || (isHandDelivery ? 100 : 85),
        currency: currency || (isHandDelivery ? 'USD' : 'JOD'),
        notes: effectiveNotes,
        receiptFileBase64: effectiveReceiptUrl || body.receiptFileBase64,
        receiptFilename: resolvedReceiptFilename,
      });

      results.portal = portalResult;
    }

    // 2. الحفظ في أيرتيبل (تأخذ صورة الوصل الحقيقية + صورة بطاقة البيانات المشبوكة معاً)
    if (saveToAirtable) {
      const airtableResult = await createAirtableRecord({
        senderName: effectiveSenderName,
        participantName,
        date: effectivePaymentDate,
        originalAmount: Number(amount) || 85,
        depositedAmount: Number(amount) || 85,
        email,
        country: payerCountry || 'فلسطين',
        status: 'تم التاكيد',
        transferNumber: transferNumber || '',
        walletMethod: isAishaHandDelivery ? 'استلام باليد' : 'كاش (يدوي)',
        batch: getCurrentBatchNumber(),
        notes,
        isAishaHandDelivery: Boolean(isAishaHandDelivery),
        receiptUrl: effectiveReceiptUrl,
        receiptFilename: resolvedReceiptFilename,
        dataCardUrl: effectiveDataCardUrl,
        additionalReceiptUrls,
      });

      results.airtable = airtableResult;
      // تحديث قائمة الحوالات فوراً في الواجهة بدل انتظار انتهاء التخزين المؤقت
      invalidateAirtableOverview();
    }

    // 3. إعادة التوجيه إلى واتساب (مجموعة حوالات تم رفعها)
    if (forwardToWhatsApp) {
      // تنظيف رقم الهاتف ليكون أرقاماً بحتة فقط بدون أي فراغات أو إشارات
      let cleanPhoneDigits = (phone || '').replace(/\D/g, '').trim();
      if ((cleanPhoneDigits.endsWith('972') || cleanPhoneDigits.endsWith('970')) && cleanPhoneDigits.length === 12 && cleanPhoneDigits.startsWith('5')) {
        const code = cleanPhoneDigits.slice(-3);
        cleanPhoneDigits = code + cleanPhoneDigits.slice(0, -3);
      }
      if (cleanPhoneDigits.startsWith('00')) {
        cleanPhoneDigits = cleanPhoneDigits.substring(2);
      }
      if (cleanPhoneDigits.startsWith('05')) {
        cleanPhoneDigits = '970' + cleanPhoneDigits.substring(1);
      } else if (cleanPhoneDigits.startsWith('5') && cleanPhoneDigits.length === 9) {
        cleanPhoneDigits = '970' + cleanPhoneDigits;
      }
      if (cleanPhoneDigits.startsWith('97205')) {
        cleanPhoneDigits = '9725' + cleanPhoneDigits.substring(5);
      } else if (cleanPhoneDigits.startsWith('97005')) {
        cleanPhoneDigits = '9705' + cleanPhoneDigits.substring(5);
      }
      cleanPhoneDigits = cleanPhoneDigits.replace(/\D/g, '');

      // القالب الرسمي المعتمد في مجموعة "حوالات تم رفعها"
      const waMessage = (body.customMessage && typeof body.customMessage === 'string' && body.customMessage.trim())
        ? body.customMessage.trim()
        : `بيانات البوابة الالكترونية\n\nاسم المشترك :  \n${participantName}\n\nالايميل أو اسم المستخدم:\n${email}\n\nالرقم السري : \n${cleanPhoneDigits}\n\nرابط تسجيل الدخول إلى بوابة التدريبات العقلية ⬇:\n\nhttps://portal.aqleeat.com/trainees-portal\n\nرابط شرح استخدام البوابة من اليوتيوب ⬇:\n\nhttps://youtu.be/gFRQBtkQceE`;
      
      const waResult = await forwardToWhatsAppGroup({
        targetGroupName: body.targetGroupName || 'حوالات تم رفعها',
        messageText: waMessage,
      });

      results.whatsapp = waResult;
    }

    // التحقق من نتائج العمليات المنفذة
    const airtableFailed = saveToAirtable && results.airtable && !results.airtable.success;
    const portalFailed = submitToPortal && results.portal && !results.portal.success;

    if (airtableFailed || portalFailed) {
      const errMsgs: string[] = [];
      if (airtableFailed) errMsgs.push(results.airtable.error || 'فشل الحفظ في أيرتيبل');
      if (portalFailed) errMsgs.push(results.portal.message || 'فشل التسجيل في البوابة');

      return NextResponse.json(
        {
          success: false,
          error: errMsgs.join(' | '),
          results,
        },
        { status: 400 }
      );
    }

    let successMsg = 'تمت معالجة الحوالة بنجاح.';
    if (results.portal?.alreadyRegistered) {
      successMsg = 'المشترك مسجل مسبقاً في بوابة عقليات، وتم إرسال بيانات الدخول إلى مجموعة (حوالات تم رفعها) بنجاح.';
    }

    return NextResponse.json({
      success: true,
      message: successMsg,
      results,
    });
  } catch (error: any) {
    console.error('خطأ أثناء إرسال وتأكيد الحوالة:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
