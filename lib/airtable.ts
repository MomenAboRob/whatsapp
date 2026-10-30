import fs from 'fs';
import path from 'path';
import { normalizeDateToISO } from './date-utils';
import { getCurrentBatchNumber } from './current-batch';
import { airtableFetch, airtableReadError } from './airtable-request';

const AIRTABLE_API_URL = 'https://api.airtable.com/v0';
// المفاتيح تُقرأ من ملف .env.local فقط (لا تكتب أي مفتاح داخل الكود)
const BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const TABLE_NAME = encodeURIComponent('بيانات المتدربين');
const TOKEN = process.env.AIRTABLE_API_TOKEN || '';

// تهريب النصوص داخل صيغ أيرتيبل لمنع كسر الاستعلام (مثل الأسماء التي تحتوي على ')
function escapeFormulaString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export interface AirtableRecordData {
  senderName: string;
  participantName: string;
  date: string;
  originalAmount: number;
  depositedAmount: number;
  email: string;
  country?: string;
  status?: string;
  receiptUrl?: string;
  dataCardUrl?: string;
  additionalReceiptUrls?: { url: string; filename?: string }[];
  receiptFilename?: string;
  transferNumber: string;
  walletMethod?: string;
  batch?: string;
  notes?: string;
  isAishaHandDelivery?: boolean;
}

/**
 * فحص التكرار والمطابقة مع أيرتيبل:
 * القاعدة المعتمدة: تكرار رقم الحوالة مسموح تماماً ولا يمنع التسجيل (مثل تسجيل أكثر من مشترك بنفس الوصل/التحويل).
 * فحص التكرار يعتمد حصراً وقطعياً على: (البريد الإلكتروني) أو (اسم المشترك) فقط!
 */
export async function checkAirtableDuplicate(
  _transferNumber?: string,
  participantName?: string,
  email?: string
): Promise<{ isDuplicate: boolean; existingRecord?: any; matchedBy?: string }> {
  const conditions: string[] = [];

  const cleanName = (participantName || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();

  // فحص التكرار: البريد الإلكتروني أو اسم المشترك فقط
  if (cleanEmail) {
    conditions.push(`{بريد الاكتروني} = '${escapeFormulaString(cleanEmail)}'`);
  }
  if (cleanName) {
    conditions.push(`{اسم المشترك} = '${escapeFormulaString(cleanName)}'`);
  }

  if (conditions.length === 0) {
    return { isDuplicate: false };
  }

  try {
    const rawFormula = conditions.length === 1 ? conditions[0] : `OR(${conditions.join(', ')})`;
    const filterFormula = encodeURIComponent(rawFormula);
    const url = `${AIRTABLE_API_URL}/${BASE_ID}/${TABLE_NAME}?filterByFormula=${filterFormula}&maxRecords=1`;

    const res = await airtableFetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      console.error('فشل الاستعلام من أيرتيبل:', await res.text());
      return { isDuplicate: false };
    }

    const data = await res.json();
    if (data.records && data.records.length > 0) {
      const rec = data.records[0];
      const recFields = rec.fields || {};
      let matchedBy = 'البيانات';
      if (cleanEmail && String(recFields['بريد الاكتروني'] || '').trim().toLowerCase() === cleanEmail) {
        matchedBy = `البريد الإلكتروني (${cleanEmail})`;
      } else if (cleanName && String(recFields['اسم المشترك'] || '').trim() === cleanName) {
        matchedBy = `اسم المشترك (${cleanName})`;
      }

      return {
        isDuplicate: true,
        existingRecord: rec,
        matchedBy,
      };
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error('خطأ أثناء فحص التكرار في أيرتيبل:', error);
    return { isDuplicate: false };
  }
}

/**
 * جلب كافة السجلات المسجلة في أيرتيبل مع دعم الصفحات (Pagination)
 */
export async function getRecentAirtableRecords(limit: number = 500) {
  const allRecords: any[] = [];
  let offset: string | undefined = undefined;

  do {
    const offsetParam: string = offset ? `&offset=${encodeURIComponent(offset)}` : '';
    const url: string = `${AIRTABLE_API_URL}/${BASE_ID}/${TABLE_NAME}?pageSize=100&sort%5B0%5D%5Bfield%5D=%D8%A7%D9%84%D8%AA%D8%A7%D8%B1%D9%8A%D8%AE&sort%5B0%5D%5Bdirection%5D=desc${offsetParam}`;
    const res: Response = await airtableFetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      throw await airtableReadError(res, 'خطأ في جلب بيانات أيرتيبل');
    }

    const json: any = await res.json();
    const records = json.records || [];
    allRecords.push(...records);
    offset = json.offset;

    if (allRecords.length >= limit) break;
  } while (offset);

  return allRecords;
}

/**
 * رفع الصورة أو المستند مؤقتاً لتوليد رابط سحابي مباشر يمكن لأيرتيبل سحبه وتخزينه نهائياً
 */
async function uploadToTemporaryHost(imageInput?: string, filename: string = 'image.jpg'): Promise<string | null> {
  if (!imageInput) return null;

  // إذا كان الرابط عام ومباشر بالفعل (وليس محلي localhost أو 127.0.0.1)
  if (
    (imageInput.startsWith('http://') || imageInput.startsWith('https://')) &&
    !imageInput.includes('localhost') &&
    !imageInput.includes('127.0.0.1')
  ) {
    return imageInput;
  }

  try {
    let fileBlob: Blob | null = null;

    if (imageInput.startsWith('data:')) {
      const commaIdx = imageInput.indexOf(',');
      if (commaIdx !== -1) {
        const meta = imageInput.slice(0, commaIdx);
        const base64Data = imageInput.slice(commaIdx + 1);
        const mime = meta.split(':')[1]?.split(';')[0] || 'application/octet-stream';
        const buf = Buffer.from(base64Data, 'base64');
        fileBlob = new Blob([buf], { type: mime });
      }
    } else {
      // إزالة أي بادئة مثل http://localhost:3000/ أو /media/ أو public/media/
      let cleanRel = imageInput.replace(/^https?:\/\/[^\/]+\//, '');
      cleanRel = cleanRel.replace(/^\/?(public\/)?/, '');
      const p = path.join(process.cwd(), 'public', cleanRel);
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        const ext = path.extname(p).toLowerCase();
        let mime = 'image/jpeg';
        if (ext === '.pdf') mime = 'application/pdf';
        else if (ext === '.png') mime = 'image/png';
        else if (ext === '.webp') mime = 'image/webp';
        else if (ext === '.svg') mime = 'image/svg+xml';
        fileBlob = new Blob([buf], { type: mime });
      }
    }

    if (!fileBlob) return null;

    // 1. المحاولة الأولى: سيرفر uguu.se المباشر (يوفر رابطاً مباشراً للصورة دون صفحات وسيطة)
    try {
      const uguuForm = new FormData();
      uguuForm.append('files[]', fileBlob, filename);
      const uguuRes = await fetch('https://uguu.se/upload.php', {
        method: 'POST',
        body: uguuForm,
      });
      if (uguuRes.ok) {
        const uguuJson = await uguuRes.json();
        if (uguuJson?.files?.[0]?.url) {
          return uguuJson.files[0].url;
        }
      }
    } catch (errUguu) {
      console.warn('تنبيه: محاولة الرفع الأولى عبر uguu فشلت، جاري استخدام البديل:', errUguu);
    }

    // 2. المحاولة الثانية: tmpfiles.org مع استخراج الرابط المباشر للتحميل
    try {
      const form = new FormData();
      form.append('file', fileBlob, filename);

      const res = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: form,
      });

      if (res.ok) {
        const json = await res.json();
        if (json?.data?.url) {
          const pageUrl = json.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
          const pageRes = await fetch(pageUrl);
          if (pageRes.ok) {
            const html = await pageRes.text();
            const match =
              html.match(/<a class="download" href="([^"]+)"/) ||
              html.match(/<img id="img_preview" src="([^"]+)"/);
            if (match && match[1]) {
              return match[1];
            }
          }
        }
      }
    } catch (errTmp) {
      console.warn('تنبيه: محاولة الرفع عبر tmpfiles فشلت:', errTmp);
    }
  } catch (err) {
    console.warn('تنبيه: تعذر رفع الصورة مؤقتاً لتخزينها في أيرتيبل:', err);
  }

  return null;
}

/**
 * تسجيل متدرب جديد في أيرتيبل مع معالجة خيارات التسليم باليد
 */
// قراءة القائمة كاملةً قد تتطلب عدة صفحات؛ احتفظ بها بين طلبات الواجهة
// لتقليل استهلاك الحصة الشهرية. التحديث اليدوي والحفظ يلغيان هذه النسخة.
const OVERVIEW_TTL_MS = 6 * 60 * 60_000;
const MANUAL_REFRESH_MIN_MS = 30_000;
type Overview = { records: any; registrationRecords: any; budget: any; deposits: any };
type AirtableCache = {
  overview: { at: number; promise: Promise<Overview> } | null;
  allRecords: { at: number; promise: Promise<any[]> } | null;
};
const globalCache = globalThis as typeof globalThis & { hawalatAirtableCache?: AirtableCache };
const cache = globalCache.hawalatAirtableCache ||= { overview: null, allRecords: null };

export function getAllAirtableRecords(): Promise<any[]> {
  if (cache.allRecords && Date.now() - cache.allRecords.at < OVERVIEW_TTL_MS) return cache.allRecords.promise;
  const promise = getRecentAirtableRecords(Number.MAX_SAFE_INTEGER);
  cache.allRecords = { at: Date.now(), promise };
  promise.catch(() => {
    if (cache.allRecords?.promise === promise) cache.allRecords = null;
  });
  return promise;
}

function toRegistrationRecords(allRecords: any[]): { fields: Record<string, unknown> }[] {
  return allRecords.map((record: any) => {
    const source = record.fields || {};
    const fields: Record<string, unknown> = {};
    for (const key of [
      'اسم المشترك', 'اسم المتدرب', 'الاسم',
      'بريد الاكتروني', 'البريد الالكتروني', 'البريد الإلكتروني', 'Email', 'email',
      'رقم جوال المشترك', 'رقم الجوال', 'الجوال', 'الهاتف',
    ]) {
      if (source[key] != null) fields[key] = source[key];
    }
    return { fields };
  });
}

export async function getAirtableRegistrationRecords(): Promise<{ fields: Record<string, unknown> }[]> {
  return toRegistrationRecords(await getAllAirtableRecords());
}

export function getAirtableOverview(force = false): Promise<Overview> {
  if (force && (!cache.overview || Date.now() - cache.overview.at >= MANUAL_REFRESH_MIN_MS)) {
    invalidateAirtableOverview();
  }
  if (cache.overview && Date.now() - cache.overview.at < OVERVIEW_TTL_MS) return cache.overview.promise;
  const promise = Promise.all([
    getAllAirtableRecords(),
    getGeneralBudget(),
    getCompanyDeposits(100),
  ]).then(([allRecords, budget, deposits]) => ({
    records: [...allRecords]
      .sort((a, b) => {
        const aTime = Date.parse(String(a.createdTime || a.fields?.['التاريخ'] || '')) || 0;
        const bTime = Date.parse(String(b.createdTime || b.fields?.['التاريخ'] || '')) || 0;
        return bTime - aTime;
      })
      .slice(0, 500),
    registrationRecords: toRegistrationRecords(allRecords),
    budget,
    deposits,
  }));
  cache.overview = { at: Date.now(), promise };
  promise.catch(() => {
    if (cache.overview?.promise === promise) cache.overview = null;
  });
  return promise;
}

export function invalidateAirtableOverview() {
  cache.overview = null;
  cache.allRecords = null;
}

const EDITABLE_TRANSFER_FIELDS = new Set([
  'اسم المرسل', 'اسم المشترك', 'التاريخ',
  'المبلغ الأصلي (قبل العمولة)', 'المبلغ المودع (بعد العمولة)',
  'بريد الاكتروني', 'الحالة', 'رقم الحوالة', 'المحفظة/الاستلام', 'ملاحظات',
]);

export async function updateAirtableTransfer(recordId: string, changes: Record<string, unknown>) {
  if (!/^rec[A-Za-z0-9]{8,32}$/.test(recordId)) throw new Error('معرّف السجل غير صالح');
  if (!TOKEN || !BASE_ID) throw new Error('إعدادات Airtable غير مكتملة');

  const fields: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(changes)) {
    if (!EDITABLE_TRANSFER_FIELDS.has(name)) throw new Error('حقل غير قابل للتعديل');
    if (name.startsWith('المبلغ')) {
      if ((typeof value !== 'string' && typeof value !== 'number') || value === '') throw new Error('المبلغ غير صالح');
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) throw new Error('المبلغ غير صالح');
      fields[name] = amount;
    } else {
      if (typeof value !== 'string' || value.length > 2000) throw new Error('قيمة الحقل غير صالحة');
      const trimmed = value.trim();
      if ((name === 'اسم المشترك' || name === 'اسم المرسل') && !trimmed) throw new Error('الاسم مطلوب');
      if (name === 'التاريخ' && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) throw new Error('التاريخ غير صالح');
      if (name === 'المحفظة/الاستلام' && !['كاش (يدوي)', 'زين كاش'].includes(trimmed)) throw new Error('طريقة الاستلام غير صالحة');
      fields[name] = trimmed;
    }
  }
  if (Object.keys(fields).length === 0) throw new Error('لا توجد تغييرات للحفظ');

  const response = await airtableFetch(`${AIRTABLE_API_URL}/${BASE_ID}/${TABLE_NAME}/${recordId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
    cache: 'no-store',
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const type = detail?.error?.type;
    throw new Error(type === 'INVALID_MULTIPLE_CHOICE_OPTIONS'
      ? 'القيمة المختارة غير متاحة في خيارات Airtable'
      : `تعذر حفظ التعديل في Airtable (${response.status})`);
  }
  invalidateAirtableOverview();
  return response.json();
}

export async function createAirtableRecord(data: AirtableRecordData) {
  // قاعدة الاستثناء: حوالات التسليم باليد لا تسجل في أيرتيبل
  if (data.isAishaHandDelivery) {
    return {
      success: true,
      skipped: true,
      message: 'تم استثناء الحوالة من التسجيل في أيرتيبل لأنها تسليم باليد حسب القاعدة المعتمدة.',
    };
  }

  // التحقق من التكرار والمطابقة (بالإيميل أو بالاسم فقط - تكرار رقم الحوالة مسموح تماماً)
  const duplicateCheck = await checkAirtableDuplicate(undefined, data.participantName, data.email);
  if (duplicateCheck.isDuplicate) {
    return {
      success: true,
      alreadyExists: true,
      record: duplicateCheck.existingRecord,
      message: `المشترك مسجل بالفعل مسبقاً في أيرتيبل بناءً على مطابقة ${duplicateCheck.matchedBy || 'البيانات'}. تم اعتماد وتأكيد السجل.`,
    };
  }

  // تجهيز مرفقات أيرتيبل (تأخذ صورة الوصل الحقيقية + صورة بطاقة البيانات المشبوكة معاً)
  const attachments: { url: string; filename: string }[] = [];

  // 1. رفع وتضمين صورة الوصل الحقيقية (صورة أو مستند PDF)
  if (data.receiptUrl) {
    const isPdf =
      data.receiptUrl.toLowerCase().includes('.pdf') ||
      (data.receiptFilename && data.receiptFilename.toLowerCase().endsWith('.pdf'));
    const defaultExt = isPdf ? '.pdf' : '.jpg';
    const effectiveFilename =
      data.receiptFilename ||
      `receipt_${(data.participantName || 'slip').replace(/\s+/g, '_')}${defaultExt}`;

    const hostedReceiptUrl = await uploadToTemporaryHost(
      data.receiptUrl,
      effectiveFilename
    );
    if (hostedReceiptUrl) {
      attachments.push({
        url: hostedReceiptUrl,
        filename: effectiveFilename,
      });
    }
  }

  // 2. رفع وتضمين صورة بطاقة البيانات المشبوكة مع الوصل
  if (data.dataCardUrl) {
    const hostedCardUrl = await uploadToTemporaryHost(
      data.dataCardUrl,
      `data_card_${(data.participantName || 'details').replace(/\s+/g, '_')}.png`
    );
    if (hostedCardUrl) {
      attachments.push({
        url: hostedCardUrl,
        filename: `data_card_${(data.participantName || 'details').replace(/\s+/g, '_')}.png`,
      });
    }
  }

  // 3. أي مرفقات إضافية ممررة
  if (data.additionalReceiptUrls && Array.isArray(data.additionalReceiptUrls)) {
    for (let i = 0; i < data.additionalReceiptUrls.length; i++) {
      const extra = data.additionalReceiptUrls[i];
      const hostedExtra = await uploadToTemporaryHost(extra.url, extra.filename || `extra_${i + 1}.jpg`);
      if (hostedExtra) {
        attachments.push({
          url: hostedExtra,
          filename: extra.filename || `extra_${i + 1}.jpg`,
        });
      }
    }
  }

  const buildFields = (batchValue?: string, overrideSanitize: boolean = false) => {
    // التأكد من أن اسم المرسل ليس رقم هاتف أو مجرد أرقام
    const isSenderPhone =
      !data.senderName ||
      /^\+?\d[\d\s\-\(\)]+$/.test(String(data.senderName).trim()) ||
      String(data.senderName).replace(/\D/g, '').length >= 5;

    const resolvedSenderName = isSenderPhone
      ? data.participantName
      : (data.senderName || data.participantName);

    // الخيارات المعرفة مسبقاً في قائمة Single Select لجدول أيرتيبل
    const ALLOWED_AIRTABLE_COUNTRIES = ['فلسطين', 'لبنان', 'فرنسا', 'الاردن'];
    let resolvedCountry: string | undefined = undefined;
    let extraCountryNote = '';

    if (!overrideSanitize && data.country) {
      const c = data.country.trim();
      const norm = c === 'الأردن' ? 'الاردن' : c;
      if (ALLOWED_AIRTABLE_COUNTRIES.includes(norm)) {
        resolvedCountry = norm;
      } else {
        extraCountryNote = `[البلد: ${c}]`;
      }
    } else if (!overrideSanitize) {
      resolvedCountry = 'فلسطين';
    }

    // تجهيز الملاحظات مع حفظ البلد والبيانات التي قد لا تتوفر كخيار منسدل
    let finalNotes = (data.notes || '').trim();
    if (extraCountryNote && !finalNotes.includes(extraCountryNote)) {
      finalNotes = finalNotes ? `${finalNotes} - ${extraCountryNote}` : extraCountryNote;
    }

    // احتفظ برقم الدفعة في الملاحظات كذلك إذا كان حقل الاختيار في Airtable مقيّداً.
    let resolvedBatch: string | undefined = undefined;
    if (batchValue) {
      const batchNote = `[الدفعة: ${batchValue}]`;
      if (!finalNotes.includes(batchNote)) finalNotes = finalNotes ? `${finalNotes} - ${batchNote}` : batchNote;
      if (!overrideSanitize) resolvedBatch = batchValue;
    }

    // المحفظة / الاستلام: المتوفر في أيرتيبل "كاش (يدوي)" أو "زين كاش"
    let resolvedWallet = 'كاش (يدوي)';
    if (data.walletMethod && (data.walletMethod.includes('زين كاش') || data.walletMethod === 'زين كاش')) {
      resolvedWallet = 'زين كاش';
    } else if (data.walletMethod && data.walletMethod !== 'كاش (يدوي)') {
      const walletNote = `[المحفظة: ${data.walletMethod}]`;
      if (!finalNotes.includes(walletNote)) {
        finalNotes = finalNotes ? `${finalNotes} - ${walletNote}` : walletNote;
      }
    }

    const f: Record<string, any> = {
      'اسم المرسل': resolvedSenderName,
      'اسم المشترك': data.participantName,
      'التاريخ': normalizeDateToISO(data.date),
      'المبلغ الأصلي (قبل العمولة)': Number(data.originalAmount) || 85,
      'المبلغ المودع (بعد العمولة)': Number(data.depositedAmount) || Number(data.originalAmount) || 85,
      'بريد الاكتروني': data.email,
      'الحالة': data.status || 'تم التاكيد',
      'رقم الحوالة': data.transferNumber || '',
      'المحفظة/الاستلام': resolvedWallet,
      'الميزانية العامة': ['recpPvxMTawfixv2J'],
    };

    if (resolvedCountry) {
      f['البلد'] = resolvedCountry;
    }

    if (resolvedBatch) {
      f['رقم  الدفعة '] = resolvedBatch;
    }

    if (finalNotes) {
      f['ملاحظات'] = finalNotes;
    }

    if (attachments.length > 0) {
      f['صورة الوصل'] = attachments;
    }

    return f;
  };

  // المحاولة الأولى: إرسال الحقول المعالجة والمتوافقة مع قيود أيرتيبل
  const currentBatch = getCurrentBatchNumber();
  let fieldsToSend = buildFields(currentBatch);

  let res = await airtableFetch(`${AIRTABLE_API_URL}/${BASE_ID}/${TABLE_NAME}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: fieldsToSend, typecast: true }),
  });

  // إذا فشل بسبب أي قيود مفاجئة على الخيارات المنسدلة في أيرتيبل
  if (!res.ok) {
    const errorText = await res.text();
    console.warn('تنبيه أيرتيبل عند المحاولة الأولى:', errorText);

    if (errorText.includes('INVALID_MULTIPLE_CHOICE_OPTIONS')) {
      // المحاولة الثانية: استبعاد حقول القوائم المنسدلة المقيدة ونقل قيمها للملاحظات لضمان قبول السجل 100%
      const sanitizedFields = buildFields(currentBatch, true);
      if (data.country && !sanitizedFields['ملاحظات']?.includes(data.country)) {
        sanitizedFields['ملاحظات'] = sanitizedFields['ملاحظات']
          ? `${sanitizedFields['ملاحظات']} - [البلد: ${data.country}]`
          : `[البلد: ${data.country}]`;
      }
      delete sanitizedFields['البلد'];
      delete sanitizedFields['رقم  الدفعة '];
      sanitizedFields['المحفظة/الاستلام'] = 'كاش (يدوي)';

      res = await airtableFetch(`${AIRTABLE_API_URL}/${BASE_ID}/${TABLE_NAME}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: sanitizedFields }),
      });
    } else {
      return {
        success: false,
        error: `فشل الحفظ في أيرتيبل: ${errorText}`,
      };
    }
  }

  if (!res.ok) {
    const errorText = await res.text();
    return {
      success: false,
      error: `فشل الحفظ في أيرتيبل: ${errorText}`,
    };
  }

  const result = await res.json();
  return {
    success: true,
    record: result,
  };
}

/**
 * جلب أرقام الميزانية العامة مباشرة من جدول "الميزانية العامة" في أيرتيبل
 * (إجمالي المستلم، إجمالي المدفوع، المتبقي للشركة)
 */
export async function getGeneralBudget(): Promise<{
  totalReceived: number;
  totalPaid: number;
  companyRemaining: number;
  accountName?: string;
}> {
  const url = `${AIRTABLE_API_URL}/${BASE_ID}/${encodeURIComponent('الميزانية العامة')}?maxRecords=1`;
  const res = await airtableFetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  if (!res.ok) throw await airtableReadError(res, 'خطأ في جلب الميزانية العامة من أيرتيبل');

  const data = await res.json();
  const record = data.records?.[0]?.fields;
  if (!record) throw new Error('لم تُرجع Airtable بيانات الميزانية العامة');
  const totalReceived = Number(record['إجمالي المستلم'] ?? record['اجمالي المستلم']);
  const totalPaid = Number(record['إجمالي المدفوع'] ?? record['اجمالي المدفوع']);
  const companyRemaining = Number(record['المتبقي للشركة']);
  if (![totalReceived, totalPaid, companyRemaining].every(Number.isFinite)) {
    throw new Error('بيانات الميزانية العامة غير مكتملة في Airtable');
  }
  return { totalReceived, totalPaid, companyRemaining, accountName: record['Name'] || 'الحساب الرئيسي' };
}

export interface CompanyDepositData {
  amount: number;
  date: string;
  receiptUrl?: string;
  receiptFilename?: string;
  receiptBase64?: string;
  notes?: string;
}

/**
 * جلب سجل مدفوعات وإيداعات المندوب للشركة من جدول "مدفوعات المندوب للشركة" في أيرتيبل
 */
export async function getCompanyDeposits(limit: number = 100) {
  const url = `${AIRTABLE_API_URL}/${BASE_ID}/${encodeURIComponent('مدفوعات المندوب للشركة')}?maxRecords=${limit}&sort%5B0%5D%5Bfield%5D=%D8%AA%D8%A7%D8%B1%D9%8A%D8%AE%20%D8%A7%D9%84%D8%AF%D9%81%D8%B9&sort%5B0%5D%5Bdirection%5D=desc`;
  const res = await airtableFetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  if (!res.ok) throw await airtableReadError(res, 'خطأ في جلب مدفوعات الشركة من أيرتيبل');

  const json = await res.json();
  return (json.records || []).map((r: any) => ({
      id: r.id,
      amount: Number(r.fields?.['المبلغ المدفوع'] || 0),
      date: r.fields?.['تاريخ الدفع'] || '',
      receipt: r.fields?.['وصل الدفع']?.[0] || null,
      budgetRecordId: r.fields?.['الميزانية العامة']?.[0] || 'recpPvxMTawfixv2J',
      createdTime: r.createdTime,
  }));
}

/**
 * تسجيل وتوثيق إيداع جديد للشركة في جدول "مدفوعات المندوب للشركة"
 */
export async function createCompanyDeposit(data: CompanyDepositData) {
  try {
    const attachments: { url: string; filename: string }[] = [];
    const imageSrc = data.receiptBase64 || data.receiptUrl;

    if (imageSrc) {
      const hostedUrl = await uploadToTemporaryHost(
        imageSrc,
        data.receiptFilename || `company_deposit_${Date.now()}.jpg`
      );
      if (hostedUrl) {
        attachments.push({
          url: hostedUrl,
          filename: data.receiptFilename || `deposit_${Date.now()}.jpg`,
        });
      }
    }

    const fieldsToSend: Record<string, any> = {
      'الميزانية العامة': ['recpPvxMTawfixv2J'],
      'المبلغ المدفوع': Number(data.amount),
      'تاريخ الدفع': normalizeDateToISO(data.date),
    };

    if (attachments.length > 0) {
      fieldsToSend['وصل الدفع'] = attachments;
    }

    const res = await airtableFetch(`${AIRTABLE_API_URL}/${BASE_ID}/${encodeURIComponent('مدفوعات المندوب للشركة')}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: fieldsToSend }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        success: false,
        error: `فشل تسجيل إيداع الشركة في أيرتيبل: ${errorText}`,
      };
    }

    const result = await res.json();
    invalidateAirtableOverview();
    const updatedBudget = await getGeneralBudget();

    return {
      success: true,
      record: result,
      budget: updatedBudget,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'خطأ غير متوقع أثناء حفظ الإيداع في أيرتيبل',
    };
  }
}

export async function updateCompanyDeposit(recordId: string, data: { amount: number; date: string; receiptBase64?: string; receiptFilename?: string }) {
  if (!/^rec[A-Za-z0-9]{8,32}$/.test(recordId)) throw new Error('معرّف الإيداع غير صالح');
  if (!TOKEN || !BASE_ID) throw new Error('إعدادات Airtable غير مكتملة');
  if (!Number.isFinite(data.amount) || data.amount <= 0 || data.amount > 100_000_000) throw new Error('المبلغ غير صالح');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error('التاريخ غير صالح');

  const fields: Record<string, unknown> = {
    'المبلغ المدفوع': data.amount,
    'تاريخ الدفع': normalizeDateToISO(data.date),
  };
  if (data.receiptBase64) {
    const filename = data.receiptFilename || `company_deposit_${Date.now()}.jpg`;
    const hostedUrl = await uploadToTemporaryHost(data.receiptBase64, filename);
    if (!hostedUrl) throw new Error('تعذر رفع صورة الوصل');
    fields['وصل الدفع'] = [{ url: hostedUrl, filename }];
  }

  const response = await airtableFetch(`${AIRTABLE_API_URL}/${BASE_ID}/${encodeURIComponent('مدفوعات المندوب للشركة')}/${recordId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`تعذر تعديل الإيداع في Airtable (${response.status})`);
  const record = await response.json();
  invalidateAirtableOverview();
  const budget = await getGeneralBudget();
  return { record, budget };
}
