/**
 * أداة توليد صورة بطاقة رسالة واتساب (WhatsApp Dark Green Outgoing Bubble)
 * مطابقة تماماً للمظهر الأصلي لرسائل الحوالات في واتساب (باللون الأخضر الداكن، التنسيق، الرابط الأخضر، وعلامة المحولة)
 */

export interface ReceiptCardData {
  participantName?: string;
  transferNumber?: string;
  amount?: number | string;
  currency?: string;
  paymentDate?: string;
  phone?: string;
  cleanPhone?: string;
  email?: string;
  gender?: string;
  age?: string;
  senderName?: string;
  coordinatorName?: string;
  rawText?: string;
  isAishaHandDelivery?: boolean;
  batch?: string;
}

export function generateReceiptCardDataUrl(data: ReceiptCardData): string {
  if (typeof window === 'undefined') return '';

  // تجهيز سطور الرسالة تماماً كما وردت في واتساب
  let textLines: string[] = [];
  if (data.rawText) {
    textLines = data.rawText.split(/\r?\n/).map((l) => l.trim());
  } else {
    const isAisha = data.isAishaHandDelivery;
    const phoneVal = data.phone || data.cleanPhone || '';
    const formattedPhone = phoneVal.startsWith('+')
      ? phoneVal
      : phoneVal.startsWith('970') || phoneVal.startsWith('972')
      ? `+${phoneVal}`
      : phoneVal;

    textLines = [
      'اسم المشترك ثلاثي:',
      data.participantName || '',
      `عمر المشترك: ${data.age || '12'}`,
      `الجنس (ذكر/انثى): ${data.gender || 'ذكر'}`,
      'اسم مرسل الحوالة:',
      data.senderName && data.senderName !== data.participantName ? data.senderName : '',
      'رقم جوال المشترك:',
      formattedPhone,
      'مع مقدمة الدوله:',
      'البريد الإلكتروني',
      data.email || '',
      'قيمة الرسوم للمشترك:',
      `${data.amount || 85} ${data.currency === 'USD' ? 'دولار' : data.currency === 'ILS' ? 'شيكل' : data.currency === 'SAR' ? 'ريال' : data.currency === 'AED' ? 'درهم' : 'دينار'}`,
      `نوع الحوالة: ${isAisha ? 'استلام باليد (كاش)' : 'مصرفية'}`,
      data.transferNumber ? `رقم الحوالة: ${data.transferNumber}` : '',
      `تاريخ السداد:${data.paymentDate || ''}`,
      `اسم المنسق: ${data.coordinatorName || ''}`,
      isAisha ? 'تم التسليم باليد' : `تم التحويل للمندوب دفعة ${data.batch || ''}`,
    ].filter((l) => l !== undefined && l !== null);
  }

  // فلترة الأسطر الفارغة المتتالية
  const cleanedLines: string[] = [];
  for (let i = 0; i < textLines.length; i++) {
    const curr = textLines[i];
    if (!curr && i > 0 && !textLines[i - 1]) continue;
    cleanedLines.push(curr);
  }

  const canvas = document.createElement('canvas');
  const width = 560;
  const paddingX = 26;
  const lineHeight = 28;
  const topHeaderHeight = 44;
  const bottomFooterHeight = 36;

  const contentHeight = cleanedLines.length * lineHeight;
  const height = topHeaderHeight + contentHeight + bottomFooterHeight;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 1. خلفية الفقاعة الخضراء الداكنة لواتساب (WhatsApp Dark Green Outgoing Bubble)
  ctx.fillStyle = '#10382b';
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, 14);
  ctx.fill();

  // 2. علامة الرسالة المحولة أعلى اليسار: ↪ Forwarded
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.font = 'italic 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#8aa296';
  ctx.fillText('↪  Forwarded', paddingX, 26);

  // 3. كتابة أسطر الرسالة (RTL)
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';

  let curY = topHeaderHeight + 20;

  cleanedLines.forEach((line) => {
    if (!line) {
      curY += lineHeight * 0.5;
      return;
    }

    const isPhone = line.includes('+') || /^\+?[\d\s\-]{8,}$/.test(line.trim());
    const isEmail = line.includes('@') && line.includes('.');
    const isBoldValue =
      line.includes('85') ||
      (data.participantName && line.includes(data.participantName)) ||
      line.includes('دينار') ||
      line.includes('مصرفية');

    if (isPhone) {
      // رقم الهاتف بلون أخضر واتساب الفاتح المميز
      ctx.fillStyle = '#00d287';
      ctx.font = 'bold 16.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillText(line, width - paddingX, curY);
    } else if (isEmail) {
      // البريد الإلكتروني بالأخضر الفاتح مع خط سفلي تشعبي
      ctx.fillStyle = '#00d287';
      ctx.font = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillText(line, width - paddingX, curY);

      // رسم خط سفلي
      const metrics = ctx.measureText(line);
      const emailRightX = width - paddingX;
      ctx.strokeStyle = '#00d287';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(emailRightX, curY + 3);
      ctx.lineTo(emailRightX - metrics.width, curY + 3);
      ctx.stroke();
    } else if (isBoldValue) {
      // القيم الأساسية باللون الأبيض العريض
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillText(line, width - paddingX, curY);
    } else {
      // العناوين والنصوص العادية بلون أبيض ناصع/رمادي فاتح
      ctx.fillStyle = '#e9edef';
      ctx.font = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillText(line, width - paddingX, curY);
    }

    curY += lineHeight;
  });

  // 4. وقت الإرسال وعلامات الصح المزدوجة أسفل اليمين
  const footerY = height - 14;
  ctx.direction = 'ltr';
  ctx.textAlign = 'right';
  ctx.font = '11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillStyle = '#8696a0';
  ctx.fillText('1:23 PM  ✓✓', width - paddingX, footerY);

  return canvas.toDataURL('image/jpeg', 0.95);
}
