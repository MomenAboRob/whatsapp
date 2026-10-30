export interface QuickReplyTemplate {
  id: string;
  shortcut: string;
  title: string;
  category: 'استلام وتدقيق' | 'إنجاز وصرف' | 'حالات واستفسار' | 'عام';
  content: string;
  usageCount?: number;
}

export const DEFAULT_QUICK_REPLIES: QuickReplyTemplate[] = [
  {
    id: 'qr_receipt_req',
    shortcut: 'وصل',
    title: 'طلب صورة الوصل',
    category: 'استلام وتدقيق',
    content: 'مرحباً {{name}}، يرجى تزويدنا بصورة واضحة لإيصال التحويل البنكي أو سند الإيداع لإتمام المعاملة.',
    usageCount: 15,
  },
  {
    id: 'qr_received_proc',
    shortcut: 'تم_الاستلام',
    title: 'استلام وجاري التدقيق',
    category: 'استلام وتدقيق',
    content: 'أهلاً بك {{name}}، تم استلام بيانات الحوالة بنجاح وجاري تدقيقها ومعالجتها الآن. سنقوم بإشعارك فور اكتمالها.',
    usageCount: 22,
  },
  {
    id: 'qr_missing_info',
    shortcut: 'بيانات_ناقصة',
    title: 'طلب بيانات ناقصة',
    category: 'استلام وتدقيق',
    content: 'مرحباً {{name}}، نرجو تزويدنا بالاسم الرباعي للمستفيد ورقم الهوية ورقم الحساب البنكي لإتمام قيد الحوالة.',
    usageCount: 8,
  },
  {
    id: 'qr_credited',
    shortcut: 'تم_القيد',
    title: 'تم القيد بنجاح',
    category: 'إنجاز وصرف',
    content: 'تم قيد المبلغ بنجاح في حسابك {{name}}، شكراً لتعاملك معنا ونتشرف بخدمتك دائماً.',
    usageCount: 30,
  },
  {
    id: 'qr_ready_pickup',
    shortcut: 'جاهزة',
    title: 'جاهزة للاستلام',
    category: 'إنجاز وصرف',
    content: 'عزيزي {{name}}، الحوالة جاهزة للاستلام الآن من الفرع. يرجى إبراز الهوية الأصلية ورقم المعاملة عند الحضور.',
    usageCount: 12,
  },
  {
    id: 'qr_pending_review',
    shortcut: 'معلقة',
    title: 'حوالة معلقة لدى البنك',
    category: 'حالات واستفسار',
    content: 'أهلاً {{name}}، الحوالة معلقة حالياً لدى البنك/الجهة المحولة للمطابقة، وسنقوم بتحديثك بالنتيجة فور ورودها.',
    usageCount: 9,
  },
  {
    id: 'qr_welcome',
    shortcut: 'ترحيب',
    title: 'ترحيب وخدمة عملاء',
    category: 'عام',
    content: 'مرحباً بك في نظام خدمة الحوالات والصرافة، كيف يمكننا مساعدتك اليوم؟',
    usageCount: 18,
  },
  {
    id: 'qr_work_hours',
    shortcut: 'دوام',
    title: 'أوقات الدوام الرسمي',
    category: 'عام',
    content: 'أوقات العمل الرسمية يومياً من الساعة 9:00 صباحاً حتى 9:00 مساءً ما عدا يوم الجمعة. نسعد بخدمتكم.',
    usageCount: 5,
  },
];

const STORAGE_KEY = 'hawalat_quick_replies_v1';

export function getStoredQuickReplies(): QuickReplyTemplate[] {
  if (typeof window === 'undefined') return DEFAULT_QUICK_REPLIES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_QUICK_REPLIES));
      return DEFAULT_QUICK_REPLIES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_QUICK_REPLIES;
  } catch (e) {
    console.error('Failed to load quick replies from localStorage:', e);
    return DEFAULT_QUICK_REPLIES;
  }
}

export function saveStoredQuickReplies(replies: QuickReplyTemplate[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(replies));
  } catch (e) {
    console.error('Failed to save quick replies to localStorage:', e);
  }
}

export function interpolateQuickReply(
  templateText: string,
  variables: {
    name?: string;
    time?: string;
    date?: string;
    sender?: string;
  }
): string {
  if (!templateText) return '';
  let result = templateText;

  const resolvedName = variables.name && variables.name.trim() ? variables.name.trim() : 'المشترك';
  const now = new Date();
  const resolvedTime =
    variables.time ||
    now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const resolvedDate =
    variables.date ||
    now.toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' });

  result = result.replace(/\{\{\s*name\s*\}\}/gi, resolvedName);
  result = result.replace(/\{\{\s*time\s*\}\}/gi, resolvedTime);
  result = result.replace(/\{\{\s*date\s*\}\}/gi, resolvedDate);
  result = result.replace(/\{\{\s*sender\s*\}\}/gi, variables.sender || 'أنا');

  return result;
}
