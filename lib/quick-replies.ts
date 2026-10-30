export interface QuickReplyTemplate {
  id: string;
  shortcut: string;
  title: string;
  category: 'عام' | 'معلومات' | 'متابعة' | 'ردود';
  content: string;
  usageCount?: number;
}

export const DEFAULT_QUICK_REPLIES: QuickReplyTemplate[] = [];

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
      return parsed.filter((reply: QuickReplyTemplate) =>
        !/airtable|أيرتيبل|ايرتيبل|حوال[ةات]/i.test(
          `${reply.title || ''} ${reply.shortcut || ''} ${reply.content || ''}`
        )
      ).map((reply: QuickReplyTemplate) => ({
        ...reply,
        category: (['عام', 'معلومات', 'متابعة', 'ردود'].includes(reply.category)
          ? reply.category : 'عام') as QuickReplyTemplate['category'],
      }));
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

  const resolvedName = variables.name && variables.name.trim() ? variables.name.trim() : 'جهة الاتصال';
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
