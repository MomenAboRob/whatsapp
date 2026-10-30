/**
 * معالجة وتنسيق التواريخ لضمان توافقها التام مع أيرتيبل وبوابة المشتركين
 * أيرتيبل يشترط صيغة YYYY-MM-DD بدقة لأي حقل من نوع Date
 */

// تنسيق التاريخ بالتوقيت المحلي (toISOString يحول لتوقيت UTC فيرجع يوماً للخلف بعد منتصف الليل)
function toLocalISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function normalizeDateToISO(rawDate?: string | null): string {
  const todayISO = toLocalISO(new Date());
  if (!rawDate || typeof rawDate !== 'string') {
    return todayISO;
  }

  // 1. تحويل الأرقام العربية الهندية (١، ٢، ٣...) والفارسية إلى أرقام إنجليزية (1, 2, 3...)
  let clean = rawDate
    .trim()
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());

  // إزالة أي وقت إضافي إذا وُجد مثل 2026-09-14T10:00:00Z
  if (clean.includes('T')) {
    clean = clean.split('T')[0];
  }

  // 2. فحص نمط DD/MM/YYYY أو D/M/YYYY أو DD-MM-YYYY (الشائع جداً في رسائل الواتساب مثل 14/9/2026)
  const dmyMatch = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = dmyMatch[3];

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    // صيغة أمريكية MM/DD/YYYY (مثل 8/17/2026) عندما يكون الرقم الثاني أكبر من 12
    if (month > 12 && month <= 31 && day >= 1 && day <= 12) {
      return `${year}-${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}`;
    }
  }

  // 3. فحص نمط YYYY/MM/DD أو YYYY-MM-DD
  const ymdMatch = clean.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 4. فحص نمط تاريخ مدمج داخل نص (مثل "بتاريخ 14/9/2026 تم الإيداع")
  const embeddedMatch = clean.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (embeddedMatch) {
    const day = parseInt(embeddedMatch[1], 10);
    const month = parseInt(embeddedMatch[2], 10);
    const year = embeddedMatch[3];

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 5. محاولة Date.parse القياسية
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return toLocalISO(parsed);
  }

  return todayISO;
}
