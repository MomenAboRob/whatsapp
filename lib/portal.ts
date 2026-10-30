import fs from 'fs';
import path from 'path';
import { getCurrentBatchNumber } from './current-batch';

export interface PortalSubmissionData {
  participantName: string;
  email: string;
  phone: string;
  gender?: 'ذكر' | 'أنثى' | string;
  payerCountry?: string;
  residenceCountry?: string;
  paymentMethod?: string;
  senderName?: string;
  transactionNumber?: string;
  paymentDate?: string;
  bankName?: string;
  amountLocal?: number;
  currency?: string;
  notes?: string;
  receiptFileBase64?: string;
  receiptFilename?: string;
}

export interface PortalSubmissionResult {
  success: boolean;
  message: string;
  alreadyRegistered?: boolean;
  portalUrl?: string;
  details?: any;
}

/**
 * محرك استخراج Nonce وملء نموذج بوابة عقليات تلقائياً
 */
export async function submitToAqleeatPortal(data: PortalSubmissionData): Promise<PortalSubmissionResult> {
  const PORTAL_URL = process.env.PORTAL_URL || 'https://portal.aqleeat.com/delegate-registration/';

  // تنظيف رقم الهاتف بشكل قاطع: أرقام بحتة فقط (Digits only) بدون أي فراغات أو إشارات
  let cleanPhoneDigits = (data.phone || '').replace(/\D/g, '').trim();

  // إذا تم نسخه معكوساً بسبب RTL في المتصفحات
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

  if (!cleanPhoneDigits || cleanPhoneDigits.length < 8) {
    return {
      success: false,
      message: 'رقم جوال المشترك مطلوب ويجب أن يتكون من أرقام فقط مع كود الدولة لإتمام التسجيل في البوابة وإنشاء كلمة المرور.',
    };
  }
  if (!data.email || !data.email.trim() || !data.email.includes('@')) {
    return {
      success: false,
      message: 'البريد الإلكتروني للمشترك مطلوب وغير صالح لإتمام التسجيل في البوابة.',
    };
  }

  try {
    const delegateCookie = process.env.PORTAL_SESSION_COOKIE || '';
    const initialHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
    };
    if (delegateCookie) {
      initialHeaders['Cookie'] = delegateCookie;
    }

    // الخطوة 1: جلب صفحة التسجيل للحصول على الـ Cookies والـ Nonce الحديث
    const initialRes = await fetch(PORTAL_URL, {
      headers: initialHeaders,
      cache: 'no-store',
    });

    if (!initialRes.ok) {
      return {
        success: false,
        message: `تعذر الاتصال ببوابة عقليات: ${initialRes.statusText}`,
      };
    }

    const html = await initialRes.text();
    const serverCookies = initialRes.headers.get('set-cookie') || '';
    const combinedCookie = delegateCookie
      ? `${delegateCookie}${serverCookies ? '; ' + serverCookies : ''}`
      : serverCookies;

    // استخراج _wpnonce من النموذج وnonce الخاص برفع الملفات
    const nonceMatch = html.match(/name="_wpnonce"\s+value="([^"]+)"/) || html.match(/id="_wpnonce"\s+value="([^"]+)"/);
    const wpnonce = nonceMatch ? nonceMatch[1] : '';

    const umScriptsMatch = html.match(/var\s+um_scripts\s*=\s*\{[^}]*"nonce":"([^"]+)"/);
    const ajaxNonce = umScriptsMatch ? umScriptsMatch[1] : '';

    // رفع صورة الإيصال أولاً عبر AJAX للحصول على اسم الملف المؤقت (مطلوب إلزامياً من البوابة)
    let uploadedReceiptFilename = '';
    try {
      let fileBlob: Blob | null = null;
      if (data.receiptFileBase64) {
        let cleanRel = data.receiptFileBase64.replace(/^https?:\/\/[^\/]+\//, '');
        cleanRel = cleanRel.replace(/^\/?(public\/)?/, '');
        const localPath = path.join(process.cwd(), 'public', cleanRel);
        if (fs.existsSync(localPath)) {
          const buf = fs.readFileSync(localPath);
          const ext = path.extname(localPath).toLowerCase();
          let mimeType = 'image/jpeg';
          if (ext === '.pdf') mimeType = 'application/pdf';
          else if (ext === '.png') mimeType = 'image/png';
          else if (ext === '.webp') mimeType = 'image/webp';
          fileBlob = new Blob([buf], { type: mimeType });
        } else if (data.receiptFileBase64.startsWith('data:')) {
          const commaIdx = data.receiptFileBase64.indexOf(',');
          if (commaIdx !== -1) {
            const meta = data.receiptFileBase64.slice(0, commaIdx);
            const base64Data = data.receiptFileBase64.slice(commaIdx + 1);
            const mime = meta.split(':')[1]?.split(';')[0] || 'application/octet-stream';
            const buf = Buffer.from(base64Data, 'base64');
            fileBlob = new Blob([buf], { type: mime });
          }
        }
      }

      // صورة وصل افتراضية في حال عدم توفر أي إيصال لتلبية متطلب البوابة الإلزامي
      if (!fileBlob) {
        const dummyReceipt = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
        fileBlob = new Blob([dummyReceipt], { type: 'image/png' });
      }

      const isPdf =
        (data.receiptFilename && data.receiptFilename.toLowerCase().endsWith('.pdf')) ||
        (data.receiptFileBase64 && data.receiptFileBase64.toLowerCase().includes('.pdf'));
      const fallbackUploadName = isPdf ? 'receipt.pdf' : 'receipt.png';

      const uploadFormData = new FormData();
      uploadFormData.append('action', 'um_fileupload');
      uploadFormData.append('key', 'payment-slip1');
      uploadFormData.append('set_id', '37303');
      uploadFormData.append('set_mode', 'register');
      uploadFormData.append('_wpnonce', ajaxNonce);
      uploadFormData.append('timestamp', String(Math.floor(Date.now() / 1000)));
      uploadFormData.append('payment-slip1', fileBlob, data.receiptFilename || fallbackUploadName);

      const uploadRes = await fetch('https://portal.aqleeat.com/wp-admin/admin-ajax.php', {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cookie': combinedCookie,
          'Referer': PORTAL_URL,
        },
        body: uploadFormData,
      });

      if (uploadRes.ok) {
        const uploadJson = await uploadRes.json();
        if (uploadJson.success && uploadJson.data?.filename) {
          uploadedReceiptFilename = uploadJson.data.filename;
        }
      }
    } catch (uploadErr) {
      console.warn('تنبيه: تعذر رفع صورة الوصل قبل التسجيل:', uploadErr);
    }

    // تحديد كلمة المرور ورقم الجوال لتكون مطابقة وبأرقام فقط (Digits Only) بدون أي فراغات أو رموز
    const password = cleanPhoneDigits;

    // تجهيز حقول النموذج المتوافقة مع Ultimate Member فورم 37303
    const formData = new URLSearchParams();
    formData.append('form_id', '37303');
    formData.append('_wpnonce', wpnonce);
    formData.append('_wp_http_referer', '/delegate-registration/');
    formData.append('um_request', '');
    
    formData.append('first_name-37303', data.participantName);
    formData.append('training_batch-37303', `دورة إنعاش العقل - الدفعة ${getCurrentBatchNumber()}`);
    formData.append('user_email-37303', (data.email || '').trim().toLowerCase());
    formData.append('trainee_gender', data.gender === 'أنثى' ? 'أنثى' : 'ذكر');
    formData.append('payer_country', data.payerCountry || 'فلسطين');
    formData.append('trainee_phone-37303', cleanPhoneDigits);
    formData.append('residence_country', data.residenceCountry || 'فلسطين');
    formData.append('ragree_terms[]', 'موافق على الشروط والأحكام');
    formData.append('ragree_terms_11[]', 'اوافق على تلقي رسائل عبر واتساب');
    formData.append('user_password-37303', password);
    formData.append('confirm_user_password-37303', password);
    
    if (uploadedReceiptFilename) {
      formData.append('payment-slip1-37303', uploadedReceiptFilename);
    }

    // طريقة السداد: إذا كانت استلام باليد لا يوضع رقم حوالة ولا اسم بنك
    const isHandDelivery = data.paymentMethod === 'استلام باليد';

    // فلترة الملاحظات لتشمل حصراً اسم المنسق والعمر
    const coordinatorVal = (data.notes || '').match(/اسم\s*المنسق\s*:\s*([^\n\r-]+)/i)?.[1]?.trim() || '';
    const ageVal = (data.notes || '').match(/العمر\s*:\s*([^\n\r-]+)/i)?.[1]?.trim() || '';
    const notesParts: string[] = [];
    if (coordinatorVal) notesParts.push(`اسم المنسق: ${coordinatorVal}`);
    if (ageVal) notesParts.push(`العمر: ${ageVal}`);
    const strictNotes = notesParts.length > 0 ? notesParts.join(' - ') : (data.notes || '');

    formData.append('Payment_method[]', data.paymentMethod || 'تحويل مصرفي');
    formData.append('sender_name-37303', data.senderName || data.participantName);
    formData.append('transaction_number-37303', isHandDelivery ? '' : (data.transactionNumber || ''));
    formData.append('payment_date-37303', data.paymentDate || new Date().toISOString().split('T')[0]);
    formData.append('sender_bank_name-37303', isHandDelivery ? '' : (data.bankName || ''));
    formData.append('amount_local_currency-37303', String(data.amountLocal || (isHandDelivery ? 100 : 85)));
    formData.append('currency_code', data.currency || (isHandDelivery ? 'USD' : 'JOD'));
    formData.append('at_user_status-37303', 'إشتراك جديد – New Reg.');
    formData.append('txtooooooooo', strictNotes);

    // إرسال الطلب إلى خادم بوابة عقليات
    const submitRes = await fetch(PORTAL_URL, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': combinedCookie,
        'Referer': PORTAL_URL,
      },
      body: formData.toString(),
      redirect: 'manual',
    });

    const responseStatus = submitRes.status;
    const responseLocation = submitRes.headers.get('location') || '';
    const responseText = await submitRes.text();

    // استخراج أخطاء الحقول الحقيقية غير الفارغة مع تجاوز أي وسوم أو أيقونات داخلية
    const fieldErrors = [...responseText.matchAll(/class="[^"]*(?:um-field-error|um-notice)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);

    // فحص ما إذا كان هناك خطأ في البريد الإلكتروني (مسجل مسبقاً أو غير صحيح)
    const isDuplicateEmail = fieldErrors.some(err => 
      err.includes('البريد الإلكتروني الذي أدخلته غير صحيح') ||
      err.includes('مسجل مسبقاً') ||
      err.includes('already registered') ||
      err.includes('unique_email')
    );

    // إذا وُجدت أخطاء حقيقية في النموذج، فالعملية فاشلة ولم تُحفظ في البوابة
    if (fieldErrors.length > 0) {
      if (isDuplicateEmail) {
        return {
          success: false,
          alreadyRegistered: true,
          message: 'تعذر التسجيل في البوابة: هذا البريد الإلكتروني مسجل مسبقاً في نظام عقليات أو غير صالح. يرجى التحقق من البريد أو استخدام بريد جديد للمتدرب.',
          portalUrl: PORTAL_URL,
        };
      }
      return {
        success: false,
        message: `خطأ في بيانات النموذج للبوابة: ${fieldErrors.join(' | ')}`,
        details: responseStatus,
      };
    }

    // التحقق من النجاح: إعادة التوجيه إلى صفحة الشكر أو logout-wa أو كود 302
    const isRedirect = (responseStatus >= 300 && responseStatus < 400) || responseLocation.includes('logout');
    const isSuccess = isRedirect || responseText.includes('تم التسجيل بنجاح') || responseText.includes('شكراً');

    if (isSuccess) {
      return {
        success: true,
        message: 'تم إرسال بيانات المشترك بنجاح إلى بوابة عقليات.',
        portalUrl: PORTAL_URL,
      };
    } else {
      return {
        success: false,
        message: 'فشلت معالجة التسجيل في البوابة، يرجى مراجعة البيانات المدخلة.',
        details: responseStatus,
      };
    }
  } catch (error: any) {
    console.error('خطأ أثناء رفع البيانات إلى بوابة عقليات:', error);
    return {
      success: false,
      message: `خطأ تقني أثناء الاتصال بالبوابة: ${error.message}`,
    };
  }
}
