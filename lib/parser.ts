import { normalizeDateToISO } from './date-utils';

export interface ParsedTransfer {
  participantName: string;
  age?: string;
  gender: 'ذكر' | 'أنثى' | string;
  senderName: string;
  phone: string;
  cleanPhone: string;
  email: string;
  amount: number;
  currency: string;
  transferType: string;
  transferNumber: string;
  paymentDate: string;
  coordinatorName: string;
  notes: string;
  batch: string;
  isAishaHandDelivery: boolean;
  // رسالة في قروب التسليم باليد بانتظار تأكيد الاستلام
  awaitingAishaConfirmation?: boolean;
  paymentMethod: string;
  payerCountry: string;
  residenceCountry: string;
  rawText?: string;
}

/**
 * تحويل الأرقام المكتوبة بالأرقام العربية المشرقية (٠-٩) والفارسية (۰-۹) إلى أرقام إنجليزية (0-9)
 */
export function toEnglishDigits(str: string): string {
  if (!str) return '';
  return str
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1632 + 48))
    .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1776 + 48));
}

export function cleanPhoneNumber(raw: string): string {
  if (!raw) return '';
  // تحويل الأرقام العربية والفارسية إلى أرقام إنجليزية أولاً
  raw = toEnglishDigits(raw);
  // حذف كافة الفراغات، الشرطات، الرموز، والزائد والاحتفاظ بالأرقام فقط (Digits Only)
  let cleaned = raw.replace(/\D/g, '').trim();

  // إذا تم نسخه معكوساً بسبب RTL في المتصفحات ووصل رمز الدولة إلى النهاية
  if ((cleaned.endsWith('972') || cleaned.endsWith('970')) && cleaned.length === 12 && cleaned.startsWith('5')) {
    const code = cleaned.slice(-3);
    cleaned = code + cleaned.slice(0, -3);
  }

  // إزالة أصفار الاتصال الدولي 00 في البداية
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }

  // إزالة الصفر المفرد إذا أتى قبل كود دولة دولي معروف مثل 0963... أو 0962... أو 0966... أو 0970... أو 0972...
  if (/^0(96[1-8]|97[0-4]|20|90)/.test(cleaned)) {
    cleaned = cleaned.substring(1);
  }

  // معالجة الأرقام الفلسطينية الشائعة (059, 056, 058)
  if (cleaned.startsWith('05')) {
    cleaned = '970' + cleaned.substring(1);
  } else if (cleaned.startsWith('5') && cleaned.length === 9) {
    cleaned = '970' + cleaned;
  }

  // إزالة الصفر الزائد بعد كود الدولة إذا وُجد مثل (972059... أو 970059...)
  if (cleaned.startsWith('97205')) {
    cleaned = '9725' + cleaned.substring(5);
  } else if (cleaned.startsWith('97005')) {
    cleaned = '9705' + cleaned.substring(5);
  }

  return cleaned.replace(/\D/g, '');
}

// معلومات إضافية عن رسالة الواتساب (اسم القروب والتفاعلات) لتحديد حالات التسليم باليد
export interface TransferMessageContext {
  chatName?: string;
  chatJid?: string;
  reactions?: { text: string; sender?: string; senderName?: string }[];
}

// قيم التسليم باليد المؤكد
const AISHA_HAND_DELIVERY_AMOUNT = 100;
const AISHA_HAND_DELIVERY_CURRENCY = 'USD';

export function parseTransferText(text: string, context?: TransferMessageContext): ParsedTransfer {
  // تحويل كافة الأرقام المكتوبة بالعربية أو الفارسية (٠-٩) إلى أرقام إنجليزية (0-9) فوراً لضمان دقة القراءة
  const normalizedText = toEnglishDigits(text || '');
  const rawLines = normalizedText.split('\n').map((l) => l.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').trim()).filter(Boolean);
  // تنظيف البدايات من الرموز والترقيم والأرقام والأشكال التعبيرية (1️⃣، 2️⃣، 1-، إلخ) مع الحفاظ على مفاتيح الدول الدولية للأرقام (+961 أو +970...)
  const lines = rawLines.map((l) =>
    l
      .replace(/^\s*\d{1,2}\s*[).:-]\s*/, '')
      .replace(/^\s*\d[\uFE0F\u20E3]+\s*/, '')
      .replace(/^(?:[#*\s\-.)،:：•~]+(?=\s|[\u0600-\u06FF]))/, '')
      .replace(/^([*\-•#\s]+|\+\s*(?=[^\d+]))/, '')
      .trim()
  );

  const getFieldValue = (fieldLabel: string): string => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(fieldLabel)) {
        // فحص ما إذا كانت القيمة على نفس السطر بعد التسمية
        const parts = line.split(fieldLabel);
        if (parts.length > 1) {
          const before = parts[0].trim();
          // نتأكد أن التسمية في بداية السطر وليست جزءاً من حقل آخر (مثلاً "عمر المتدرب" لا تطابق "المتدرب")
          if (before && !/^[\d٠-٩#*️⃣🔟\u20E3\uFE0F\s\-.)،:：•~+]+$/.test(before)) {
            continue;
          }

          let val = parts.slice(1).join(fieldLabel).replace(/^[:：\s\-_=~]+/, '').trim();
          
          // إزالة أي بادئات استمرارية مثل (للمتدرب :- ...) أو (ثلاثي: ...) أو (مع مقدمة الدولة: ...)
          val = val
            .replace(/^(?:للمشترك|للمتدرب|للمشتركة|للمتدربة|للطالب|للطالبة|للعميل|المشترك|المتدرب|المشتركة|المتدربة|الطالب|الطالبة|العميل)[\s:：\-_=~]*/i, '')
            .replace(/^(?:ثلاثي|رباعي|الثلاثي|الرباعي|الكامل|كاملا|كاملاً)[\s:：\-_=~]*/i, '')
            .replace(/^(?:للمشترك|للمتدرب|للمشتركة|للمتدربة|للطالب|للطالبة|للعميل|المشترك|المتدرب|المشتركة|المتدربة|الطالب|الطالبة|العميل)[\s:：\-_=~]*/i, '')
            .replace(/^(?:مع مقدمة الدولة|مع مقدمة الدوله|مع كود الدولة|مع المفتاح)[\s:：\-_=~]*/i, '')
            .replace(/^[:：\s\-_=~]+/, '')
            .trim();

          const isLabelContinuation = val.endsWith(':') || val.endsWith('：');
          if (val && !isLabelContinuation) {
            return val;
          }
        }

        // إذا كانت القيمة في السطور التالية (نتخطى السطور التي تكون تكملة للعنوان أو عناوين فرعية)
        for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
          const next = lines[j].trim();
          if (!next) continue;

          // تخطي الأسطر التي تمثل مجرد مكملات للتسميات
          if (/^(ثلاثي|رباعي|الثلاثي|الرباعي|مع مقدمة الدولة|مع مقدمة الدوله|مع كود الدولة|مع المفتاح)\s*[:：]?\s*$/i.test(next)) {
            continue;
          }

          // إذا كان السطر ينتهي بنقطتين أو يمثل رأس حقل جديد، نتوقف
          // ملاحظة: \b لا يعمل مع الحروف العربية في JavaScript، لذلك نستخدم (?=\s|:|$)
          if (
            next.endsWith(':') ||
            next.endsWith('：') ||
            /^(اسم|البريد|الايميل|الإيميل|قيمة|المبلغ|نوع|تاريخ|الجنس|الدولة|البلد|المدينة|رقم|الجوال|الهاتف|الملاحظات|العمر)(?=\s|[:：]|$)/.test(next) ||
            // سطر بصيغة (عنوان عربي: قيمة) يعني حقلاً جديداً
            /^[؀-ۿ\s()\/]{2,40}[:：]/.test(next)
          ) {
            break;
          }

          return next;
        }
      }
    }
    return '';
  };

  const cleanNameVal = (name: string): string => {
    if (!name) return '';
    let cleaned = name.trim();
    // إزالة البادئات المتكررة مثل "الإسم", "الأسم", "اسم المشترك", "ثلاثي", "للمتدرب", النقطتين, والرموز
    let prev = '';
    while (prev !== cleaned) {
      prev = cleaned;
      cleaned = cleaned
        .replace(/^[+*\-•#\s:：~_\-\/\\()|=.،,]+/, '')
        .replace(/^(?:الاسم|الأسم|الإسم|إسم|اسم)?\s*(?:ثلاثي|رباعي|الثلاثي|الرباعي|الكامل)?\s*(?:للمشترك|للمتدرب|للمشتركة|للمتدربة|للطالب|للطالبة|للعميل|المشترك|المتدرب|المشتركة|المتدربة|الطالب|الطالبة|العميل|متدرب|مشترك|طالب|عميل)[\s:：\-_=~.]*/i, '')
        .replace(/^(?:للمشترك|للمتدرب|للمشتركة|للمتدربة|للطالب|للطالبة|للعميل|المشترك|المتدرب|المشتركة|المتدربة|الطالب|الطالبة|العميل|متدرب|مشترك|طالب|عميل)[\s:：\-_=~.]*/i, '')
        .replace(/^(?:الاسم|الأسم|الإسم|إسم|اسم)[\s:：\-_=~.]*/i, '')
        .replace(/^(?:ثلاثي|رباعي|الثلاثي|الرباعي|الكامل|كاملا|كاملاً)[\s:：\-_=~.]*/i, '')
        .replace(/^(?:السيد|السيدة|السيده|الأخ|الاخ|الأخت|الاخت|هو|هي)[\s:：\-_=~.]*/i, '')
        .replace(/^[+*\-•#\s:：~_\-\/\\()|=.،,]+/, '')
        .replace(/[:*+~_\-\/\\()|=.،,]+$/, '')
        .trim();
    }
    return cleaned;
  };

  // استخراج اسم المتدرب أو المشترك بمختلف صيغ التسمية والبدائل
  let participantName = cleanNameVal(
    getFieldValue('الاسم الثلاثي للمتدرب') ||
    getFieldValue('الاسم الثلاثي للمشترك') ||
    getFieldValue('الاسم الثلاثي للطالب') ||
    getFieldValue('الاسم الثلاثي للمتدربة') ||
    getFieldValue('الاسم الثلاثي للمشتركة') ||
    getFieldValue('الاسم الثلاثي للطالبة') ||
    getFieldValue('اسم المشترك ثلاثي') ||
    getFieldValue('اسم المتدرب ثلاثي') ||
    getFieldValue('اسم المشتركة ثلاثي') ||
    getFieldValue('اسم المتدربة ثلاثي') ||
    getFieldValue('اسم الطالب ثلاثي') ||
    getFieldValue('اسم الطالبة ثلاثي') ||
    getFieldValue('اسم المشترك') ||
    getFieldValue('اسم المتدرب') ||
    getFieldValue('اسم المشتركة') ||
    getFieldValue('اسم المتدربة') ||
    getFieldValue('اسم الطالب') ||
    getFieldValue('اسم الطالبة') ||
    getFieldValue('اسم العميل') ||
    getFieldValue('الاسم الثلاثي') ||
    getFieldValue('الاسم الرباعي') ||
    getFieldValue('الأسم الثلاثي') ||
    getFieldValue('الإسم الثلاثي') ||
    getFieldValue('الاسم الكامل') ||
    getFieldValue('الاسم') ||
    getFieldValue('الأسم') ||
    getFieldValue('الإسم') ||
    getFieldValue('اسم') ||
    getFieldValue('للمتدرب') ||
    getFieldValue('للمشترك') ||
    getFieldValue('المتدرب') ||
    getFieldValue('المشترك') ||
    ''
  );

  // رسائل بدون عناوين (مثل: السطر الأول هو الاسم مباشرة)
  // نأخذ أول سطر مكوّن من 2-5 كلمات عربية فقط بدون أرقام أو نقطتين
  // بشرط أن تبدو الرسالة بيانات حوالة فعلاً (إيميل أو رقم جوال أو مبلغ بعملة)
  // حتى لا تُعتبر الرسائل العادية مثل "تمام شكرا الك" اسم متدرب
  const looksLikeTransferData =
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text) ||
    /(?:\+|00)?\d[\d\s-]{7,}\d/.test(text) ||
    /\d+\s*(دولار|دينار|شيكل|شكل|ريال|درهم|jod|usd|ils|nis)/i.test(text);
  if (!participantName && looksLikeTransferData) {
    const candidates = lines
      .map((l) => cleanNameVal(l))
      .filter((l) =>
        /^[ء-ي\s]+$/.test(l) &&
        l.split(/\s+/).length >= 2 &&
        l.split(/\s+/).length <= 5 &&
        !/(البريد|الايميل|الإيميل|جوال|الجوال|رقم|تسليم|دفعة|دفعه|شيكل|دينار|دولار|المنسق|تحويل|حوال[ةه]|البيانات|بيانات|الشخصية|المعلومات|الجنس|ذكر|انثى|أنثى|المدينة|العمر|البلد|الدولة|الدوله|مقدمة|فرع)/.test(l)
      );
    if (candidates[0]) participantName = cleanNameVal(candidates[0]);
  }
  // النماذج المرقمة قد تبدأ باسم لاتيني بلا عنوان، مثل "1) Mohammed Lemziouaq".
  if (!participantName && looksLikeTransferData) {
    const numberedName = rawLines
      .filter((line) => /^\s*1\s*[).:-]\s*/.test(line))
      .map((line) => line.replace(/^\s*1\s*[).:-]\s*/, '').trim())
      .find((line) => /^[\p{Script=Latin}][\p{Script=Latin}'’-]*(?:\s+[\p{Script=Latin}][\p{Script=Latin}'’-]*){1,5}$/u.test(line));
    if (numberedName) participantName = numberedName;
  }

  // استخراج العمر أو المواليد
  let age =
    getFieldValue('عمر المشترك') ||
    getFieldValue('عمر المتدرب') ||
    getFieldValue('عمر المشتركة') ||
    getFieldValue('عمر المتدربة') ||
    getFieldValue('عمر الطالب') ||
    getFieldValue('العمر') ||
    getFieldValue('المواليد') ||
    '';
  if (!age) {
    // صيغة بدون عنوان مثل: "26 عام" أو "26 سنة"
    const ageMatch = text.match(/(?:^|\n)\s*(\d{1,2})\s*(عام|عاما|عاماً|سنة|سنه|سنوات)\s*(?:\n|$)/);
    if (ageMatch) age = ageMatch[1];
  }

  let genderRaw = getFieldValue('الجنس (ذكر/انثى)') || getFieldValue('الجنس') || '';
  let gender = 'ذكر';
  if (genderRaw.includes('انث') || genderRaw.includes('أنث')) {
    gender = 'أنثى';
  } else if (/^(ليلى|ندى|فاطم[ةه]|مريم|سار[ةه]|زينب|هدى|هيام|سمر|اسمهان|رنا|فرح|بشرى|غصون|زين[ةه]|جنى|عائش[ةه]|ميس|ثريا|تغريد|ريم|آلاء|الاء|دعاء|اسراء|إسراء|هب[ةه]|سلمى|لمى|رهف|شهد|بيان|آي[ةه]|اي[ةه]|منى|سماح|وعد|حنين|أسيل|اسيل|ديما|لينا|رزان|سجى|تسنيم|أمل|امل)$/.test(participantName.split(/\s+/)[0] || '')) {
    gender = 'أنثى';
  }

  let senderName = cleanNameVal(
    getFieldValue('اسم مرسل الحوالة') ||
    getFieldValue('اسم مرسل الحواله') ||
    getFieldValue('اسم المرسل') ||
    getFieldValue('اسم المحول') ||
    getFieldValue('اسم المودع') ||
    getFieldValue('مرسل الحوالة') ||
    ''
  );
  
  // التحقق من صحة اسم المرسل: إذا كان فارغاً أو عبارة عن أرقام هواتف أو رموز، يستبدل باسم المشترك فوراً
  const isSenderPhoneOrInvalid =
    !senderName ||
    /^\+?\d[\d\s\-\(\)]+$/.test(senderName.trim()) ||
    senderName.replace(/\D/g, '').length >= 5;

  if (isSenderPhoneOrInvalid && participantName) {
    senderName = participantName;
  }

  let phone =
    getFieldValue('رقم جوال المشترك مع مقدمة الدوله') ||
    getFieldValue('رقم جوال المشترك مع مقدمة الدولة') ||
    getFieldValue('رقم جوال المتدرب مع مقدمة الدوله') ||
    getFieldValue('رقم جوال المتدرب مع مقدمة الدولة') ||
    getFieldValue('رقم جوال المتدرب') ||
    getFieldValue('رقم جوال المشترك') ||
    getFieldValue('جوال المتدرب') ||
    getFieldValue('جوال المشترك') ||
    getFieldValue('رقم المتدرب') ||
    getFieldValue('رقم المشترك') ||
    getFieldValue('رقم الجوال مع مقدمة الدوله') ||
    getFieldValue('رقم الجوال مع مقدمة الدولة') ||
    getFieldValue('رقم الجوال') ||
    getFieldValue('رقم الهاتف') ||
    getFieldValue('الجوال') ||
    getFieldValue('الهاتف') ||
    '';

  phone = toEnglishDigits(phone);
  // إذا كانت القيمة لا تحتوي على أرقام كافية، نبحث عن أي رقم هاتف دولي أو محلي في النص
  if (!phone || (phone.replace(/\D/g, '').length < 6)) {
    const phoneRegex = /(?:\+|00)?(?:\d{1,4}[\s\-]?)?(?:0?5\d[\s\-]?\d{3}[\s\-]?\d{4}|\d{2,4}[\s\-]?\d{3,4}[\s\-]?\d{3,5})/g;
    const allMatches = [...normalizedText.matchAll(phoneRegex)];
    for (const m of allMatches) {
      const cleanCandidate = m[0].replace(/\D/g, '');
      if (cleanCandidate.length >= 8 && cleanCandidate.length <= 15) {
        phone = m[0].trim();
        break;
      }
    }
  }

  // تنظيف أي زوائد أو فواصل في نهاية رقم الهاتف
  phone = toEnglishDigits(phone);
  phone = phone.replace(/^مع\s*(مقدمة|كود|مفتاح)\s*(الدولة|الدوله)?\s*[:：]?\s*/i, '').replace(/[,;\s]+$/, '').trim();
  const cleanPhone = cleanPhoneNumber(phone);

  // استخراج البريد الإلكتروني بدقة تامة باستخدام regex بحيث لا يحتوي أبداً على أي كلمات أو تعليمات عربية
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  let email = '';
  const emailFieldVal =
    getFieldValue('البريد الالكتروني للمتدرب') ||
    getFieldValue('البريد الإلكتروني للمتدرب') ||
    getFieldValue('البريد الالكتروني للمشترك') ||
    getFieldValue('البريد الإلكتروني للمشترك') ||
    getFieldValue('البريد الإلكتروني') ||
    getFieldValue('البريد الاكتروني') ||
    getFieldValue('الايميل للمتدرب') ||
    getFieldValue('الإيميل للمتدرب') ||
    getFieldValue('الايميل للمشترك') ||
    getFieldValue('الايميل') ||
    getFieldValue('الإيميل') ||
    getFieldValue('email') ||
    getFieldValue('Email') ||
    '';

  if (emailFieldVal) {
    const emMatch = emailFieldVal.match(emailRegex);
    if (emMatch) {
      email = emMatch[0];
    }
  }

  if (!email) {
    const textEmailMatch = text.match(emailRegex);
    if (textEmailMatch) {
      email = textEmailMatch[0];
    }
  }

  // تنظيف البريد من أي محارف اتجاه مخفية أو شوائب (LTR/RTL marks مثل \u202c أو \u200f)
  email = email.replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]/g, '').trim().toLowerCase();

  const city =
    getFieldValue('المدينة') ||
    getFieldValue('البلدة') ||
    getFieldValue('مكان الإقامة') ||
    getFieldValue('مكان الاقامة') ||
    getFieldValue('البلد') ||
    '';

  // استنتاج بلد الإقامة وبلد الدفع ذكياً بناءً على مفتاح رقم الجوال والمدينة والنص
  const cleanPhoneDigits = cleanPhone || phone.replace(/\D/g, '');

  // الدول: كود الهاتف + أسماء الدولة ومدنها
  // ملاحظة: الأسماء تُطابق ككلمات كاملة فقط (مثلاً "مصرفية" لا تعني "مصر"، و"سلطنة عمان" لا تعني "عمان" الأردن)
  const COUNTRIES: { name: string; codes: string[]; words: string[] }[] = [
    { name: 'فلسطين', codes: ['970', '972'], words: ['فلسطين', 'القدس', 'الخليل', 'رام الله', 'نابلس', 'غزة', 'غزه', 'جنين', 'طولكرم', 'قلقيلية', 'بيت لحم', 'أريحا', 'اريحا', 'البيرة', 'سلفيت', 'طوباس'] },
    { name: 'سلطنة عمان', codes: ['968'], words: ['سلطنة عمان', 'مسقط'] },
    { name: 'الأردن', codes: ['962'], words: ['الأردن', 'الاردن', 'عمان', 'إربد', 'اربد', 'الزرقاء'] },
    { name: 'لبنان', codes: ['961'], words: ['لبنان', 'طرابلس', 'بيروت', 'صيدا', 'زحلة', 'النبطية'] },
    { name: 'المملكة العربية السعودية', codes: ['966'], words: ['السعودية', 'السعوديه', 'الرياض', 'جدة', 'جده', 'مكة', 'مكه', 'الدمام'] },
    { name: 'الإمارات العربية المتحدة', codes: ['971'], words: ['الإمارات', 'الامارات', 'دبي', 'أبو ظبي', 'ابو ظبي', 'الشارقة'] },
    { name: 'مصر', codes: ['20'], words: ['مصر', 'القاهرة', 'القاهره', 'الإسكندرية', 'الاسكندرية', 'الجيزة', 'الجيزه'] },
    { name: 'الكويت', codes: ['965'], words: ['الكويت'] },
    { name: 'قطر', codes: ['974'], words: ['قطر', 'الدوحة'] },
    { name: 'البحرين', codes: ['973'], words: ['البحرين', 'المنامة'] },
    { name: 'العراق', codes: ['964'], words: ['العراق', 'بغداد', 'البصرة'] },
    { name: 'سوريا', codes: ['963'], words: ['سوريا', 'دمشق', 'حلب', 'معضمية', 'معظمية', 'الشام', 'حمص', 'اللاذقية', 'حماة', 'حماه', 'طرطوس', 'درعا', 'السويداء', 'دير الزور', 'إدلب', 'ادلب', 'ريف دمشق'] },
    { name: 'تركيا', codes: ['90'], words: ['تركيا', 'إسطنبول', 'اسطنبول'] },
  ];

  // مطابقة كلمة عربية كاملة (\b لا يعمل مع الحروف العربية)
  const hasWholeWord = (source: string, word: string): boolean => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    return new RegExp(`(^|[^\\u0600-\\u06FF])(و|ب|ل|في\\s*)?${escaped}(?![\\u0600-\\u06FF])`).test(source);
  };
  const countryFromText = (source: string): string => {
    // "سلطنة عمان" قبل "عمان" حتى لا تُحسب الأردن
    const cleaned = source.replace(/سلطن[ةه]\s*عمان/g, ' مسقط ');
    return COUNTRIES.find((c) => c.words.some((w) => hasWholeWord(cleaned, w)))?.name || '';
  };

  // الأولوية: 1) المدينة المكتوبة صراحة  2) كود الهاتف  3) باقي نص الرسالة
  // كود الدولة يُعتمد فقط لرقم دولي كامل (11 رقماً فأكثر)، وليس لرقم ناقص يبدأ صدفة بـ 20 أو 90
  const countryFromPhone =
    (cleanPhoneDigits.length >= 11 ? COUNTRIES.find((c) => c.codes.some((code) => cleanPhoneDigits.startsWith(code)))?.name : '') ||
    (/^07[789]/.test(phone) ? 'الأردن' : '');

  const defaultCountry =
    (city && countryFromText(city)) ||
    countryFromPhone ||
    countryFromText(text) ||
    'فلسطين';

  // 1. فحص حقول المبالغ الصريحة أولاً
  const explicitAmountStr =
    getFieldValue('قيمة الاشتراك للمتدرب') ||
    getFieldValue('قيمة الاشتراك للمشترك') ||
    getFieldValue('قيمة الاشتراك') ||
    getFieldValue('قيمة الرسوم للمشترك') ||
    getFieldValue('قيمة الرسوم للمتدرب') ||
    getFieldValue('قيمة الرسوم') ||
    getFieldValue('المبلغ المحول') ||
    getFieldValue('المبلغ المدفوع') ||
    getFieldValue('قيمة الحوالة') ||
    getFieldValue('المبلغ') ||
    getFieldValue('الرسوم') ||
    '';

  let detectedAmount: number | null = null;
  let detectedCurrency = '';

  if (explicitAmountStr) {
    const numMatch = explicitAmountStr.match(/(\d+(?:\.\d+)?)/);
    if (numMatch) {
      detectedAmount = parseFloat(numMatch[1]);
    }
    if (/دولار|dollar|usd|\$/i.test(explicitAmountStr)) {
      detectedCurrency = 'USD';
    } else if (/دينار|jod/i.test(explicitAmountStr)) {
      detectedCurrency = 'JOD';
    } else if (/شيكل|شكل|ils|nis/i.test(explicitAmountStr)) {
      detectedCurrency = 'ILS';
    } else if (/ريال|sar/i.test(explicitAmountStr)) {
      detectedCurrency = 'SAR';
    } else if (/درهم|aed/i.test(explicitAmountStr)) {
      detectedCurrency = 'AED';
    } else if (/يورو|euro|eur|€/i.test(explicitAmountStr)) {
      detectedCurrency = 'EUR';
    }
  }

  // 2. إذا لم يُعثر على حقل صريح، نبحث عن مبالغ مقترنة بالعملة في كامل النص (مثل: 120 دولار، 85 دينار)
  if (!detectedAmount) {
    for (const rawLine of lines) {
      // حذف رقم الدفعة (مثل "دفعة 150") حتى لا يُعتبر مبلغاً، مع الإبقاء على باقي السطر
      const l = rawLine.replace(/(ال)?دفع[ةه]\s*\d+/g, ' ');
      if (/^\+?\d{8,15}/.test(l)) {
        continue;
      }
      if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(l)) {
        continue;
      }

      // نمط: رقم يليه عملة (120 دولار / 85 دينار / 450 شيكل / 120 USD / 120$)
      const matchAfter = l.match(/(?:^|[^\d])(\d+(?:\.\d+)?)\s*(دولار|dollar|usd|\$|دينار|jod|شيكل|شكل|ils|nis|ريال|sar|درهم|aed|ليرة|يورو|euro|eur|€)(?:[^\d]|$)/i);
      if (matchAfter) {
        detectedAmount = parseFloat(matchAfter[1]);
        const curWord = matchAfter[2].toLowerCase();
        if (/دولار|dollar|usd|\$/i.test(curWord)) detectedCurrency = 'USD';
        else if (/دينار|jod/i.test(curWord)) detectedCurrency = 'JOD';
        else if (/شيكل|شكل|ils|nis/i.test(curWord)) detectedCurrency = 'ILS';
        else if (/ريال|sar/i.test(curWord)) detectedCurrency = 'SAR';
        else if (/درهم|aed/i.test(curWord)) detectedCurrency = 'AED';
        else if (/يورو|euro|eur|€/i.test(curWord)) detectedCurrency = 'EUR';
        break;
      }

      // نمط: عملة يليها رقم ($120 / دولار 120 / دينار 85)
      const matchBefore = l.match(/(دولار|dollar|usd|\$|دينار|jod|شيكل|شكل|ils|nis|ريال|sar|درهم|aed|ليرة|يورو|euro|eur|€)\s*(\d+(?:\.\d+)?)/i);
      if (matchBefore) {
        detectedAmount = parseFloat(matchBefore[2]);
        const curWord = matchBefore[1].toLowerCase();
        if (/دولار|dollar|usd|\$/i.test(curWord)) detectedCurrency = 'USD';
        else if (/دينار|jod/i.test(curWord)) detectedCurrency = 'JOD';
        else if (/شيكل|شكل|ils|nis/i.test(curWord)) detectedCurrency = 'ILS';
        else if (/ريال|sar/i.test(curWord)) detectedCurrency = 'SAR';
        else if (/درهم|aed/i.test(curWord)) detectedCurrency = 'AED';
        else if (/يورو|euro|eur|€/i.test(curWord)) detectedCurrency = 'EUR';
        break;
      }
    }
  }

  // 3. تحديد العملة النهائية
  if (!detectedCurrency) {
    if (text.includes('دولار') || text.includes('USD') || text.includes('$')) {
      detectedCurrency = 'USD';
    } else if (text.includes('دينار') || text.includes('JOD')) {
      detectedCurrency = 'JOD';
    } else if (text.includes('شيكل') || text.includes('شكل') || text.includes('ILS') || text.includes('NIS')) {
      detectedCurrency = 'ILS';
    } else if (text.includes('ريال') || text.includes('SAR')) {
      detectedCurrency = 'SAR';
    } else if (/يورو|euro|eur|€/i.test(text)) {
      detectedCurrency = 'EUR';
    } else if (text.includes('درهم') || text.includes('AED')) {
      detectedCurrency = 'AED';
    } else if (defaultCountry === 'سوريا' || defaultCountry === 'لبنان') {
      detectedCurrency = 'USD';
    } else if (defaultCountry === 'المملكة العربية السعودية') {
      detectedCurrency = 'SAR';
    } else if (defaultCountry === 'الإمارات العربية المتحدة') {
      detectedCurrency = 'AED';
    } else {
      detectedCurrency = 'JOD';
    }
  }

  // 4. تحديد المبلغ النهائي
  const finalAmount = detectedAmount || (defaultCountry === 'لبنان' || defaultCountry === 'سوريا' ? 105 : 85);

  const transferTypeField = getFieldValue('نوع الحوالة');
  const transferType = transferTypeField || 'مصرفية';
  
  let transferNumber = getFieldValue('رقم الحوالة') || '';
  if (!transferNumber) {
    // محاولة استخراج رقم الحوالة من السطور التي تلي نوع الحوالة مباشرة إذا كانت أرقاماً بحتة وليست أرقام هواتف
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('نوع الحوالة') && i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (/^\d{6,15}$/.test(next) && next !== cleanPhone && !phone.includes(next)) {
          transferNumber = next;
          break;
        }
      }
    }
  }

  // محاولة البحث عن أي رقم تسلسلي يمثل رقم الحوالة فقط إذا كان النص يحتوي تصريحاً عن رقم العملية أو الإيصال
  // مع استبعاد رقم هاتف المتدرب والتواريخ تماماً
  if (!transferNumber && /(رقم\s*(الحوال[ةه]|العملية|العمليه|الإيصال|الايصال|السند|المرجع|الكود)|MTCN|مرجع\s*الحوال[ةه])/i.test(text)) {
    const rawDigitsInPhone = phone.replace(/\D/g, '');
    const cleanPhoneDigitsNoCode = cleanPhone.replace(/^(970|972|963|962|961|966|971|20|90)/, '');
    const allCandidateNumbers = text.match(/\b\d{6,16}\b/g) || [];
    for (const cand of allCandidateNumbers) {
      if (
        cand === rawDigitsInPhone ||
        cand === cleanPhone ||
        (cleanPhoneDigitsNoCode && cand.includes(cleanPhoneDigitsNoCode)) ||
        (rawDigitsInPhone && cand.includes(rawDigitsInPhone)) ||
        (rawDigitsInPhone && rawDigitsInPhone.includes(cand))
      ) {
        continue;
      }
      if (/^(202\d|19\d\d)/.test(cand) && cand.length === 8) {
        continue;
      }
      transferNumber = cand;
      break;
    }
  }

  let rawDate = getFieldValue('تاريخ السداد') || getFieldValue('التاريخ') || '';
  if (!rawDate) {
    const dateMatch = text.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/);
    if (dateMatch) {
      rawDate = dateMatch[0];
    }
  }
  const paymentDate = normalizeDateToISO(rawDate);

  let coordinatorName =
    getFieldValue('اسم المنسق') ||
    getFieldValue('المنسق') ||
    getFieldValue('المنسقة') ||
    '';

  if (!coordinatorName) {
    for (const l of lines) {
      if (/^(سلمى|ميس|ثريا)$/.test(l.trim())) {
        coordinatorName = l.trim();
        break;
      }
    }
  }
  
  // التحقق من حالة التسليم باليد
  const isAishaGroup =
    /تسليم\s*(ب|بال)?\s*يد/i.test(context?.chatName || '') ||
    Boolean(context?.chatJid && /تسليم\s*(ب|بال)?\s*يد/i.test(context.chatJid));

  const hasAishaMention =
    /تسليم\s*(ب|بال)?\s*يد/i.test(text) ||
    transferType.includes('استلام باليد');

  const isExplicitBank =
    !isAishaGroup &&
    !hasAishaMention &&
    (transferTypeField.includes('مصرف') ||
      transferTypeField.includes('بنك') ||
      /نوع\s*الحوال[ةه]\s*:\s*مصرفي/i.test(text));

  const hasExplicitTransferNumber = Boolean(
    !isAishaGroup &&
    !hasAishaMention &&
    transferNumber && transferNumber.replace(/\D/g, '').length >= 4
  );

  let isAishaHandDelivery = isAishaGroup || hasAishaMention || (!isExplicitBank && !hasExplicitTransferNumber && transferType.includes('استلام باليد'));

  let amount = finalAmount;
  let currency = detectedCurrency;
  if (isAishaHandDelivery) {
    amount = AISHA_HAND_DELIVERY_AMOUNT;
    currency = AISHA_HAND_DELIVERY_CURRENCY;
  }

  const resolvedTransferType = isAishaHandDelivery
    ? 'استلام باليد'
    : (isExplicitBank ? 'تحويل مصرفي' : transferType);

  const paymentMethod = isAishaHandDelivery ? 'استلام باليد' : 'تحويل مصرفي';

  let payerCountry = getFieldValue('بلد الدفع') || getFieldValue('بلدة الدفع') || defaultCountry;
  let residenceCountry = getFieldValue('بلد الإقامة') || getFieldValue('بلد الاقامة') || defaultCountry;

  // الملاحظات: حسب القاعدة الصارمة تشمل فقط اسم المنسق والعمر ولا أي شيء آخر لجميع التسجيلات
  const notes = [
    coordinatorName ? `اسم المنسق: ${coordinatorName}` : '',
    age ? `العمر: ${age}` : '',
  ].filter(Boolean).join(' - ');

  return {
    participantName: cleanNameVal(participantName),
    age: toEnglishDigits(age),
    gender,
    senderName: cleanNameVal(senderName),
    phone: cleanPhone || phone.replace(/\D/g, ''),
    cleanPhone: cleanPhone || phone.replace(/\D/g, ''),
    email,
    amount,
    currency,
    transferType: resolvedTransferType,
    transferNumber: isAishaHandDelivery ? '' : transferNumber,
    paymentDate,
    coordinatorName,
    notes,
    batch: '',
    isAishaHandDelivery,
    awaitingAishaConfirmation: false,
    paymentMethod,
    payerCountry,
    residenceCountry,
    rawText: text,
  };
}
