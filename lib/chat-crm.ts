export interface CrmTag {
  id: string;
  name: string;
  color: string; // Tailwind color class or hex
  bgClass: string;
  textClass: string;
  borderClass: string;
}

export interface CrmNote {
  id: string;
  text: string;
  author: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ChatCrmRecord {
  tags: string[]; // Tag IDs
  notes: CrmNote[];
  leadStatus?: string;
  customFields?: Record<string, string>;
  updatedAt?: string;
}

export const PRESET_CRM_TAGS: CrmTag[] = [
  {
    id: 'tag_vip',
    name: 'عميل VIP',
    color: '#f59e0b',
    bgClass: 'bg-amber-500/15',
    textClass: 'text-amber-400',
    borderClass: 'border-amber-500/30',
  },
  {
    id: 'tag_pending_transfer',
    name: 'حوالة معلقة',
    color: '#f97316',
    bgClass: 'bg-orange-500/15',
    textClass: 'text-orange-400',
    borderClass: 'border-orange-500/30',
  },
  {
    id: 'tag_waiting_receipt',
    name: 'بانتظار الوصل',
    color: '#0ea5e9',
    bgClass: 'bg-sky-500/15',
    textClass: 'text-sky-400',
    borderClass: 'border-sky-500/30',
  },
  {
    id: 'tag_completed',
    name: 'تم التحويل',
    color: '#10b981',
    bgClass: 'bg-emerald-500/15',
    textClass: 'text-emerald-400',
    borderClass: 'border-emerald-500/30',
  },
  {
    id: 'tag_missing_data',
    name: 'بيانات ناقصة',
    color: '#eab308',
    bgClass: 'bg-yellow-500/15',
    textClass: 'text-yellow-400',
    borderClass: 'border-yellow-500/30',
  },
  {
    id: 'tag_rejected',
    name: 'مرفوض / ملغي',
    color: '#f43f5e',
    bgClass: 'bg-rose-500/15',
    textClass: 'text-rose-400',
    borderClass: 'border-rose-500/30',
  },
  {
    id: 'tag_new_inquiry',
    name: 'استفسار جديد',
    color: '#8b5cf6',
    bgClass: 'bg-purple-500/15',
    textClass: 'text-purple-400',
    borderClass: 'border-purple-500/30',
  },
  {
    id: 'tag_verified',
    name: 'تم التدقيق',
    color: '#06b6d4',
    bgClass: 'bg-cyan-500/15',
    textClass: 'text-cyan-400',
    borderClass: 'border-cyan-500/30',
  },
];

const LOCAL_STORAGE_CRM_KEY = 'hawalat_chat_crm_v1';
const LOCAL_STORAGE_TAGS_KEY = 'hawalat_crm_custom_tags_v1';

export function getStoredCrmData(): Record<string, ChatCrmRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CRM_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Failed to parse CRM data from localStorage:', e);
    return {};
  }
}

export function saveStoredCrmData(data: Record<string, ChatCrmRecord>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_CRM_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save CRM data to localStorage:', e);
  }
}

export function getStoredTags(): CrmTag[] {
  if (typeof window === 'undefined') return PRESET_CRM_TAGS;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_TAGS_KEY);
    if (!raw) return PRESET_CRM_TAGS;
    const custom: CrmTag[] = JSON.parse(raw);
    if (Array.isArray(custom) && custom.length > 0) {
      // دمج الافتراضيات مع المخصصة
      const map = new Map<string, CrmTag>();
      PRESET_CRM_TAGS.forEach((t) => map.set(t.id, t));
      custom.forEach((t) => map.set(t.id, t));
      return Array.from(map.values());
    }
    return PRESET_CRM_TAGS;
  } catch {
    return PRESET_CRM_TAGS;
  }
}

export function saveStoredTags(tags: CrmTag[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_TAGS_KEY, JSON.stringify(tags));
  } catch (e) {
    console.error('Failed to save custom tags to localStorage:', e);
  }
}
