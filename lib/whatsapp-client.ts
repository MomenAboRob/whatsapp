import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import QRCode from 'qrcode';
import { normalizeMessageContent } from '@whiskeysockets/baileys';
import { getAuthUserFromRequest } from '@/lib/auth';

const isConversationJid = (jid?: string) => !jid || (!jid.endsWith('@broadcast') && !jid.endsWith('@newsletter'));
const unwrapMessageContent = <T>(content: T): T =>
  normalizeMessageContent(content as Parameters<typeof normalizeMessageContent>[0]) as T;

const isViewOnceMessage = (message: any): boolean => {
  let content = message;
  for (let depth = 0; content && depth < 5; depth++) {
    if (content.viewOnceMessage || content.viewOnceMessageV2 || content.viewOnceMessageV2Extension ||
        content.imageMessage?.viewOnce || content.videoMessage?.viewOnce || content.audioMessage?.viewOnce) {
      return true;
    }
    content = content.ephemeralMessage?.message || content.documentWithCaptionMessage?.message ||
      content.editedMessage?.message || content.associatedChildMessage?.message;
  }
  return false;
};

const viewOnceNotice = (fromMe: boolean): string => fromMe
  ? 'أرسلت رسالة للعرض مرة واحدة من جهاز آخر'
  : 'رسالة للعرض مرة واحدة';

// واجهة الرسائل المعالجة
export interface MemberReceipt {
  deliveredAt?: number;
  readAt?: number;
}

// بيانات نافذة "معلومات الرسالة" (مثل Message info في واتساب)
export interface MessageInfoPerson {
  jid: string;
  name: string;
  avatarUrl?: string;
  at?: number;
}

// عضو قروب لقائمة المنشن (@)
export interface GroupParticipantInfo {
  jid: string;
  name: string;
  avatarUrl?: string;
  phone?: string;
  isAdmin?: boolean;
}

export interface MessageInfo {
  isGroup: boolean;
  deliveryStatus?: ChatMessage['deliveryStatus'];
  deliveredAt?: number;
  readAt?: number;
  readBy: MessageInfoPerson[];
  deliveredTo: MessageInfoPerson[];
  readRemaining: number;
  deliveredRemaining: number;
  totalMembers: number | null;
}

export interface ChatInfoResult {
  id: string;
  name: string;
  isGroup: boolean;
  avatarUrl?: string;
  phone?: string;
  description?: string;
  creationDate?: number;
  createdBy?: { jid: string; name: string };
  participantsCount: number;
  participants: GroupParticipantInfo[];
  mediaSummary: {
    totalMedia: number;
    imagesCount: number;
    videosCount: number;
    docsCount: number;
    audioCount: number;
    recentMedia: {
      id: string;
      mediaUrl: string;
      mediaType: string;
      fileName?: string;
      timestamp: string;
      timestampMs?: number;
    }[];
  };
}

export interface ChatMessage {
  id: string;
  clientRequestId?: string;
  sender: string;
  senderName?: string;
  text: string;
  timestamp: string;
  timestampMs?: number;
  isForwarded?: boolean;
  // مرسل الرسالة في القروبات وصورته (تُضاف فقط في النسخة المرسلة للواجهة)
  senderJid?: string;
  senderAvatarUrl?: string;
  hasMedia?: boolean;
  isViewOnce?: boolean;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'voice' | 'sticker' | 'document';
  mediaDuration?: number;
  fileName?: string;
  fileSize?: number;
  chatJid?: string;
  chatName?: string;
  isDemo?: boolean;
  isFromMe?: boolean;
  read?: boolean;
  deliveryStatus?: 'pending' | 'sent' | 'delivered' | 'read';
  // وقت التسليم والقراءة للمحادثات الخاصة (بالمللي ثانية)
  deliveredAt?: number;
  readAt?: number;
  // وقت تسليم وقراءة كل عضو في القروب على حدة (للرسائل الصادرة في المجموعات)
  receiptsBy?: Record<string, MemberReceipt>;
  ack?: number;
  status?: {
    portal?: boolean;
    portalSubmitted?: boolean;
    airtable?: boolean;
    airtableSaved?: boolean;
    forwardedTo?: string;
    isReceived?: boolean;
    registered?: boolean;
    read?: boolean;
    linkedImageUrl?: string;
    autoLinkSuppressed?: boolean;
  };
  linkedReceiptUrl?: string;
  linkedMsgId?: string;
  rawBaileysMessage?: any;
  quotedMessage?: {
    id: string;
    sender: string;
    senderName?: string;
    text?: string;
    hasMedia?: boolean;
    mediaUrl?: string;
  };
  reactions?: {
    text: string;
    sender: string;
    senderName?: string;
    isFromMe?: boolean;
    timestampMs?: number;
  }[];
  isEdited?: boolean;
  editedAt?: number;
  originalText?: string;
  isDeleted?: boolean;
  deletedAt?: number;
}

export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  const clean = String(phone).replace(/\D/g, '');
  if (!clean) return phone;
  // الأردن (+962)
  if (clean.startsWith('962') && clean.length >= 11) {
    return `+962 ${clean.slice(3, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
  }
  // فلسطين وإسرائيل (+970 / +972)
  if ((clean.startsWith('970') || clean.startsWith('972')) && clean.length >= 11) {
    const code = clean.slice(0, 3);
    return `+${code} ${clean.slice(3, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
  }
  // السعودية (+966)
  if (clean.startsWith('966') && clean.length >= 11) {
    return `+966 ${clean.slice(3, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
  }
  // مصر (+20)
  if (clean.startsWith('20') && clean.length >= 11) {
    return `+20 ${clean.slice(2, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
  }
  // المغرب (+212)
  if (clean.startsWith('212') && clean.length >= 11) {
    return `+212 ${clean.slice(3, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
  }
  // تركيا (+90)
  if (clean.startsWith('90') && clean.length >= 11) {
    return `+90 ${clean.slice(2, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
  }
  // سوريا (+963)
  if (clean.startsWith('963') && clean.length >= 11) {
    return `+963 ${clean.slice(3, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
  }
  // العراق (+964)
  if (clean.startsWith('964') && clean.length >= 11) {
    return `+964 ${clean.slice(3, 6)} ${clean.slice(6, 9)} ${clean.slice(9)}`;
  }
  // الإمارات (+971)
  if (clean.startsWith('971') && clean.length >= 11) {
    return `+971 ${clean.slice(3, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
  }
  // تونس (+216)
  if (clean.startsWith('216') && clean.length >= 10) {
    return `+216 ${clean.slice(3, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
  }
  // عمان (+968)
  if (clean.startsWith('968') && clean.length >= 10) {
    return `+968 ${clean.slice(3, 5)} ${clean.slice(5, 7)} ${clean.slice(7)}`;
  }
  if (clean.length >= 10) {
    return `+${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }
  return `+${clean}`;
}

export interface WhatsAppGroupItem {
  id: string;
  name: string;
  unreadCount?: number;
  isGroup?: boolean;
  avatarUrl?: string;
  phone?: string;
  archived?: boolean;
}

export interface WhatsAppPresence {
  jid: string;
  participant: string;
  state: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused';
  lastSeen?: number;
  updatedAt: number;
}

export class WhatsAppManager {
  public readonly userId: string;
  public readonly events: EventEmitter = new EventEmitter();
  private sock: any = null;
  private qrCodeDataUrl: string | null = null;
  private connectionStatus: 'DISCONNECTED' | 'SCAN_QR' | 'CONNECTING' | 'CONNECTED' = 'DISCONNECTED';
  private incomingMessages: ChatMessage[] = [];
  private userGroups: WhatsAppGroupItem[] = [];
  private presences = new Map<string, Map<string, WhatsAppPresence>>();
  private presenceSubscriptions = new Map<string, number>();
  private connectedUser: { name: string; phone: string; jid: string } | null = null;
  public authDir: string;
  private messagesFilePath: string;
  private groupsFilePath: string;
  private contactsFilePath: string;
  private avatarsFilePath: string;
  private avatarsDir: string;
  private mediaDir: string;
  private mediaDownloadsInFlight: Map<string, Promise<string | undefined>> = new Map();
  private emitGroupsDebounceTimer: NodeJS.Timeout | null = null;
  private contactsMap: Record<string, string> = {};
  private lidToPhoneMap: Record<string, string> = {};
  private phoneToLidMap: Record<string, string> = {};
  private avatarsMap: Record<string, string> = {};
  private pendingReactionsMap: Map<string, any[]> = new Map();
  private revokedMessageIds: Set<string> = new Set();
  private isConnecting: boolean = false;
  private isSyncingAvatars: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private lastGroupFetchTime: number = 0;
  private appStateKeys: any = null;
  private lastArchiveSnapshotTime: number = 0;
  private archiveSnapshotRevision: number = 0;
  public lastArchiveSyncError: string | null = null;
  public lastArchiveSyncStatus: string = 'pending';
  private lockFilePath: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private instanceId: string = Math.random().toString(36).substring(2, 9);

  private acquireLock(): boolean {
    try {
      if (fs.existsSync(this.lockFilePath)) {
        try {
          const lockContent = fs.readFileSync(this.lockFilePath, 'utf-8');
          const lockData = JSON.parse(lockContent);
          const age = Date.now() - (lockData.timestamp || 0);
          if (lockData.instanceId === this.instanceId || lockData.pid === process.pid) {
            return true;
          }
          // التحقق مما إذا كانت العملية السابقة ما تزال نشطة على مستوى النظام
          let isPidAlive = false;
          if (lockData.pid) {
            try {
              process.kill(lockData.pid, 0);
              isPidAlive = true;
            } catch (e: any) {
              isPidAlive = e.code !== 'ESRCH';
            }
          }
          // إذا كانت العملية السابقة ما تزال حية والقفل نشط، نتجنب فتح اتصال مكرر
          if (isPidAlive && age < 15000) {
            return false;
          }
        } catch (e) {}
      }

      fs.writeFileSync(
        this.lockFilePath,
        JSON.stringify({ pid: process.pid, instanceId: this.instanceId, timestamp: Date.now() }),
        'utf-8'
      );

      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = setInterval(() => {
        try {
          if (fs.existsSync(this.lockFilePath)) {
            const cur = JSON.parse(fs.readFileSync(this.lockFilePath, 'utf-8'));
            if (cur.instanceId === this.instanceId) {
              fs.writeFileSync(
                this.lockFilePath,
                JSON.stringify({ pid: process.pid, instanceId: this.instanceId, timestamp: Date.now() }),
                'utf-8'
              );
            }
          }
        } catch (e) {}
      }, 5000);

      return true;
    } catch (e) {
      return true;
    }
  }

  private releaseLock(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    try {
      if (fs.existsSync(this.lockFilePath)) {
        const cur = JSON.parse(fs.readFileSync(this.lockFilePath, 'utf-8'));
        if (cur.instanceId === this.instanceId) {
          fs.unlinkSync(this.lockFilePath);
        }
      }
    } catch (e) {}
  }

  private constructor(userId: string = 'recmrgqBhC2YImlC0') {
    this.userId = userId || 'recmrgqBhC2YImlC0';
    const cleanId = this.userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const baseAuthDir = path.join(process.cwd(), 'whatsapp_auth');
    this.authDir = path.join(baseAuthDir, `user_${cleanId}`);

    if (!fs.existsSync(baseAuthDir)) {
      try {
        fs.mkdirSync(baseAuthDir, { recursive: true });
      } catch (e) {}
    }

    if (!fs.existsSync(this.authDir)) {
      try {
        fs.mkdirSync(this.authDir, { recursive: true });
      } catch (e) {}
    }

    // هجرة جلسة المستخدم الأساسي الحالية من المجلد الجذري إلى مجلد المستخدم الخاص لضمان بقاء الاتصال
    const userCreds = path.join(this.authDir, 'creds.json');
    const rootCreds = path.join(baseAuthDir, 'creds.json');
    if (!fs.existsSync(userCreds) && fs.existsSync(rootCreds) && (cleanId === 'recmrgqBhC2YImlC0' || cleanId === 'default')) {
      try {
        const rootFiles = fs.readdirSync(baseAuthDir);
        for (const file of rootFiles) {
          const src = path.join(baseAuthDir, file);
          const stat = fs.statSync(src);
          if (stat.isFile() && !file.endsWith('.lock')) {
            const dest = path.join(this.authDir, file);
            if (!fs.existsSync(dest)) {
              fs.copyFileSync(src, dest);
            }
          }
        }
        console.log(`[WhatsApp] تم نسخ بيانات جلسة واتساب الأساسية بنجاح إلى مجلد ${this.authDir}`);
      } catch (e) {
        console.error('[WhatsApp] خطأ أثناء ترحيل بيانات الجلسة الأساسية للمستخدم:', e);
      }
    }

    this.lockFilePath = path.join(this.authDir, 'session.lock');
    this.messagesFilePath = path.join(this.authDir, 'stored_messages.json');
    this.groupsFilePath = path.join(this.authDir, 'stored_groups.json');
    this.contactsFilePath = path.join(this.authDir, 'stored_contacts.json');
    this.avatarsFilePath = path.join(this.authDir, 'stored_avatars.json');
    this.avatarsDir = path.join(process.cwd(), 'whatsapp_avatars');
    this.mediaDir = path.join(process.cwd(), 'whatsapp_media');

    if (!fs.existsSync(this.avatarsDir)) {
      try {
        fs.mkdirSync(this.avatarsDir, { recursive: true });
      } catch (e) {}
    }
    if (!fs.existsSync(this.mediaDir)) {
      try {
        fs.mkdirSync(this.mediaDir, { recursive: true });
      } catch (e) {}
    }

    this.incomingMessages = [];
    this.userGroups = [];

    // استرجاع المحادثات والرسائل الفعلية المخزنة
    this.loadPersistedData();

    // منع الاتصال بواتساب أثناء عملية بناء المشروع (Next.js Build phase) لتجنب قطع جلسة السيرفر
    const isBuildPhase =
      process.env.NEXT_PHASE === 'phase-production-build' ||
      process.argv.some((arg) => arg.includes('build') || arg.includes('next-build'));
    if (isBuildPhase) {
      console.log(`[WhatsApp:${this.userId}] تخطي بدء الاتصال أثناء بناء المشروع (Next.js Build phase)`);
      return;
    }

    // الاتصال التلقائي بالخلفية إذا كانت بيانات الاعتماد موجودة مسبقاً
    if (fs.existsSync(path.join(this.authDir, 'creds.json'))) {
      setTimeout(() => {
        this.connect().catch((err) => console.error(`[WhatsApp:${this.userId}] فشل الاتصال التلقائي بواتساب:`, err));
      }, 1000);
    }
  }

  public static getInstance(userId?: string): WhatsAppManager {
    const globalObj = globalThis as unknown as {
      __waManagerInstances?: Map<string, WhatsAppManager>;
      __waManagerInstance?: WhatsAppManager;
    };

    if (!globalObj.__waManagerInstances) {
      globalObj.__waManagerInstances = new Map<string, WhatsAppManager>();
    }

    const resolvedId = (userId && typeof userId === 'string' && userId.trim())
      ? userId.trim()
      : 'recmrgqBhC2YImlC0';

    let inst = globalObj.__waManagerInstances.get(resolvedId);

    if (!inst) {
      inst = new WhatsAppManager(resolvedId);
      (inst as any).__version = 18;
      if (inst.events && typeof inst.events.setMaxListeners === 'function') {
        inst.events.setMaxListeners(100);
      }
      globalObj.__waManagerInstances.set(resolvedId, inst);
      if (resolvedId === 'recmrgqBhC2YImlC0' || !globalObj.__waManagerInstance) {
        globalObj.__waManagerInstance = inst;
      }
    } else {
      Object.setPrototypeOf(inst, WhatsAppManager.prototype);
      (inst as any).__version = 18;
      if (!inst.events || typeof inst.events.emit !== 'function') {
        (inst as any).events = new EventEmitter();
        inst.events.setMaxListeners(100);
      }
      if (!(inst as any).revokedMessageIds) {
        (inst as any).revokedMessageIds = new Set<string>();
      }
    }

    return inst;
  }

  public static getAllInstances(): WhatsAppManager[] {
    const globalObj = globalThis as unknown as {
      __waManagerInstances?: Map<string, WhatsAppManager>;
    };
    if (!globalObj.__waManagerInstances) return [];
    return Array.from(globalObj.__waManagerInstances.values());
  }

  private static sharedMetaFilePath = path.join(process.cwd(), 'whatsapp_auth', 'shared_message_meta.json');

  public static getSharedMeta(): Record<string, { linkedReceiptUrl?: string; linkedMsgId?: string; status?: any; updatedAt: number }> {
    try {
      if (fs.existsSync(WhatsAppManager.sharedMetaFilePath)) {
        const raw = fs.readFileSync(WhatsAppManager.sharedMetaFilePath, 'utf-8');
        return JSON.parse(raw) || {};
      }
    } catch (e) {
      console.error('[WhatsApp] خطأ في قراءة ملف الميتا المشترك:', e);
    }
    return {};
  }

  public static saveSharedMeta(meta: Record<string, any>) {
    try {
      const dir = path.dirname(WhatsAppManager.sharedMetaFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(WhatsAppManager.sharedMetaFilePath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch (e) {
      console.error('[WhatsApp] خطأ في حفظ ملف الميتا المشترك:', e);
    }
  }

  public static updateSharedMessageMeta(id: string, updates: any) {
    try {
      const allMeta = WhatsAppManager.getSharedMeta();
      const current = allMeta[id] || { updatedAt: Date.now() };

      const newStatus = { ...(current.status || {}), ...(updates || {}) };
      if ('linkedReceiptUrl' in updates) {
        if (updates.linkedReceiptUrl) current.linkedReceiptUrl = updates.linkedReceiptUrl;
        else delete current.linkedReceiptUrl;
      }
      if ('linkedMsgId' in updates) {
        if (updates.linkedMsgId) current.linkedMsgId = updates.linkedMsgId;
        else delete current.linkedMsgId;
      }

      delete newStatus.linkedReceiptUrl;
      delete newStatus.linkedMsgId;
      current.status = newStatus;
      current.updatedAt = Date.now();

      allMeta[id] = current;
      WhatsAppManager.saveSharedMeta(allMeta);
    } catch (e) {
      console.error('[WhatsApp] خطأ أثناء تحديث الميتا المشترك:', e);
    }
  }

  public static initAllSessions(): void {
    try {
      const baseAuthDir = path.join(process.cwd(), 'whatsapp_auth');
      if (!fs.existsSync(baseAuthDir)) return;

      // تهيئة جلسة المستخدم الأساسي
      WhatsAppManager.getInstance('recmrgqBhC2YImlC0');

      // فحص مجلدات المستخدمين الأخرى
      const entries = fs.readdirSync(baseAuthDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('user_')) {
          const uId = entry.name.replace(/^user_/, '');
          const credsFile = path.join(baseAuthDir, entry.name, 'creds.json');
          if (fs.existsSync(credsFile)) {
            WhatsAppManager.getInstance(uId);
          }
        }
      }
    } catch (e) {
      console.error('[WhatsApp] خطأ أثناء تهيئة جلسات المستخدمين:', e);
    }
  }


  public emitGroupsThrottled(): void {
    if (this.emitGroupsDebounceTimer) return;
    this.emitGroupsDebounceTimer = setTimeout(() => {
      this.emitGroupsDebounceTimer = null;
      this.events.emit('groups', this.getUserGroups());
    }, 1200);
  }

  public getRevokedIds(): Set<string> {
    if (!this.revokedMessageIds) {
      this.revokedMessageIds = new Set<string>();
    }
    return this.revokedMessageIds;
  }

  public loadLidMappings(): void {
    try {
      if (!fs.existsSync(this.authDir)) return;
      const files = fs.readdirSync(this.authDir);
      for (const file of files) {
        if (file.startsWith('lid-mapping-') && file.endsWith('_reverse.json')) {
          const lid = file.replace('lid-mapping-', '').replace('_reverse.json', '');
          try {
            const raw = fs.readFileSync(path.join(this.authDir, file), 'utf-8');
            const phone = JSON.parse(raw);
            if (phone) {
              const cleanPhone = String(phone).replace(/\D/g, '');
              this.lidToPhoneMap[lid] = cleanPhone;
              this.phoneToLidMap[cleanPhone] = lid;
            }
          } catch (e) {}
        } else if (file.startsWith('lid-mapping-') && file.endsWith('.json')) {
          const phone = file.replace('lid-mapping-', '').replace('.json', '');
          try {
            const raw = fs.readFileSync(path.join(this.authDir, file), 'utf-8');
            const lid = JSON.parse(raw);
            if (lid) {
              const cleanLid = String(lid).replace(/\D/g, '');
              const cleanPhone = String(phone).replace(/\D/g, '');
              this.phoneToLidMap[cleanPhone] = cleanLid;
              this.lidToPhoneMap[cleanLid] = cleanPhone;
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      console.error('خطأ في تحميل تعيينات LID:', e);
    }
  }

  public decodeMentions(text: string): string {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/@(\d{6,})/g, (match, id) => {
      const resolved = this.resolveRealContact(id);
      if (resolved.contactName && !resolved.contactName.startsWith('+') && !resolved.contactName.startsWith('10')) {
        return `@${resolved.contactName}`;
      }
      if (resolved.formattedPhone) {
        return `@${resolved.formattedPhone}`;
      }
      return match;
    });
  }

  public resolveRealContact(jidOrId: string, pushName?: string): {
    realPhone?: string;
    formattedPhone?: string;
    contactName: string;
    cleanId: string;
    isGroup: boolean;
  } {
    if (!jidOrId) {
      return { contactName: 'غير معروف', cleanId: '', isGroup: false };
    }

    if (jidOrId.endsWith('@g.us')) {
      const found = this.userGroups.find((g) => g.id === jidOrId);
      return {
        contactName: found?.name || 'مجموعة واتساب',
        cleanId: jidOrId.split('@')[0],
        isGroup: true,
      };
    }

    const rawId = jidOrId.split('@')[0].replace(/\D/g, '');
    const isLid = jidOrId.endsWith('@lid') || Boolean(this.lidToPhoneMap[rawId]) || (rawId.length >= 14 && rawId.startsWith('10'));

    let realPhone = '';
    let lid = '';

    if (isLid) {
      lid = rawId;
      realPhone = this.lidToPhoneMap[lid] || '';
    } else {
      realPhone = rawId;
      lid = this.phoneToLidMap[realPhone] || '';
    }

    // تحديد حساب المستخدم المتصل من الجلسة الحالية
    const ownPhone = this.connectedUser?.phone || '';
    const ownLid = ownPhone ? this.phoneToLidMap[ownPhone] : '';
    if (ownPhone && (realPhone === ownPhone || rawId === ownPhone || (ownLid && lid === ownLid))) {
      return {
        realPhone: ownPhone,
        formattedPhone: formatPhoneNumber(ownPhone),
        contactName: `${this.connectedUser?.name || 'أنا'} (رسائلي)`,
        cleanId: ownPhone,
        isGroup: false,
      };
    }

    let foundName = '';
    const candidateKeys = [
      jidOrId,
      `${realPhone}@s.whatsapp.net`,
      realPhone,
      `${lid}@lid`,
      lid,
    ].filter(Boolean);

    for (const k of candidateKeys) {
      const val = this.contactsMap[k];
      if (val && typeof val === 'string' && val.trim() && val !== 'null' && val !== 'أنا' && !val.startsWith('+10')) {
        foundName = val.trim();
        break;
      }
    }

    if (!foundName && this.userGroups) {
      const foundGroup = this.userGroups.find(
        (g) =>
          g.id === jidOrId ||
          (lid && g.id === `${lid}@lid`) ||
          (realPhone && (g.id === `${realPhone}@s.whatsapp.net` || (g.phone && g.phone.replace(/\D/g, '') === realPhone)))
      );
      if (foundGroup?.name && !foundGroup.name.startsWith('+10') && foundGroup.name !== 'أنا') {
        foundName = foundGroup.name.trim();
        if (realPhone) this.contactsMap[`${realPhone}@s.whatsapp.net`] = foundName;
        if (jidOrId) this.contactsMap[jidOrId] = foundName;
      }
    }

    const isGroupName = (name: string) => {
      if (!name) return false;
      return name.startsWith('حوالات') || name.startsWith('حولات') || name.startsWith('وصول') || name.startsWith('واصلات') || name.includes('||');
    };

    if (!foundName && pushName && pushName.trim() && pushName !== 'null' && pushName !== 'أنا' && !pushName.startsWith('+10') && !isGroupName(pushName)) {
      foundName = pushName.trim();
      if (realPhone) this.contactsMap[`${realPhone}@s.whatsapp.net`] = foundName;
      if (jidOrId) this.contactsMap[jidOrId] = foundName;
    }

    const formattedPhone = realPhone ? formatPhoneNumber(realPhone) : (lid ? `+${lid}` : '');
    const contactName = (foundName && !foundName.startsWith('+10') && foundName !== 'أنا') ? foundName : (formattedPhone || `+${rawId}`);
    const cleanId = realPhone || rawId;

    return {
      realPhone,
      formattedPhone,
      contactName,
      cleanId,
      isGroup: false,
    };
  }

  /**
   * استخراج معلومات الاقتباس والرد من رسالة Baileys أو كائن الرسالة الخام
   */
  public extractQuotedMessage(msg: any, existingList?: ChatMessage[]): ChatMessage['quotedMessage'] | undefined {
    if (!msg) return undefined;
    const content = unwrapMessageContent(msg.message || msg.rawBaileysMessage?.message);
    if (!content) return undefined;

    const contextInfo =
      content?.extendedTextMessage?.contextInfo ||
      content?.imageMessage?.contextInfo ||
      content?.videoMessage?.contextInfo ||
      content?.documentMessage?.contextInfo ||
      content?.audioMessage?.contextInfo ||
      content?.stickerMessage?.contextInfo ||
      content?.buttonsResponseMessage?.contextInfo ||
      content?.templateButtonReplyMessage?.contextInfo ||
      content?.interactiveResponseMessage?.contextInfo ||
      content?.contextInfo;

    if (!contextInfo?.quotedMessage && !contextInfo?.stanzaId) {
      return undefined;
    }

    const targetQuotedId = contextInfo.stanzaId || '';
    if (!targetQuotedId) return undefined;

    const qContent = unwrapMessageContent(contextInfo.quotedMessage);

    let qText =
      qContent?.conversation ||
      qContent?.extendedTextMessage?.text ||
      qContent?.imageMessage?.caption ||
      qContent?.videoMessage?.caption ||
      qContent?.documentMessage?.caption ||
      '';

    const qHasMedia = Boolean(
      qContent?.imageMessage ||
      qContent?.videoMessage ||
      qContent?.documentMessage ||
      qContent?.audioMessage ||
      qContent?.stickerMessage
    );

    const list = existingList || this.incomingMessages;
    const existingQuoted = list.find((m) => m.id === targetQuotedId);

    const isGroup = Boolean(
      (msg.key?.remoteJid && msg.key.remoteJid.endsWith('@g.us')) ||
      (msg.chatJid && msg.chatJid.endsWith('@g.us'))
    );
    const msgFromMe = Boolean(msg.key?.fromMe ?? msg.isFromMe);

    let qSender = '';
    let qSenderName = '';

    // تحديد مرسل الرسالة المقتبسة بدقة
    const myPhone = this.connectedUser?.phone || '';
    const myJid = this.connectedUser?.jid || '';
    const myLid = myPhone ? this.phoneToLidMap[myPhone] : '';

    if (contextInfo.participant) {
      const pClean = contextInfo.participant.split('@')[0].replace(/\D/g, '');
      if (
        (myPhone && pClean === myPhone) ||
        (myJid && contextInfo.participant === myJid) ||
        (myLid && pClean === myLid)
      ) {
        qSender = 'أنا';
        qSenderName = 'أنا';
      } else {
        const resolvedQ = this.resolveRealContact(contextInfo.participant);
        qSender = resolvedQ.contactName || resolvedQ.formattedPhone || 'مشترك';
        qSenderName = resolvedQ.contactName || resolvedQ.formattedPhone || qSender;
      }
    }

    // إذا لم يتحدد من الـ participant (شائع في المحادثات الفردية 1-on-1):
    if (!qSender || qSender === 'مشترك') {
      if (existingQuoted) {
        const isFromMeExisting = Boolean(
          existingQuoted.isFromMe || existingQuoted.sender === 'أنا' || existingQuoted.senderName === 'أنا'
        );
        qSender = isFromMeExisting ? 'أنا' : (existingQuoted.senderName || existingQuoted.sender || 'مشترك');
        qSenderName = isFromMeExisting ? 'أنا' : (existingQuoted.senderName || existingQuoted.sender || qSender);
      } else if (!isGroup) {
        if (msgFromMe) {
          const chatName = msg.chatName || this.resolveRealContact(msg.key?.remoteJid || msg.chatJid || '').contactName;
          qSender = chatName || 'مشترك';
          qSenderName = chatName || 'مشترك';
        } else {
          qSender = 'أنا';
          qSenderName = 'أنا';
        }
      }
    }

    // إذا كان النص فارغاً والرسالة الأصلية موجودة في السجل
    if (!qText && existingQuoted?.text) {
      qText = existingQuoted.text.slice(0, 150);
    }

    if (!qText && qHasMedia) {
      if (qContent?.imageMessage) qText = qContent.imageMessage.caption || '';
      else if (qContent?.videoMessage) qText = 'فيديو';
      else if (qContent?.audioMessage) qText = 'رسالة صوتية';
      else if (qContent?.documentMessage) qText = qContent.documentMessage.fileName || 'مستند';
      else qText = 'وسائط';
    }

    const qMediaUrl = existingQuoted?.mediaUrl;

    return {
      id: targetQuotedId,
      sender: qSender || 'مشترك',
      senderName: qSenderName || qSender || 'مشترك',
      text: qText ? this.decodeMentions(qText) : '',
      hasMedia: Boolean(qHasMedia || qMediaUrl || existingQuoted?.hasMedia),
      mediaUrl: qMediaUrl,
    };
  }

  /**
   * استخراج تفاعلات الإيموجي (Reactions) من رسالة Baileys أو كائن الرسالة الخام
   */
  public extractReactions(rawMsg: any): NonNullable<ChatMessage['reactions']> {
    if (!rawMsg) return [];
    const rawList = rawMsg.reactions;
    if (!Array.isArray(rawList) || rawList.length === 0) return [];

    const myPhone = this.connectedUser?.phone || '';
    const myJid = this.connectedUser?.jid || '';
    const myLid = myPhone ? this.phoneToLidMap[myPhone] : '';
    const result: NonNullable<ChatMessage['reactions']> = [];

    for (const rx of rawList) {
      const emoji = (rx.text || '').trim();
      if (!emoji) continue;
      const rxKey = rx.key || {};
      const isFromMe = Boolean(rxKey.fromMe);
      const participant = rxKey.participant || rxKey.remoteJid || '';

      let sender = 'مشترك';
      let senderName = 'مشترك';

      const pClean = participant.split('@')[0].replace(/\D/g, '');
      if (
        isFromMe ||
        (myPhone && pClean === myPhone) ||
        (myJid && participant === myJid) ||
        (myLid && pClean === myLid)
      ) {
        sender = 'أنا';
        senderName = 'أنا';
      } else if (participant) {
        const resolved = this.resolveRealContact(participant);
        sender = resolved.contactName || resolved.formattedPhone || 'مشترك';
        senderName = resolved.contactName || resolved.formattedPhone || sender;
      }

      result.push({
        text: emoji,
        sender,
        senderName,
        isFromMe: sender === 'أنا',
        timestampMs: Number(rx.senderTimestampMs) || undefined,
      });
    }
    return result;
  }

  /**
   * معالجة حدث تفاعل الإيموجي (Reaction) لتحديث الرسالة المستهدفة في السجل والواجهة
   */
  public handleIncomingReaction(event: any): void {
    if (!event) return;
    const targetKey = event.key;
    const targetMsgId = targetKey?.id;
    if (!targetMsgId) return;

    const reaction = event.reaction;
    const emoji = (reaction?.text || '').trim();
    console.log('[WhatsApp handleIncomingReaction]', { targetMsgId, emoji, fromMe: reaction?.key?.fromMe, participant: reaction?.key?.participant });
    const reactionKey = reaction?.key || {};
    const fromMe = Boolean(reactionKey.fromMe);
    const participant = reactionKey.participant || reactionKey.remoteJid || '';

    const myPhone = this.connectedUser?.phone || '';
    const myJid = this.connectedUser?.jid || '';
    const myLid = myPhone ? this.phoneToLidMap[myPhone] : '';

    let sender = 'مشترك';
    let senderName = 'مشترك';

    const pClean = participant.split('@')[0].replace(/\D/g, '');
    if (
      fromMe ||
      (myPhone && pClean === myPhone) ||
      (myJid && participant === myJid) ||
      (myLid && pClean === myLid)
    ) {
      sender = 'أنا';
      senderName = 'أنا';
    } else if (participant) {
      const resolved = this.resolveRealContact(participant);
      sender = resolved.contactName || resolved.formattedPhone || 'مشترك';
      senderName = resolved.contactName || resolved.formattedPhone || sender;
    }

    const timestampMs = Number(reaction?.senderTimestampMs) || Date.now();

    const msg = this.incomingMessages.find(
      (m) => m.id === targetMsgId || m.rawBaileysMessage?.key?.id === targetMsgId
    );
    if (!msg) {
      // حفظ التفاعل مؤقتاً في حال وصوله قبل تخزين الرسالة الأصلية
      const pending = this.pendingReactionsMap.get(targetMsgId) || [];
      pending.push(event);
      this.pendingReactionsMap.set(targetMsgId, pending);
      return;
    }

    if (!Array.isArray(msg.reactions)) {
      msg.reactions = [];
    }

    const isReactorMe = sender === 'أنا' || fromMe;

    if (!emoji) {
      // إزالة التفاعل
      msg.reactions = msg.reactions.filter((r) => {
        if (isReactorMe && (r.isFromMe || r.sender === 'أنا')) return false;
        return r.sender !== sender && r.senderName !== senderName;
      });
    } else {
      // تحديث التفاعل إذا كان المتفاعل قد تفاعل مسبقاً، أو إضافته
      const existingIdx = msg.reactions.findIndex((r) => {
        if (isReactorMe && (r.isFromMe || r.sender === 'أنا')) return true;
        return r.sender === sender;
      });

      const reactionObj = {
        text: emoji,
        sender,
        senderName,
        isFromMe: isReactorMe,
        timestampMs,
      };

      if (existingIdx !== -1) {
        msg.reactions[existingIdx] = reactionObj;
      } else {
        msg.reactions.push(reactionObj);
      }
    }

    // مزامنة التفاعل أيضاً داخل كائن rawBaileysMessage
    if (msg.rawBaileysMessage) {
      if (!Array.isArray(msg.rawBaileysMessage.reactions)) {
        msg.rawBaileysMessage.reactions = [];
      }
      const rawIdx = msg.rawBaileysMessage.reactions.findIndex((r: any) => {
        const rk = r.key || {};
        return (rk.fromMe && fromMe) || (rk.participant === participant);
      });
      if (rawIdx !== -1) {
        msg.rawBaileysMessage.reactions[rawIdx] = reaction;
      } else {
        msg.rawBaileysMessage.reactions.push(reaction);
      }
    }

    this.persistData();
    this.events.emit('reaction', { messageId: targetMsgId, reactions: msg.reactions });
  }

  /**
   * تطبيق أي تفاعلات معلقة كانت بانتظار استلام أو معالجة الرسالة الأصلية
   */
  public applyPendingReactions(msgId: string): void {
    const pending = this.pendingReactionsMap.get(msgId);
    if (pending && pending.length > 0) {
      this.pendingReactionsMap.delete(msgId);
      for (const ev of pending) {
        this.handleIncomingReaction(ev);
      }
    }
  }

  /**
   * معالجة حذف الرسالة لدى الجميع (Revoke) بحيث تبقى في مكانها مع شارة أنها حذفت في واتساب
   */
  public handleMessageRevoked(targetId: string, revokeKey?: any): void {
    if (!targetId) return;
    this.getRevokedIds().add(targetId);
    console.log('[WhatsApp handleMessageRevoked]', { targetId });

    const msg = this.incomingMessages.find(
      (m) => m.id === targetId || m.rawBaileysMessage?.key?.id === targetId
    );
    if (msg) {
      msg.isDeleted = true;
      if (!msg.deletedAt) {
        msg.deletedAt = Date.now();
      }
      this.persistData();
      this.events.emit('message_update', {
        messageId: msg.id,
        isDeleted: true,
        deletedAt: msg.deletedAt,
        text: msg.text,
        originalText: msg.originalText,
      });
    }
  }

  /**
   * معالجة تعديل الرسالة القادمة من واتساب مع الاحتفاظ بالنص الأصلي
   */
  public handleMessageEdited(targetId: string, editedMessageContent: any, editKey?: any): void {
    if (!targetId) return;
    console.log('[WhatsApp handleMessageEdited]', { targetId });

    const msg = this.incomingMessages.find(
      (m) => m.id === targetId || m.rawBaileysMessage?.key?.id === targetId
    );
    if (!msg) return;

    let content = editedMessageContent;
    if (content?.message) content = content.message;
    if (content?.protocolMessage?.editedMessage) content = content.protocolMessage.editedMessage;
    if (content?.editedMessage?.message) content = content.editedMessage.message;

    const newText =
      content?.conversation ||
      content?.extendedTextMessage?.text ||
      content?.imageMessage?.caption ||
      content?.videoMessage?.caption ||
      content?.documentMessage?.caption;

    if (newText && newText !== msg.text) {
      // حفظ النص الأصلي قبل التعديل الأول
      if (!msg.originalText) {
        msg.originalText = msg.text;
      }
      msg.text = this.decodeMentions(newText);
      msg.isEdited = true;
      msg.editedAt = Date.now();
      this.persistData();
      this.events.emit('message_update', {
        messageId: msg.id,
        text: msg.text,
        originalText: msg.originalText,
        isEdited: true,
        editedAt: msg.editedAt,
      });
    }
  }

  /**
   * معالجة تحديثات الرسائل الواردة من واتساب (تعديل نص الرسالة أو تحديث تفاعلاتها أو حذفها)
   */
  public handleIncomingMessageUpdate(u: any): void {
    if (!u?.key) return;
    const targetMsgId = u.key.id;
    if (!targetMsgId) return;
    console.log('[WhatsApp handleIncomingMessageUpdate]', { targetMsgId, hasReactions: Boolean(u.update?.reactions) });

    // فحص ما إذا كان التحديث عبارة عن بروتوكول حذف أو تعديل
    const proto = u.update?.message?.protocolMessage || u.update?.protocolMessage;
    if (proto) {
      const pKeyId = proto.key?.id || targetMsgId;
      if (proto.type === 0 || proto.type === 'REVOKE') {
        this.handleMessageRevoked(pKeyId, proto.key || u.key);
        return;
      }
      if (proto.type === 14 || proto.type === 'MESSAGE_EDIT') {
        this.handleMessageEdited(pKeyId, proto.editedMessage || u.update?.message, proto.key || u.key);
        return;
      }
    }

    const msg = this.incomingMessages.find(
      (m) => m.id === targetMsgId || m.rawBaileysMessage?.key?.id === targetMsgId
    );

    // 1. تحديث التفاعلات إذا وُجدت
    if (u.update?.reactions && Array.isArray(u.update.reactions)) {
      if (msg) {
        const extracted = this.extractReactions({ reactions: u.update.reactions });
        if (extracted.length > 0) {
          msg.reactions = extracted;
          this.persistData();
        }
      } else {
        for (const rx of u.update.reactions) {
          this.handleIncomingReaction({
            key: u.key,
            reaction: rx,
          });
        }
      }
    }

    // 2. تحديث نص الرسالة إذا تم تعديلها (Message Edit)
    if (u.update?.message && msg) {
      let content = u.update.message;
      if (content?.editedMessage?.message) content = content.editedMessage.message;
      if (content?.protocolMessage?.editedMessage) content = content.protocolMessage.editedMessage;
      const newText =
        content?.conversation ||
        content?.extendedTextMessage?.text ||
        content?.imageMessage?.caption ||
        content?.videoMessage?.caption ||
        content?.documentMessage?.caption;
      if (newText && newText !== msg.text) {
        if (!msg.originalText) {
          msg.originalText = msg.text;
        }
        msg.text = this.decodeMentions(newText);
        msg.isEdited = true;
        msg.editedAt = Date.now();
        msg.rawBaileysMessage = { ...(msg.rawBaileysMessage || {}), ...u.update };
        this.persistData();
        this.events.emit('message_update', {
          messageId: targetMsgId,
          text: msg.text,
          originalText: msg.originalText,
          isEdited: true,
          editedAt: msg.editedAt,
        });
      }
    }

    // 3. تحديث حالة تسليم وقراءة الرسالة (Pending -> Sent -> Delivered -> Read)
    // ملاحظة: Baileys يرسل هذا الحدث للمحادثات الخاصة، أما المجموعات فحالتها تأتي عبر message-receipt.update
    if (u.update?.status !== undefined && msg) {
      const s = u.update.status;
      let newDeliveryStatus: 'pending' | 'sent' | 'delivered' | 'read' | null = null;
      if (s === 1 || s === 'PENDING' || s === 'pending') newDeliveryStatus = 'pending';
      else if (s === 2 || s === 'SERVER_ACK' || s === 'sent') newDeliveryStatus = 'sent';
      else if (s === 3 || s === 'DELIVERY_ACK' || s === 'delivered') newDeliveryStatus = 'delivered';
      else if (s === 4 || s === 'READ' || s === 5 || s === 'PLAYED' || s === 'read' || s === 'played') newDeliveryStatus = 'read';

      // حفظ وقت التسليم والقراءة (Baileys يرسل وقت الإشعار في messageTimestamp)
      let timesChanged = false;
      const at = this.toMillis(u.update.messageTimestamp) || Date.now();
      if (newDeliveryStatus === 'delivered' && !msg.deliveredAt) {
        msg.deliveredAt = at;
        timesChanged = true;
      } else if (newDeliveryStatus === 'read' && !msg.readAt) {
        msg.readAt = at;
        timesChanged = true;
      }

      const statusChanged = Boolean(newDeliveryStatus && this.upgradeDeliveryStatus(msg, newDeliveryStatus));
      if (statusChanged) {
        msg.rawBaileysMessage = { ...(msg.rawBaileysMessage || {}), status: s };
        this.events.emit('receipt', { messageId: targetMsgId, status: msg.deliveryStatus });
      }
      if (statusChanged || timesChanged) this.persistData();
    }
  }

  // تحويل وقت Baileys (ثوانٍ أو Long) إلى مللي ثانية
  private toMillis(value: any): number | undefined {
    const n = Number(typeof value === 'object' && value !== null && 'low' in value ? value.low : value);
    if (!n || isNaN(n)) return undefined;
    return n > 1e11 ? n : n * 1000;
  }

  // ترتيب حالات الصح: الحالة لا ترجع للخلف أبداً (مثل واتساب)
  // حتى لو وصل إشعار "تم التسليم" متأخراً بعد "تمت القراءة"
  private upgradeDeliveryStatus(msg: ChatMessage, next: 'pending' | 'sent' | 'delivered' | 'read'): boolean {
    const rank = { pending: 0, sent: 1, delivered: 2, read: 3 } as const;
    const current = msg.deliveryStatus ? rank[msg.deliveryStatus] : -1;
    if (rank[next] <= current) return false;
    msg.deliveryStatus = next;
    return true;
  }

  // عدد أعضاء القروب (بدوني) مع تخزين مؤقت 10 دقائق لتقليل الطلبات على واتساب
  private groupSizeCache?: Map<string, { size: number; at: number }>;
  private async getGroupOtherMembersCount(groupJid: string): Promise<number | null> {
    // إنشاء عند أول استخدام (المثيل الحي يبقى محفوظاً عند تحديث الكود فلا تُنشأ حقوله الجديدة تلقائياً)
    if (!this.groupSizeCache) this.groupSizeCache = new Map();
    const cached = this.groupSizeCache.get(groupJid);
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.size;
    try {
      const meta = await this.sock?.groupMetadata(groupJid);
      if (!meta?.participants) return null;
      const size = Math.max(meta.participants.length - 1, 0);
      this.groupSizeCache.set(groupJid, { size, at: Date.now() });
      return size;
    } catch (err) {
      console.warn('[WhatsApp] تعذر جلب عدد أعضاء القروب:', groupJid, err);
      return null;
    }
  }

  // تحويل صيغة الإشعارات القديمة ('delivered' | 'read') إلى الصيغة الجديدة مع الأوقات
  private normalizeReceipt(value: any): MemberReceipt {
    if (value === 'read') return { deliveredAt: undefined, readAt: 0 };
    if (value === 'delivered') return { deliveredAt: 0 };
    return value && typeof value === 'object' ? value : {};
  }

  // اسم وصورة الشخص من جهات الاتصال المحفوظة (بدون أي طلب لواتساب)
  private describePerson(jid: string, at?: number): MessageInfoPerson {
    const contact = this.resolveRealContact(jid);
    const digits = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
    const phone = contact.realPhone || this.lidToPhoneMap[digits] || '';
    const avatarUrl = this.avatarsMap[digits] || (phone ? this.avatarsMap[phone] : undefined);
    return {
      jid,
      name: contact.contactName || contact.formattedPhone || digits,
      avatarUrl,
      at: at || undefined,
    };
  }

  // هل الرقم مسجل على واتساب؟ (لخيار "محادثة مع الرقم" عند النقر على رقم داخل رسالة)
  public async checkOnWhatsApp(phoneDigits: string): Promise<{ exists: boolean; jid?: string }> {
    const digits = (phoneDigits || '').replace(/\D/g, '');
    if (!this.sock || this.connectionStatus !== 'CONNECTED' || digits.length < 8) return { exists: false };
    try {
      const result = await this.sock.onWhatsApp(digits);
      const first = result?.[0];
      return { exists: Boolean(first?.exists), jid: first?.jid };
    } catch (err) {
      console.warn('[WhatsApp] تعذر التحقق من الرقم:', digits, err);
      return { exists: false };
    }
  }

  // أعضاء القروب لخاصية المنشن (@) مع تخزين مؤقت 10 دقائق
  private groupParticipantsCache?: Map<string, { list: GroupParticipantInfo[]; at: number }>;
  public async getGroupParticipants(groupJidOrName: string): Promise<GroupParticipantInfo[]> {
    let jid = groupJidOrName || '';
    if (!jid.endsWith('@g.us')) {
      jid = this.userGroups.find((g) => g.name === jid || g.id === jid)?.id || '';
    }
    if (!jid.endsWith('@g.us') || !this.sock) return [];

    if (!this.groupParticipantsCache) this.groupParticipantsCache = new Map();
    const cached = this.groupParticipantsCache.get(jid);
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.list;

    try {
      const meta = await this.sock.groupMetadata(jid);
      const bareUser = (j?: string) => (j || '').split('@')[0].split(':')[0];
      const me = this.sock.user;
      const myIds = [me?.id, (me as any)?.lid].filter(Boolean).map(bareUser);

      const list: GroupParticipantInfo[] = (meta?.participants || [])
        .filter((p: any) => !myIds.includes(bareUser(p.id)))
        .map((p: any) => {
          // نستخدم رقم الهاتف لإظهار الاسم، ومعرف العضو نفسه (id) للمنشن كما يطلبه واتساب
          const person = this.describePerson(p.phoneNumber || p.id);
          const phoneDigits = bareUser(p.phoneNumber) || (p.id.endsWith('@s.whatsapp.net') ? bareUser(p.id) : '');
          // إذا لم يكن محفوظاً بجهات الاتصال: نستخدم الاسم الذي وضعه لنفسه في واتساب (pushName) من رسائله
          let name = person.name;
          if (!name || /^[+\d\s]+$/.test(name)) {
            const ids = [bareUser(p.id), phoneDigits].filter(Boolean);
            const fromMsg = this.incomingMessages.find((m) => {
              const k = m.rawBaileysMessage?.key;
              return m.rawBaileysMessage?.pushName && ids.includes(bareUser(k?.participant || k?.participantAlt || m.rawBaileysMessage?.participant || ''));
            });
            if (fromMsg?.rawBaileysMessage?.pushName) name = fromMsg.rawBaileysMessage.pushName;
          }
          return {
            jid: p.id,
            name,
            avatarUrl: person.avatarUrl,
            phone: phoneDigits ? `+${phoneDigits}` : undefined,
            isAdmin: Boolean(p.admin),
          };
        })
        .sort((a: GroupParticipantInfo, b: GroupParticipantInfo) => a.name.localeCompare(b.name, 'ar'));

      this.groupParticipantsCache.set(jid, { list, at: Date.now() });
      this.groupSizeCache = this.groupSizeCache || new Map();
      this.groupSizeCache.set(jid, { size: list.length, at: Date.now() });
      return list;
    } catch (err) {
      console.warn('[WhatsApp] تعذر جلب أعضاء القروب:', jid, err);
      return [];
    }
  }

  // معلومات الرسالة: من استلمها ومن قرأها ومتى (مثل Message info في واتساب)
  public async getMessageInfo(messageId: string): Promise<MessageInfo | null> {
    const msg = this.incomingMessages.find((m) => m.id === messageId || m.rawBaileysMessage?.key?.id === messageId);
    if (!msg) return null;

    const chatJid = msg.chatJid || msg.rawBaileysMessage?.key?.remoteJid || '';
    const isGroup = chatJid.endsWith('@g.us');

    if (!isGroup) {
      return {
        isGroup: false,
        deliveryStatus: msg.deliveryStatus,
        deliveredAt: msg.deliveredAt,
        readAt: msg.readAt,
        readBy: [],
        deliveredTo: [],
        readRemaining: 0,
        deliveredRemaining: 0,
        totalMembers: null,
      };
    }

    const readBy: MessageInfoPerson[] = [];
    const deliveredTo: MessageInfoPerson[] = [];
    for (const [jid, raw] of Object.entries(msg.receiptsBy || {})) {
      const r = this.normalizeReceipt(raw);
      if (r.readAt !== undefined) readBy.push(this.describePerson(jid, r.readAt));
      else if (r.deliveredAt !== undefined) deliveredTo.push(this.describePerson(jid, r.deliveredAt));
    }
    // الأحدث أولاً كما في واتساب
    readBy.sort((a, b) => (b.at || 0) - (a.at || 0));
    deliveredTo.sort((a, b) => (b.at || 0) - (a.at || 0));

    const totalMembers = await this.getGroupOtherMembersCount(chatJid);
    return {
      isGroup: true,
      deliveryStatus: msg.deliveryStatus,
      readBy,
      deliveredTo,
      readRemaining: totalMembers === null ? 0 : Math.max(totalMembers - readBy.length, 0),
      deliveredRemaining: totalMembers === null ? 0 : Math.max(totalMembers - readBy.length - deliveredTo.length, 0),
      totalMembers,
    };
  }

  public sanitizeUserGroupsAndMessages(): void {
    this.loadLidMappings();

    // 1. تنظيف وتحديث كافة المحادثات والمجموعات
    for (const g of this.userGroups) {
      g.id = this.getCanonicalChatJid(g.id);
      const isGroup = g.isGroup ?? (g.id ? g.id.endsWith('@g.us') : false);
      g.isGroup = isGroup;

      if (!isGroup) {
        const resolved = this.resolveRealContact(g.id);
        if (resolved.realPhone) {
          g.phone = resolved.formattedPhone;
        }

        if (this.connectedUser?.phone && resolved.realPhone === this.connectedUser.phone) {
          g.name = `${this.connectedUser.name || 'أنا'} (رسائلي)`;
        } else if (g.name === 'أنا' || !g.name || g.name.startsWith('+10') || (g.name.length >= 14 && /^\d+$/.test(g.name))) {
          g.name = (resolved.contactName && resolved.contactName !== 'أنا' && !resolved.contactName.startsWith('+10'))
            ? resolved.contactName
            : (resolved.formattedPhone || g.name);
        } else if (resolved.contactName && !resolved.contactName.startsWith('+10') && resolved.contactName !== 'أنا') {
          g.name = resolved.contactName;
        } else if (resolved.formattedPhone && g.name.startsWith('+')) {
          g.name = resolved.formattedPhone;
        }

        const cleanKey = (resolved.realPhone || g.id.split('@')[0]).replace(/\D/g, '');
        if (this.avatarsMap[cleanKey]) {
          g.avatarUrl = this.avatarsMap[cleanKey];
        }
      } else {
        const cleanKey = g.id.split('@')[0].replace(/\D/g, '');
        if (this.avatarsMap[cleanKey]) {
          g.avatarUrl = this.avatarsMap[cleanKey];
        }
      }
    }

    // 2. تنظيف وتحديث كافة الرسائل (الفردية والجماعية وفك الإشارات ID واستخراج الاقتباسات)
    for (const m of this.incomingMessages) {
      if (m.chatJid) m.chatJid = this.getCanonicalChatJid(m.chatJid);
      const isGroup = Boolean(m.chatJid ? m.chatJid.endsWith('@g.us') : false);
      const isFromMe = Boolean(m.rawBaileysMessage?.key?.fromMe);

      // فك شفرة المنشنز @ID داخل نص الرسالة
      if (m.text) {
        m.text = this.decodeMentions(m.text);
      }

      if (!isGroup) {
        // محادثة فردية خاصة
        // أولاً: نبحث في userGroups إن كان هناك اسم معتمد ومسجل مسبقاً لهذه المحادثة
        const grp = this.userGroups.find((g) => g.id === m.chatJid || (g.phone && m.chatJid && m.chatJid.includes(g.phone.replace(/\D/g, ''))));
        const knownName = grp?.name && !grp.name.startsWith('+10') && grp.name !== 'أنا' ? grp.name : undefined;

        const resolved = this.resolveRealContact(m.chatJid || '', m.rawBaileysMessage?.pushName);
        const bestName = knownName || (resolved.contactName && !resolved.contactName.startsWith('+10') && resolved.contactName !== 'أنا' ? resolved.contactName : undefined);

        if (bestName) {
          m.chatName = bestName;
        } else if (resolved.formattedPhone) {
          m.chatName = resolved.formattedPhone;
        }

        if (isFromMe) {
          m.sender = 'أنا';
          m.senderName = 'أنا';
        } else {
          m.sender = bestName || resolved.formattedPhone || m.sender;
          m.senderName = bestName || resolved.formattedPhone || m.senderName;
        }
      } else {
        // رسالة جماعية داخل مجموعة
        if (isFromMe) {
          m.sender = 'أنا';
          m.senderName = 'أنا';
        } else {
          const participant = m.rawBaileysMessage?.participant || m.rawBaileysMessage?.key?.participant;
          if (participant && !participant.endsWith('@g.us')) {
            const resolved = this.resolveRealContact(participant, m.rawBaileysMessage?.pushName);
            m.sender = resolved.contactName || resolved.formattedPhone || m.sender;
            m.senderName = resolved.contactName || resolved.formattedPhone || m.senderName;
          } else if (m.sender === 'عضو' || !m.sender || m.sender.startsWith('+10') || (m.sender.length >= 14 && /^\d+$/.test(m.sender))) {
            if (m.rawBaileysMessage?.pushName) {
              m.sender = m.rawBaileysMessage.pushName;
              m.senderName = m.rawBaileysMessage.pushName;
            }
          }
        }
      }

      // استخراج وتحديث الرسائل المقتبسة للرسائل التاريخية والجديدة
      if (!m.quotedMessage && m.rawBaileysMessage) {
        m.quotedMessage = this.extractQuotedMessage(m.rawBaileysMessage, this.incomingMessages);
      } else if (m.quotedMessage) {
        if (m.quotedMessage.sender === 'أنا' || m.quotedMessage.senderName === 'أنا') {
          m.quotedMessage.sender = 'أنا';
          m.quotedMessage.senderName = 'أنا';
        } else if (m.quotedMessage.sender === 'مشترك' || !m.quotedMessage.sender) {
          const existing = this.incomingMessages.find((orig) => orig.id === m.quotedMessage?.id);
          if (existing) {
            const isOrigFromMe = Boolean(existing.isFromMe || existing.sender === 'أنا' || existing.senderName === 'أنا');
            m.quotedMessage.sender = isOrigFromMe ? 'أنا' : (existing.senderName || existing.sender || 'مشترك');
            m.quotedMessage.senderName = m.quotedMessage.sender;
            if (!m.quotedMessage.text && existing.text) {
              m.quotedMessage.text = existing.text.slice(0, 150);
            }
            if (!m.quotedMessage.mediaUrl && existing.mediaUrl) {
              m.quotedMessage.mediaUrl = existing.mediaUrl;
              m.quotedMessage.hasMedia = true;
            }
          }
        }
      }

      // استخراج وتحديث تفاعلات الإيموجي (Reactions) للرسائل
      if ((!m.reactions || m.reactions.length === 0) && m.rawBaileysMessage) {
        const rx = this.extractReactions(m.rawBaileysMessage);
        if (rx.length > 0) {
          m.reactions = rx;
        }
      }

      // 3. تحديد نوع الوسائط (صورة، فيديو، صوت، ملصق) وتصحيح الامتدادات
      const rawMsg = m.rawBaileysMessage?.message;
      const content = unwrapMessageContent(rawMsg);
      if (m.isViewOnce || isViewOnceMessage(rawMsg)) {
        m.isViewOnce = true;
        m.hasMedia = false;
        m.mediaUrl = undefined;
        m.text = viewOnceNotice(Boolean(m.isFromMe || m.rawBaileysMessage?.key?.fromMe));
      } else if (content) {
        if (content.stickerMessage) {
          m.mediaType = 'sticker';
          m.hasMedia = true;
          if (!m.text) m.text = 'ملصق';
        } else if (content.videoMessage) {
          m.mediaType = 'video';
          m.hasMedia = true;
          m.mediaDuration = Number(content.videoMessage.seconds) || m.mediaDuration;
          if (!m.text) m.text = content.videoMessage.caption || 'مقطع فيديو';
        } else if (content.audioMessage) {
          m.mediaType = content.audioMessage.ptt ? 'voice' : 'audio';
          m.hasMedia = true;
          m.mediaDuration = Number(content.audioMessage.seconds) || m.mediaDuration;
          if (!m.text) m.text = content.audioMessage.ptt ? 'تسجيل صوتي' : 'مقطع صوتي';
        } else if (content.imageMessage) {
          m.mediaType = 'image';
          m.hasMedia = true;
        } else if (content.documentMessage) {
          m.mediaType = 'document';
          m.hasMedia = true;
        }
      }

      // تصحيح ملفات الفيديو والملصقات المخزنة محلياً إذا كان امتدادها .jpg خطأً
      if (m.mediaUrl && m.mediaUrl.endsWith('.jpg')) {
        const publicMediaDir = path.join(process.cwd(), 'public', 'media');
        const oldFile = fs.existsSync(path.join(this.mediaDir, path.basename(m.mediaUrl)))
          ? path.join(this.mediaDir, path.basename(m.mediaUrl))
          : path.join(publicMediaDir, path.basename(m.mediaUrl));
        if (fs.existsSync(oldFile)) {
          try {
            const buf = fs.readFileSync(oldFile);
            const hex = buf.slice(0, 16).toString('hex');
            const ascii = buf.slice(0, 16).toString('utf8');
            if (hex.includes('66747970') || m.mediaType === 'video') {
              const newName = `${m.id}.mp4`;
              const newPath = path.join(this.mediaDir, newName);
              if (!fs.existsSync(newPath)) fs.writeFileSync(newPath, buf);
              m.mediaUrl = `/media/${newName}`;
              m.mediaType = 'video';
            } else if (ascii.includes('WEBP') || m.mediaType === 'sticker') {
              const newName = `${m.id}.webp`;
              const newPath = path.join(this.mediaDir, newName);
              if (!fs.existsSync(newPath)) fs.writeFileSync(newPath, buf);
              m.mediaUrl = `/media/${newName}`;
              m.mediaType = 'sticker';
            }
          } catch (e) {}
        }
      }
    }

    // إزالة التكرارات إن وجدت
    const seen = new Set<string>();
    const unique: WhatsAppGroupItem[] = [];
    for (const g of this.userGroups) {
      const key = g.isGroup ? g.id : (g.phone?.replace(/\D/g, '') || this.getCanonicalChatJid(g.id));
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(g);
      }
    }
    this.userGroups = unique;
  }

  public saveAvatars(): void {
    try {
      fs.writeFileSync(this.avatarsFilePath, JSON.stringify(this.avatarsMap, null, 2), 'utf-8');
    } catch (e) {
      console.error('خطأ في حفظ روابط الصور الرمزية:', e);
    }
  }

  public async getProfilePicture(jid: string, fallbackPhoneOrLid?: string, fullResolution = false): Promise<string | undefined> {
    const rawDigits = jid.split('@')[0].replace(/\D/g, '');
    const cleanKey = (fallbackPhoneOrLid ? fallbackPhoneOrLid.split('@')[0].replace(/\D/g, '') : '') || rawDigits;
    if (!cleanKey) return undefined;

    const fullAvatarName = `${cleanKey}-full.jpg`;
    if (fullResolution && fs.existsSync(path.join(this.avatarsDir, fullAvatarName))) {
      return `/avatars/${fullAvatarName}`;
    }

    if (!fullResolution && this.avatarsMap[cleanKey]) {
      const localRel = this.avatarsMap[cleanKey];
      const localAbs = path.join(this.avatarsDir, path.basename(localRel));
      const legacyAbs = path.join(process.cwd(), 'public', localRel.replace(/^\//, ''));
      if (fs.existsSync(localAbs) || fs.existsSync(legacyAbs)) {
        return localRel;
      }
    }

    if (!this.sock || this.connectionStatus !== 'CONNECTED') {
      return undefined;
    }

    let ppUrl: string | undefined;
    try {
      ppUrl = await this.sock.profilePictureUrl(jid, fullResolution ? 'image' : 'preview');
    } catch (err1) {
      if (fallbackPhoneOrLid) {
        try {
          const altJid = fallbackPhoneOrLid.includes('@') ? fallbackPhoneOrLid : `${fallbackPhoneOrLid}@s.whatsapp.net`;
          ppUrl = await this.sock.profilePictureUrl(altJid, fullResolution ? 'image' : 'preview');
        } catch (err2) {}
      }
    }

    if (ppUrl) {
      try {
        const res = await fetch(ppUrl);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          const filename = fullResolution ? fullAvatarName : `${cleanKey}.jpg`;
          const targetPath = path.join(this.avatarsDir, filename);
          fs.writeFileSync(targetPath, Buffer.from(buffer));
          const localUrl = `/avatars/${filename}`;
          if (!fullResolution) {
            this.avatarsMap[cleanKey] = localUrl;
            this.avatarsMap[rawDigits] = localUrl;
            this.saveAvatars();
          }
          return localUrl;
        }
      } catch (dlErr) {
        console.warn(`فشل تنزيل صورة البروفايل لـ ${cleanKey}:`, dlErr);
      }
    }

    return undefined;
  }

  // جلب صور مرسلي الرسائل في القروبات الذين ليس لهم صورة محفوظة
  // (نتذكر من حاولنا معهم حتى لا نكرر الطلب لمن أخفى صورته)
  private avatarAttempted?: Set<string>;
  private avatarSyncAttempted: Set<string> = new Set();
  public async syncGroupSenderAvatars(): Promise<{ checked: number; downloaded: number }> {
    if (!this.sock || this.connectionStatus !== 'CONNECTED') return { checked: 0, downloaded: 0 };
    if (!this.avatarAttempted) this.avatarAttempted = new Set();

    const senders = new Map<string, string | undefined>();
    for (const m of this.incomingMessages) {
      const raw = m.rawBaileysMessage;
      if (!(m.chatJid || '').endsWith('@g.us') || raw?.key?.fromMe) continue;
      const participant: string | undefined = raw?.key?.participant || raw?.key?.participantAlt || raw?.participant;
      if (!participant) continue;
      const digits = participant.split('@')[0].split(':')[0];
      const phone = this.lidToPhoneMap[digits];
      const lid = this.phoneToLidMap[digits];
      if (this.avatarsMap[digits] || (phone && this.avatarsMap[phone]) || (lid && this.avatarsMap[lid])) continue;
      if (this.avatarAttempted.has(digits)) continue;
      senders.set(participant, phone ? `${phone}@s.whatsapp.net` : undefined);
    }

    let downloaded = 0;
    for (const [jid, fallback] of [...senders].slice(0, 50)) {
      this.avatarAttempted.add(jid.split('@')[0].split(':')[0]);
      try {
        if (await this.getProfilePicture(jid, fallback)) downloaded++;
      } catch {}
      await new Promise((r) => setTimeout(r, 150));
    }
    if (senders.size > 0) {
      console.log(`[WhatsApp] صور أعضاء القروبات: فحص ${senders.size} عضو، تم تنزيل ${downloaded} صورة.`);
    }
    return { checked: senders.size, downloaded };
  }

  public async syncAvatars(): Promise<{ total: number; downloaded: number }> {
    if (this.isSyncingAvatars || !this.sock || this.connectionStatus !== 'CONNECTED') {
      return { total: 0, downloaded: 0 };
    }

    this.isSyncingAvatars = true;
    let downloaded = 0;
    try {
      // 1. مزامنة فورية لكل المحادثات التي توجد صورها مسبقاً على القرص بدون أي استهلاك للشبكة
      for (const g of this.userGroups) {
        const isGrp = g.isGroup ?? (g.id ? g.id.endsWith('@g.us') : false);
        let cleanKey = g.id.split('@')[0].replace(/\D/g, '');
        if (!isGrp) {
          const resolved = this.resolveRealContact(g.id);
          if (resolved.realPhone) cleanKey = resolved.realPhone;
        }
        if (this.avatarsMap[cleanKey]) {
          const localRel = this.avatarsMap[cleanKey];
          const localAbs = path.join(process.cwd(), 'public', localRel.replace(/^\//, ''));
          if (fs.existsSync(localAbs)) {
            g.avatarUrl = localRel;
          }
        }
      }

      // 2. حساب وزن النشاط لكل محادثة لإعطاء الأولوية القصوى للمحادثات الحية التي بها رسائل في صندوق الوارد
      const activeChatWeights = new Map<string, number>();
      for (const m of this.incomingMessages) {
        const jidKey = (m.chatJid || '').split('@')[0].replace(/\D/g, '');
        const nameKey = m.chatName || m.senderName || '';
        if (jidKey) {
          const cur = activeChatWeights.get(jidKey) || 0;
          activeChatWeights.set(jidKey, cur + 2);
        }
        if (nameKey) {
          const curName = activeChatWeights.get(nameKey) || 0;
          activeChatWeights.set(nameKey, curName + 1);
        }
      }

      const sortedGroups = [...this.userGroups].sort((a, b) => {
        const aDigits = (a.id || '').split('@')[0].replace(/\D/g, '');
        const bDigits = (b.id || '').split('@')[0].replace(/\D/g, '');
        const aWeight = (activeChatWeights.get(aDigits) || 0) + (activeChatWeights.get(a.name) || 0) + (a.unreadCount ? 50 : 0);
        const bWeight = (activeChatWeights.get(bDigits) || 0) + (activeChatWeights.get(b.name) || 0) + (b.unreadCount ? 50 : 0);
        return bWeight - aWeight;
      });

      console.log(`[WhatsApp] بدء جلب صور البروفايل لـ ${sortedGroups.length} محادثة ومجموعة (الأولوية للنشطة)...`);
      for (const g of sortedGroups) {
        if (!this.sock || this.connectionStatus !== 'CONNECTED') break;
        if (downloaded >= 60) break; // سقف لكل دورة مع بدء المحادثات النشطة أولاً لمنع 428

        if (g.avatarUrl) {
          const localAbs = path.join(process.cwd(), 'public', g.avatarUrl.replace(/^\//, ''));
          if (fs.existsSync(localAbs)) continue;
        }

        const isGrp = g.isGroup ?? (g.id ? g.id.endsWith('@g.us') : false);
        let primaryJid = g.id;
        let fallback: string | undefined;
        let cleanKey = g.id.split('@')[0].replace(/\D/g, '');

        if (!isGrp) {
          const resolved = this.resolveRealContact(g.id);
          if (resolved.realPhone) {
            cleanKey = resolved.realPhone;
            primaryJid = `${resolved.realPhone}@s.whatsapp.net`;
            fallback = g.id;
          }
        }

        // تخطي من تم فحصه سابقاً في هذه الجلسة ولم تكن له صورة لتجنب تكرار الطلبات الفاشلة
        if (this.avatarSyncAttempted.has(cleanKey)) {
          continue;
        }
        this.avatarSyncAttempted.add(cleanKey);

        try {
          const url = await this.getProfilePicture(primaryJid, fallback);
          if (url) {
            g.avatarUrl = url;
            const original = this.userGroups.find((orig) => orig.id === g.id);
            if (original) original.avatarUrl = url;
            downloaded++;
          }
          await new Promise((r) => setTimeout(r, 150));
        } catch (e) {}
      }

      console.log(`[WhatsApp] اكتمل جلب صور البروفايل: تم تنزيل ${downloaded} صورة جديدة.`);
      this.persistDataImmediate();
      // صور أعضاء القروبات الذين يرسلون رسائل (غير مشمولين في قائمة المحادثات)
      this.syncGroupSenderAvatars().catch(() => {});
      return { total: this.userGroups.length, downloaded };
    } finally {
      this.isSyncingAvatars = false;
    }
  }

  private loadPersistedData() {
    try {
      if (fs.existsSync(this.avatarsFilePath)) {
        try {
          const raw = fs.readFileSync(this.avatarsFilePath, 'utf-8');
          this.avatarsMap = JSON.parse(raw) || {};
        } catch (e) {}
      }
      if (fs.existsSync(this.contactsFilePath)) {
        const raw = fs.readFileSync(this.contactsFilePath, 'utf-8');
        this.contactsMap = JSON.parse(raw) || {};
      }
      this.loadLidMappings();
      if (fs.existsSync(this.messagesFilePath)) {
        const raw = fs.readFileSync(this.messagesFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const publicMediaDir = path.join(process.cwd(), 'public', 'media');
          const existingExts = ['webp', 'jpg', 'png', 'mp4', 'ogg', 'm4a', 'mp3', 'pdf'];
          this.incomingMessages = parsed
            .filter((m: any) => !m.isDemo && !String(m.id).startsWith('msg_'))
            .map((m: any) => {
              if (m.chatJid) m.chatJid = this.getCanonicalChatJid(m.chatJid);
              if (!m.timestampMs) {
                const sec = Number(m.rawBaileysMessage?.messageTimestamp);
                if (sec && !isNaN(sec)) {
                  m.timestampMs = sec > 1e11 ? sec : sec * 1000;
                } else if (typeof m.id === 'string' && m.id.startsWith('msg_real_')) {
                  m.timestampMs = Number(m.id.split('_')[2]) || Date.now();
                }
              }

              // إذا كان للرسالة وسائط ولم يتوفر رابطها، فحص القرص فوراً
              if (m.hasMedia && !m.mediaUrl) {
                for (const ext of existingExts) {
                  const checkP = path.join(this.mediaDir, `${m.id}.${ext}`);
                  const legacyP = path.join(publicMediaDir, `${m.id}.${ext}`);
                  if (fs.existsSync(checkP) || fs.existsSync(legacyP)) {
                    m.mediaUrl = `/media/${m.id}.${ext}`;
                    m.mediaType = ext === 'webp' ? 'sticker' : ext === 'mp4' ? 'video' : ['ogg', 'm4a', 'mp3'].includes(ext) ? 'audio' : ext === 'pdf' ? 'document' : 'image';
                    break;
                  }
                }
              }

              return m;
            });

          // دمج بيانات الوصل المشبوك والحالة المشتركة لجميع المستخدمين
          const sharedMeta = WhatsAppManager.getSharedMeta();
          for (const m of this.incomingMessages) {
            const meta = sharedMeta[m.id];
            if (meta) {
              if (meta.linkedReceiptUrl && !m.linkedReceiptUrl) {
                m.linkedReceiptUrl = meta.linkedReceiptUrl;
              }
              if (meta.linkedMsgId && !m.linkedMsgId) {
                m.linkedMsgId = meta.linkedMsgId;
              }
              if (meta.status) {
                m.status = { ...(m.status || {}), ...meta.status };
              }
            }
          }
        }
      }
      if (fs.existsSync(this.groupsFilePath)) {
        const raw = fs.readFileSync(this.groupsFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.userGroups = parsed.map((g: any) => {
            const cleanKey = (g.id || '').split('@')[0].replace(/\D/g, '');
            if (!g.avatarUrl && cleanKey && this.avatarsMap[cleanKey]) {
              const localAbs = path.join(process.cwd(), 'public', this.avatarsMap[cleanKey].replace(/^\//, ''));
              if (fs.existsSync(localAbs)) {
                g.avatarUrl = this.avatarsMap[cleanKey];
              }
            }
            return g;
          });
        }
      }
      this.sanitizeUserGroupsAndMessages();
      this.syncStoredContacts();
      this.persistDataImmediate();
    } catch (e) {
      console.error('خطأ في قراءة ملفات واتساب المخزنة:', e);
    }
  }

  public persistContacts() {
    try {
      fs.writeFileSync(this.contactsFilePath, JSON.stringify(this.contactsMap, null, 2), 'utf-8');
    } catch (e) {
      console.error('خطأ في حفظ جهات الاتصال المخزنة:', e);
    }
  }

  public syncStoredContacts(): void {
    try {
      if (!fs.existsSync(this.authDir)) return;
      this.loadLidMappings();
      const files = fs.readdirSync(this.authDir);
      let countAdded = 0;
      for (const file of files) {
        if (file.startsWith('lid-mapping-') && !file.endsWith('_reverse.json') && file.endsWith('.json')) {
          const phone = file.replace('lid-mapping-', '').replace('.json', '');
          if (/^\d{8,15}$/.test(phone)) {
            const jid = `${phone}@s.whatsapp.net`;
            const lid = this.phoneToLidMap[phone];
            const resolved = this.resolveRealContact(jid);
            const knownName = resolved.contactName || this.contactsMap[jid] || this.contactsMap[phone];
            const existing = this.userGroups.find((g) => g.id === jid || (lid && g.id === `${lid}@lid`));
            if (knownName && !knownName.startsWith('+10')) {
              if (existing) {
                if (existing.name !== knownName) {
                  existing.name = knownName;
                  countAdded++;
                }
                if (resolved.formattedPhone) existing.phone = resolved.formattedPhone;
              } else {
                this.userGroups.push({
                  id: jid,
                  name: knownName,
                  unreadCount: 0,
                  isGroup: false,
                  phone: resolved.formattedPhone,
                  avatarUrl: this.avatarsMap[phone] || this.avatarsMap[lid || ''],
                });
                countAdded++;
              }
            }
          }
        }
      }
      this.sanitizeUserGroupsAndMessages();
      if (countAdded > 0) {
        this.persistData();
      }
    } catch (e) {
      console.error('خطأ في استيراد جهات الاتصال المخزنة:', e);
    }
  }

  private persistTimeout: NodeJS.Timeout | null = null;

  private persistData(debounceMs: number = 500) {
    if (this.persistTimeout) {
      clearTimeout(this.persistTimeout);
    }
    this.persistTimeout = setTimeout(() => {
      this.persistDataImmediate();
    }, debounceMs);
  }

  public persistDataImmediate() {
    try {
      fs.writeFileSync(this.messagesFilePath, JSON.stringify(this.incomingMessages, null, 2), 'utf-8');
      fs.writeFileSync(this.groupsFilePath, JSON.stringify(this.userGroups, null, 2), 'utf-8');
    } catch (e) {
      console.error('خطأ في حفظ ملفات واتساب:', e);
    }
  }

  public resetSampleMessages() {
    this.incomingMessages = [];
    this.persistDataImmediate();
  }

  public clearDemoMessages(): number {
    const initialCount = this.incomingMessages.length;
    this.incomingMessages = this.incomingMessages.filter(
      (m: any) => !m.isDemo && !String(m.id).startsWith('msg_')
    );
    this.persistData();
    return initialCount - this.incomingMessages.length;
  }

  public clearAllMessages(): void {
    this.incomingMessages = [];
    this.persistData();
  }

  public async connect(): Promise<void> {
    const isBuildPhase =
      process.env.NEXT_PHASE === 'phase-production-build' ||
      process.argv.some((arg) => arg.includes('build') || arg.includes('next-build'));
    if (isBuildPhase) {
      return;
    }

    if (this.isConnecting) {
      return;
    }
    if (this.connectionStatus === 'CONNECTED' && this.sock?.user) {
      return;
    }

    if (!this.acquireLock()) {
      console.log('[WhatsApp] مثيل آخر يدير جلسة واتساب حالياً، تم تجنب فتح اتصال مكرر.');
      if (!this.reconnectTimeout) {
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectTimeout = null;
          this.connect();
        }, 5000);
      }
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.isConnecting = true;
    this.connectionStatus = 'CONNECTING';

    try {
      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners('connection.update');
          this.sock.ev.removeAllListeners('creds.update');
          this.sock.ev.removeAllListeners('presence.update');
          this.sock.ev.removeAllListeners('messages.upsert');
          this.sock.end(undefined);
        } catch (e) {}
        this.sock = null;
      }

      // استيراد ديناميكي لحزمة Baileys
      const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = await import('@whiskeysockets/baileys');
      const pino = (await import('pino')).default;

      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      this.appStateKeys = state.keys;

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.windows('Desktop'),
        syncFullHistory: false,
        emitOwnEvents: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        shouldSyncHistoryMessage: (msg: any) => {
          return msg?.syncType !== 3; // يسمح بمزامنة الرسائل والتفاعلات الحديثة RECENT و ON_DEMAND ويرفض FULL الضخم القديم
        },
        getMessage: async (key) => {
          const found = this.incomingMessages.find((m) => m.id === key.id || m.rawBaileysMessage?.key?.id === key.id);
          if (found?.rawBaileysMessage?.message) {
            return found.rawBaileysMessage.message;
          }
          return undefined;
        },
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('presence.update', (update: {
        id: string;
        presences: Record<string, { lastKnownPresence: WhatsAppPresence['state']; lastSeen?: number }>;
      }) => {
        if (!update?.id || !update.presences) return;
        for (const jid of this.getPresenceJids(update.id)) {
          const chatPresences = this.presences.get(jid) || new Map<string, WhatsAppPresence>();
          for (const [participant, value] of Object.entries(update.presences)) {
            const presenceParticipant = jid.endsWith('@g.us') ? participant : jid;
            const previous = chatPresences.get(presenceParticipant);
            chatPresences.set(presenceParticipant, {
              jid,
              participant: presenceParticipant,
              state: value.lastKnownPresence,
              lastSeen: value.lastSeen
                ? value.lastSeen * 1000
                : value.lastKnownPresence === 'unavailable' ? previous?.lastSeen : undefined,
              updatedAt: Date.now(),
            });
          }
          this.presences.set(jid, chatPresences);
          this.events.emit('presence', { jid, presences: Array.from(chatPresences.values()) });
        }
      });

      this.sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrCodeDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
          this.connectionStatus = 'SCAN_QR';
          this.events.emit('status', this.getStatus());
        }

        if (connection === 'close') {
          this.isConnecting = false;
          this.qrCodeDataUrl = null;
          this.presences.clear();
          this.presenceSubscriptions.clear();
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const isReplaced = statusCode === DisconnectReason.connectionReplaced || statusCode === 440;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

          console.log(`[WhatsApp] حالة الاتصال: إغلاق، الكود: ${statusCode || 'غير محدد'}`);

          if (isLoggedOut) {
            // تسجيل خروج مقصود من جهاز الهاتف
            this.connectionStatus = 'DISCONNECTED';
            this.qrCodeDataUrl = null;
            this.connectedUser = null;
            this.releaseLock();
          } else if (isReplaced) {
            // كود 440: جلسة أخرى تم فتحها في مكان آخر أو تعارض بين متصفحين
            console.warn('[WhatsApp] تم تعليق الاتصال لأن هناك جلسة أخرى نشطة بنفس الحساب (كود 440). لن يتم تكرار الاتصال قسرياً.');
            this.connectionStatus = 'DISCONNECTED';
            this.releaseLock();
          } else {
            // انقطاع مؤقت أو إعادة تشغيل روتينية للاتصال
            this.connectionStatus = 'CONNECTING';
            const delay = statusCode === DisconnectReason.restartRequired ? 2000 : 5000;
            if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = setTimeout(() => {
              this.connect().catch((err) => console.error('خطأ أثناء محاولة إعادة الاتصال بواتساب:', err));
            }, delay);
          }
          this.events.emit('status', this.getStatus());
        } else if (connection === 'open') {
          this.isConnecting = false;
          this.connectionStatus = 'CONNECTED';
          this.qrCodeDataUrl = null;
          console.log('[WhatsApp] تم الاتصال وتثبيت الجلسة بنجاح واستقرار.');

          if (this.sock?.user?.id) {
            const userJid = this.sock.user.id;
            const phoneNum = userJid.split(':')[0];
            this.connectedUser = {
              name: this.sock.user.name || phoneNum,
              phone: phoneNum,
              jid: userJid,
            };
          } else {
            this.connectedUser = null;
          }

          this.events.emit('status', this.getStatus());

          this.syncGroups().catch(() => {});
          this.syncStoredContacts();
          this.flushPendingMessages().catch(() => {});
          setTimeout(() => {
            this.syncAvatars().catch((err) => console.error('خطأ في مزامنة صور البروفايل:', err));
            this.flushPendingMessages().catch(() => {});
            this.syncMissingMedia().catch(() => {});
            this.sock?.resyncAppState?.(['regular_low']).catch(() => {});
          }, 1500);
        }
      });

      // استقبال سجل المحادثات والرسائل الفعلية الكاملة من الهاتف عند المزامنة
      this.sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }: any) => {
        if (contacts && Array.isArray(contacts)) {
          for (const c of contacts) {
            if (c?.id) {
              const name = c.notify || c.name || c.verifiedName;
              if (name && name !== 'null') {
                this.contactsMap[c.id] = name;
                if (c.id.includes('@')) {
                  const cleanPhone = c.id.split('@')[0];
                  this.contactsMap[`${cleanPhone}@s.whatsapp.net`] = name;
                }
              }
            }
          }
          this.persistContacts();
        }

        if (chats && Array.isArray(chats)) {
          for (const c of chats) {
            if (c?.id && c.id !== 'status@broadcast') {
              const isGroup = c.id.endsWith('@g.us');
              const hasArchiveState = c.archived !== undefined || c.archive !== undefined || c.isArchived !== undefined;
              const isArchived = Boolean(c.archived || c.archive || c.isArchived);
              let name = c.name || c.subject || this.contactsMap[c.id];
              let phone: string | undefined;
              if (!isGroup) {
                const resolved = this.resolveRealContact(c.id);
                name = (name && !name.startsWith('+10')) ? name : resolved.contactName;
                phone = resolved.formattedPhone;
              } else {
                if (!name) name = 'مجموعة واتساب';
              }
              const existing = this.userGroups.find((g) => g.id === c.id);
              if (existing) {
                if (name && !name.startsWith('+10') && existing.name !== name) existing.name = name;
                existing.isGroup = isGroup;
                if (phone) existing.phone = phone;
                if (hasArchiveState) existing.archived = isArchived;
              } else {
                this.userGroups.push({ id: c.id, name, unreadCount: c.unreadCount || 0, isGroup, phone, ...(hasArchiveState ? { archived: isArchived } : {}) });
              }
            }
          }
        }

        // إضافة كافة جهات الاتصال الخاصة الفردية إلى القائمة
        for (const [jid, contactName] of Object.entries(this.contactsMap)) {
          if (contactName && !contactName.startsWith('+10') && !this.userGroups.some((g) => g.id === jid || g.name === contactName)) {
            const resolved = this.resolveRealContact(jid);
            this.userGroups.push({
              id: jid,
              name: contactName,
              unreadCount: 0,
              isGroup: false,
              phone: resolved.formattedPhone,
            });
          }
        }

        if (messages && Array.isArray(messages)) {
          for (const msg of messages) {
            await this.ingestBaileysMessage(msg);
          }
        }
        this.sanitizeUserGroupsAndMessages();
        this.persistData();
      });

      // تحديث قائمة المحادثات عند وصول أي محادثات جديدة
      this.sock.ev.on('chats.set', ({ chats }: any) => {
        if (chats && Array.isArray(chats)) {
          for (const c of chats) {
            if (!c?.id || c.id === 'status@broadcast') continue;
            const isGroup = c.id.endsWith('@g.us');
            const hasArchiveState = c.archived !== undefined || c.archive !== undefined || c.isArchived !== undefined;
            const isArchived = Boolean(c.archived || c.archive || c.isArchived);
            let name = c.name;
            let phone: string | undefined;
            if (isGroup) {
              name = name || 'مجموعة واتساب';
            } else {
              const resolved = this.resolveRealContact(c.id);
              name = (name && !name.startsWith('+10')) ? name : resolved.contactName;
              phone = resolved.formattedPhone;
            }
            const existing = this.userGroups.find((g) => g.id === c.id);
            if (existing) {
              if (name && !name.startsWith('+10')) existing.name = name;
              if (phone) existing.phone = phone;
              if (hasArchiveState) existing.archived = isArchived;
            } else {
              this.userGroups.push({
                id: c.id,
                name: name || c.id,
                unreadCount: c.unreadCount || 0,
                isGroup,
                phone,
                ...(hasArchiveState ? { archived: isArchived } : {}),
              });
            }
          }
          this.sanitizeUserGroupsAndMessages();
          this.persistData();
        }
      });

      this.sock.ev.on('chats.upsert', (newChats: any) => {
        if (Array.isArray(newChats)) {
          for (const c of newChats) {
            if (!c?.id || c.id === 'status@broadcast') continue;
            const isGroup = c.id.endsWith('@g.us');
            const hasArchiveState = c.archived !== undefined || c.archive !== undefined || c.isArchived !== undefined;
            const isArchived = Boolean(c.archived || c.archive || c.isArchived);
            let name = c.name;
            let phone: string | undefined;
            if (isGroup) {
              name = name || 'مجموعة واتساب';
            } else {
              const resolved = this.resolveRealContact(c.id);
              name = (name && !name.startsWith('+10')) ? name : resolved.contactName;
              phone = resolved.formattedPhone;
            }
            const existing = this.userGroups.find((g) => g.id === c.id);
            if (existing) {
              if (name && !name.startsWith('+10')) existing.name = name;
              if (phone) existing.phone = phone;
              if (hasArchiveState) existing.archived = isArchived;
            } else {
              this.userGroups.push({
                id: c.id,
                name: name || c.id,
                unreadCount: c.unreadCount || 0,
                isGroup,
                phone,
                ...(hasArchiveState ? { archived: isArchived } : {}),
              });
            }
          }
          this.sanitizeUserGroupsAndMessages();
          this.persistData();
        }
      });

      // استقبال جهات الاتصال لتسمية المحادثات الفردية بدقة
      this.sock.ev.on('contacts.set', ({ contacts }: any) => {
        if (contacts && Array.isArray(contacts)) {
          for (const c of contacts) {
            if (c?.id) {
              const name = c.notify || c.name || c.verifiedName;
              if (name && name !== 'null') {
                this.contactsMap[c.id] = name;
                if (c.id.includes('@')) {
                  const cleanPhone = c.id.split('@')[0];
                  this.contactsMap[`${cleanPhone}@s.whatsapp.net`] = name;
                }
                const found = this.userGroups.find((g) => g.id === c.id);
                if (found) {
                  found.name = name;
                } else if (!c.id.endsWith('@g.us')) {
                  this.userGroups.push({ id: c.id, name, unreadCount: 0, isGroup: false });
                }
              }
            }
          }
          this.persistContacts();
          this.persistData();
        }
      });

      this.sock.ev.on('contacts.upsert', (newContacts: any) => {
        if (Array.isArray(newContacts)) {
          for (const c of newContacts) {
            if (c?.id) {
              const name = c.notify || c.name || c.verifiedName;
              if (name && name !== 'null') {
                this.contactsMap[c.id] = name;
                if (c.id.includes('@')) {
                  const cleanPhone = c.id.split('@')[0];
                  this.contactsMap[`${cleanPhone}@s.whatsapp.net`] = name;
                }
                const found = this.userGroups.find((g) => g.id === c.id);
                if (found) {
                  found.name = name;
                } else if (!c.id.endsWith('@g.us')) {
                  this.userGroups.push({ id: c.id, name, unreadCount: 0, isGroup: false });
                }
              }
            }
          }
          this.persistContacts();
          this.persistData();
        }
      });

      this.sock.ev.on('contacts.update', (updates: any[]) => {
        if (Array.isArray(updates)) {
          for (const c of updates) {
            if (c?.id) {
              const name = c.notify || c.name || c.verifiedName;
              if (name && name !== 'null' && !name.startsWith('+10')) {
                this.contactsMap[c.id] = name;
                if (c.id.includes('@')) {
                  const cleanPhone = c.id.split('@')[0];
                  this.contactsMap[`${cleanPhone}@s.whatsapp.net`] = name;
                }
                const found = this.userGroups.find((g) => g.id === c.id);
                if (found) {
                  found.name = name;
                }
              }
            }
          }
          this.persistContacts();
        }
      });

      // استقبال الرسائل الجديدة فور وصولها
      this.sock.ev.on('messages.upsert', async (m: any) => {
        if (m.messages && Array.isArray(m.messages)) {
          for (const msg of m.messages) {
            await this.ingestBaileysMessage(msg);
          }
        }
      });

      // استقبال تحديثات الرسائل (تعديل نص الرسالة أو تحديث التفاعلات)
      this.sock.ev.on('messages.update', (updates: any[]) => {
        console.log('[WhatsApp Event: messages.update]', updates?.length);
        if (Array.isArray(updates)) {
          for (const u of updates) {
            this.handleIncomingMessageUpdate(u);
          }
        }
      });

      // استقبال تحديثات المحادثات المباشرة من واتساب (الأرشفة، الكتم، التثبيت، قراءة الرسائل)
      this.sock.ev.on('chats.update', (updates: any[]) => {
        if (!Array.isArray(updates)) return;
        let hasChanges = false;
        for (const u of updates) {
          if (!u?.id) continue;
          if (typeof u.conditional === 'function') {
            const latestReceived = this.incomingMessages.find((message) =>
              message.chatJid === u.id && !message.isFromMe
            );
            const lastMessageRecvTimestamp = Math.floor((latestReceived?.timestampMs || 0) / 1000);
            const applicable = u.conditional({
              historySets: { chats: { [u.id]: { lastMessageRecvTimestamp } } },
              chatUpserts: {},
            });
            if (applicable === false) continue;
          }
          const grp = this.userGroups.find((g) => g.id === u.id);
          const isArchived = u.archived !== undefined ? Boolean(u.archived) : u.archive !== undefined ? Boolean(u.archive) : undefined;
          if (grp) {
            if (isArchived !== undefined && grp.archived !== isArchived) {
              grp.archived = isArchived;
              hasChanges = true;
            }
            if (u.unreadCount !== undefined && u.unreadCount !== null) {
              const count = Number(u.unreadCount);
              if (count >= 0 && grp.unreadCount !== count) {
                grp.unreadCount = count;
                hasChanges = true;
              }
            }
          } else if (isArchived !== undefined) {
            const isGroup = u.id.endsWith('@g.us');
            const resolved = !isGroup ? this.resolveRealContact(u.id) : null;
            this.userGroups.push({
              id: u.id,
              name: resolved?.contactName || u.id,
              unreadCount: 0,
              isGroup,
              phone: resolved?.formattedPhone,
              archived: isArchived,
            });
            hasChanges = true;
          }
        }
        if (hasChanges) {
          this.persistDataImmediate();
          this.emitGroupsThrottled();
        }
      });

      // حذف محادثة عند حذفها من واتساب
      this.sock.ev.on('chats.delete', (chatIds: string[]) => {
        if (!Array.isArray(chatIds)) return;
        this.userGroups = this.userGroups.filter((g) => !chatIds.includes(g.id));
        this.persistDataImmediate();
        this.emitGroupsThrottled();
      });

      // استقبال تفاعلات الإيموجي (Reactions) الفورية وتحديث الرسائل
      this.sock.ev.on('messages.reaction', (reactions: any[]) => {
        console.log('[WhatsApp Event: messages.reaction]', JSON.stringify(reactions));
        if (Array.isArray(reactions)) {
          for (const r of reactions) {
            this.handleIncomingReaction(r);
          }
        }
      });

      // استقبال إشعارات وصول وقراءة الرسائل (Message Receipts: Delivered / Read)
      // كل إشعار يخص عضواً واحداً: متى استلم (receiptTimestamp) ومتى قرأ (readTimestamp/playedTimestamp)
      this.sock.ev.on('message-receipt.update', async (receipts: any[]) => {
        if (!Array.isArray(receipts)) return;
        let hasChanges = false;
        for (const r of receipts) {
          const targetId = r?.key?.id;
          if (!targetId) continue;
          const targetMsg = this.incomingMessages.find(
            (m) => m.id === targetId || m.rawBaileysMessage?.key?.id === targetId
          );
          // الصح يخص رسائلي الصادرة فقط
          if (!targetMsg || !(targetMsg.isFromMe || targetMsg.rawBaileysMessage?.key?.fromMe)) continue;

          const receipt = r.receipt || {};
          const memberStatus: 'delivered' | 'read' | null =
            receipt.readTimestamp || receipt.playedTimestamp ? 'read' : receipt.receiptTimestamp ? 'delivered' : null;
          if (!memberStatus) continue;

          const remoteJid: string = r.key?.remoteJid || targetMsg.chatJid || '';
          let next: 'delivered' | 'read' | null = memberStatus;

          if (remoteJid.endsWith('@g.us')) {
            // القروب: نحفظ حالة كل عضو، والصح يعكس أقل حالة بين الجميع (مثل واتساب تماماً)
            const userJid: string = receipt.userJid || r.key?.participant || '';
            if (!userJid) continue;
            // تجاهل إشعارات أجهزتي أنا (مثل قراءة الرسالة من جوالي) لأنها ليست عضواً آخر
            const bareUser = (jid?: string) => (jid || '').split('@')[0].split(':')[0];
            const me = this.sock?.user;
            if ([me?.id, (me as any)?.lid].some((j) => j && bareUser(j) === bareUser(userJid))) continue;
            targetMsg.receiptsBy = targetMsg.receiptsBy || {};
            const entry = this.normalizeReceipt(targetMsg.receiptsBy[userJid]);
            const at = memberStatus === 'read'
              ? this.toMillis(receipt.readTimestamp || receipt.playedTimestamp)
              : this.toMillis(receipt.receiptTimestamp);
            if (memberStatus === 'read' && entry.readAt === undefined) {
              entry.readAt = at || Date.now();
              hasChanges = true;
            } else if (memberStatus === 'delivered' && entry.deliveredAt === undefined) {
              entry.deliveredAt = at || Date.now();
              hasChanges = true;
            }
            targetMsg.receiptsBy[userJid] = entry;
            // إرسال التحديث للواجهة لتحديث نافذة "معلومات الرسالة" إن كانت مفتوحة
            this.events.emit('receipt', { messageId: targetId, status: targetMsg.deliveryStatus });

            const others = await this.getGroupOtherMembersCount(remoteJid);
            const states = Object.values(targetMsg.receiptsBy).map((v) => this.normalizeReceipt(v));
            const readCount = states.filter((s) => s.readAt !== undefined).length;
            next = null;
            if (others !== null && others > 0) {
              if (readCount >= others) next = 'read';
              else if (states.length >= others) next = 'delivered';
            }
          }

          if (next && this.upgradeDeliveryStatus(targetMsg, next)) {
            hasChanges = true;
            this.events.emit('receipt', { messageId: targetId, status: targetMsg.deliveryStatus });
          }
        }
        if (hasChanges) {
          this.persistData();
        }
      });
    } catch (error) {
      console.error('فشل بدء جلسة Baileys:', error);
      this.isConnecting = false;
      this.connectionStatus = 'DISCONNECTED';
      this.qrCodeDataUrl = null;
      try { this.sock?.end(undefined); } catch {}
      this.sock = null;
      this.releaseLock();
      this.events.emit('status', this.getStatus());
    }
  }

  public async syncGroups(force = false): Promise<WhatsAppGroupItem[]> {
    if (!this.sock || this.connectionStatus !== 'CONNECTED') {
      return this.userGroups;
    }

    const now = Date.now();
    // تجنب استدعاء groupFetchAllParticipating أكثر من مرة كل 10 دقائق لتفادي 429 rate-overlimit
    if (!force && this.userGroups.length > 0 && now - this.lastGroupFetchTime < 10 * 60 * 1000) {
      return this.userGroups;
    }

    try {
      this.lastGroupFetchTime = now;
      if (force && typeof this.sock.resyncAppState === 'function') {
        try {
          this.lastArchiveSyncError = null;
          this.lastArchiveSyncStatus = 'starting';
          // Use the live socket's key store. A newly opened disk store can differ
          // from the socket's transactional cache and leave the snapshot unchanged.
          const socketKeys = this.sock.authState?.keys;
          const storeChanged = this.appStateKeys !== socketKeys;
          this.appStateKeys = socketKeys;
          if (!this.appStateKeys) throw new Error('مخزن حالة واتساب غير متاح في الاتصال الحالي');
          // A normal resync starts at the stored version and misses archive actions
          // that happened on the phone before this linked device was connected.
          if (this.archiveSnapshotRevision !== 3 || storeChanged || now - this.lastArchiveSnapshotTime > 30 * 60 * 1000) {
            const previous = (await this.appStateKeys.get('app-state-sync-version', ['regular_low']))?.regular_low;
            this.lastArchiveSyncStatus = `version:${previous?.version ?? 'none'}`;
            if (previous?.version) {
              await this.appStateKeys.set({ 'app-state-sync-version': { regular_low: null } });
              const resetState = (await this.appStateKeys.get('app-state-sync-version', ['regular_low']))?.regular_low;
              if (resetState) {
                await this.appStateKeys.set({ 'app-state-sync-version': { regular_low: previous } });
                throw new Error('تعذر إعادة قراءة حالة الأرشفة من بدايتها');
              }
              let archiveUpdates = 0;
              const captureArchiveUpdates = (updates: any[]) => {
                for (const update of updates || []) {
                  if (!update?.id || typeof update.archived !== 'boolean') continue;
                  archiveUpdates += 1;
                  const chat = this.userGroups.find((group) => group.id === update.id);
                  if (chat) chat.archived = update.archived;
                  else this.userGroups.push({
                    id: update.id,
                    name: update.id,
                    unreadCount: 0,
                    isGroup: update.id.endsWith('@g.us'),
                    archived: update.archived,
                  });
                }
              };
              this.sock.ev.on('chats.update', captureArchiveUpdates);
              try {
                await this.sock.resyncAppState(['regular_low']);
                this.lastArchiveSyncStatus = `snapshot-done:${archiveUpdates}`;
                if (archiveUpdates) {
                  this.persistDataImmediate();
                  this.emitGroupsThrottled();
                }
              } catch (error) {
                await this.appStateKeys.set({ 'app-state-sync-version': { regular_low: previous } });
                throw error;
              } finally {
                this.sock.ev.off('chats.update', captureArchiveUpdates);
              }
              this.lastArchiveSnapshotTime = now;
              this.archiveSnapshotRevision = 3;
            } else {
              await this.sock.resyncAppState(['regular_low']);
              this.lastArchiveSyncStatus = 'initial-done';
            }
          } else {
            await this.sock.resyncAppState(['regular_low']);
            this.lastArchiveSyncStatus = 'incremental-done';
          }
        } catch (error: any) {
          this.lastArchiveSyncError = error?.message || String(error);
          this.lastArchiveSyncStatus = 'failed';
          console.warn('تعذر تحديث حالة أرشفة واتساب:', this.lastArchiveSyncError);
        }
      } else if (force) {
        this.lastArchiveSyncStatus = 'unsupported';
        this.lastArchiveSyncError = 'اتصال واتساب لا يدعم مزامنة حالة الأرشفة';
      }
      const participatingGroups = await this.sock.groupFetchAllParticipating();
      for (const [id, grp] of Object.entries<any>(participatingGroups)) {
        const existing = this.userGroups.find((g) => g.id === id);
        if (existing) {
          existing.name = grp.subject || existing.name;
          existing.isGroup = true;
        } else {
          this.userGroups.push({
            id,
            name: grp.subject || 'مجموعة واتساب',
            unreadCount: 0,
            isGroup: true,
          });
        }
      }

      // إضافة أي محادثات فردية واردة في سجل الرسائل
      for (const m of this.incomingMessages) {
        if (m.chatJid && !this.userGroups.some((g) => g.id === m.chatJid)) {
          const isGrp = m.chatJid.endsWith('@g.us');
          this.userGroups.push({
            id: m.chatJid,
            name: m.chatName || m.senderName || (isGrp ? 'مجموعة' : 'محادثة فردية'),
            unreadCount: 0,
            isGroup: isGrp,
          });
        }
      }

      // استيراد جهات الاتصال والأرقام المحفوظة
      this.syncStoredContacts();
      this.sanitizeUserGroupsAndMessages();
      this.syncAvatars().catch(() => {});

      this.persistData();
      this.events.emit('groups', this.getUserGroups());
      return this.userGroups;
    } catch (e: any) {
      console.warn('تنبيه في مزامنة المجموعات من واتساب (تم الاعتماد على المجموعات المخزنة محلياً):', e?.message || e);
      this.syncStoredContacts();
      this.sanitizeUserGroupsAndMessages();
      return this.userGroups;
    }
  }

  private async ingestBaileysMessage(msg: any) {
    if (!msg?.message && !msg?.reactions) return;
    if (!isConversationJid(msg.key?.remoteJid)) return;
    const id = msg.key?.id || String(Date.now() + Math.random());
    const existingIdx = this.incomingMessages.findIndex(
      (m) => m.id === id || m.rawBaileysMessage?.key?.id === id
    );
    if (existingIdx !== -1) {
      let changed = false;
      const existing = this.incomingMessages[existingIdx];

      if (!existing.quotedMessage) {
        const q = this.extractQuotedMessage(msg, this.incomingMessages);
        if (q) {
          existing.quotedMessage = q;
          existing.rawBaileysMessage = msg;
          changed = true;
        }
      }

      // مزامنة التفاعلات إن وُجدت في الرسالة المستلمة من السجل أو التحديث
      if (Array.isArray(msg.reactions) && msg.reactions.length > 0) {
        const extracted = this.extractReactions(msg);
        if (extracted.length > 0) {
          existing.reactions = extracted;
          changed = true;
        }
      }

      if (changed) {
        this.persistData();
      }

      this.applyPendingReactions(id);
      return;
    }

    const content = unwrapMessageContent(msg.message);

    // إذا كانت الرسالة تفاعل إيموجي (Reaction) وارد أو صادر
    if (content?.reactionMessage) {
      this.handleIncomingReaction({
        key: content.reactionMessage?.key,
        reaction: {
          ...content.reactionMessage,
          key: msg.key,
        },
      });
      return;
    }

    // إذا كانت الرسالة بروتوكول حذف لدى الجميع (Revoke) أو تعديل رسالة (Message Edit)
    if (content?.protocolMessage) {
      const proto = content.protocolMessage;
      const targetId = proto.key?.id;
      if (proto.type === 0 || proto.type === 'REVOKE') {
        if (targetId) {
          this.handleMessageRevoked(targetId, proto.key);
          return;
        }
      }
      if (proto.type === 14 || proto.type === 'MESSAGE_EDIT') {
        if (targetId && proto.editedMessage) {
          this.handleMessageEdited(targetId, proto.editedMessage, proto.key);
          return;
        }
      }
    }

    if (content?.editedMessage) {
      const proto = content.editedMessage?.message?.protocolMessage;
      const targetId = proto?.key?.id;
      if (proto && (proto.type === 14 || proto.type === 'MESSAGE_EDIT') && targetId && proto.editedMessage) {
        this.handleMessageEdited(targetId, proto.editedMessage, proto.key);
        return;
      }
    }

    const isImage = Boolean(content?.imageMessage);
    const isVideo = Boolean(content?.videoMessage);
    const isAudio = Boolean(content?.audioMessage);
    const isSticker = Boolean(content?.stickerMessage);
    const isDocument = Boolean(content?.documentMessage);
    const isViewOnce = isViewOnceMessage(msg.message);
    const hasMedia = !isViewOnce && (isImage || isVideo || isAudio || isSticker || isDocument);

    let mediaType: 'image' | 'video' | 'audio' | 'voice' | 'sticker' | 'document' | undefined;
    let mediaDuration: number | undefined;

    if (isSticker) {
      mediaType = 'sticker';
    } else if (isAudio) {
      mediaType = content.audioMessage.ptt ? 'voice' : 'audio';
      mediaDuration = Number(content.audioMessage.seconds) || undefined;
    } else if (isVideo) {
      mediaType = 'video';
      mediaDuration = Number(content.videoMessage.seconds) || undefined;
    } else if (isImage) {
      mediaType = 'image';
    } else if (isDocument) {
      mediaType = 'document';
    }

    const body = isViewOnce ? viewOnceNotice(Boolean(msg.key?.fromMe)) : (
      content?.conversation ||
      content?.extendedTextMessage?.text ||
      content?.imageMessage?.caption ||
      content?.videoMessage?.caption ||
      content?.documentMessage?.caption ||
      (isAudio ? (content.audioMessage.ptt ? 'تسجيل صوتي' : 'مقطع صوتي') : '') ||
      (isSticker ? 'ملصق' : '') ||
      (isVideo ? 'مقطع فيديو' : '') ||
      '');

    if (!body && !hasMedia) return;

    const senderJid = this.getCanonicalChatJid(msg.key?.remoteJid || '');
    const isGroup = senderJid.endsWith('@g.us');
    const fromMe = Boolean(msg.key?.fromMe);

    let senderName = '';
    if (fromMe) {
      senderName = 'أنا';
    } else if (isGroup) {
      const participant = msg.participant || msg.key?.participant;
      if (participant) {
        const resolvedPart = this.resolveRealContact(participant, msg.pushName);
        senderName = resolvedPart.contactName || resolvedPart.formattedPhone || msg.pushName || 'عضو';
      } else {
        senderName = msg.pushName || 'عضو';
      }
    } else {
      senderName = msg.pushName || 'مشترك';
    }

    let groupTitle = '';
    if (isGroup) {
      const found = this.userGroups.find((g) => g.id === senderJid);
      groupTitle = found ? found.name : 'مجموعة واتساب';
      if (!found) {
        this.userGroups.push({ id: senderJid, name: 'مجموعة واتساب', unreadCount: 1, isGroup: true });
      } else {
        found.unreadCount = (found.unreadCount || 0) + 1;
      }
    } else {
      const resolved = this.resolveRealContact(senderJid, fromMe ? undefined : msg.pushName);
      groupTitle = resolved.contactName;

      const found = this.userGroups.find(
        (g) => g.id === senderJid || (resolved.realPhone && (g.id === `${resolved.realPhone}@s.whatsapp.net` || g.phone === resolved.formattedPhone))
      );

      if (found) {
        if (resolved.contactName && !resolved.contactName.startsWith('+10') && found.name !== resolved.contactName) {
          found.name = resolved.contactName;
        }
        if (resolved.formattedPhone) found.phone = resolved.formattedPhone;
        if (!fromMe) found.unreadCount = (found.unreadCount || 0) + 1;
      } else {
        this.userGroups.push({
          id: senderJid,
          name: groupTitle,
          unreadCount: fromMe ? 0 : 1,
          isGroup: false,
          phone: resolved.formattedPhone,
          avatarUrl: this.avatarsMap[resolved.cleanId],
        });
      }
    }

    const timestampSeconds = msg.messageTimestamp;
    const timestampMs = timestampSeconds
      ? (Number(timestampSeconds) > 1e11 ? Number(timestampSeconds) : Number(timestampSeconds) * 1000)
      : Date.now();
    const timestamp = new Date(timestampMs).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    const decodedBody = this.decodeMentions(body);

    // استخراج معلومات الرسالة المقتبسة إن كانت هذه الرسالة رداً على رسالة أخرى
    const quotedMessage = this.extractQuotedMessage(msg, this.incomingMessages);

    let deliveryStatus: 'pending' | 'sent' | 'delivered' | 'read' | undefined = undefined;
    if (fromMe) {
      const s = msg.status;
      if (s === 1 || s === 'PENDING' || s === 'pending') deliveryStatus = 'pending';
      else if (s === 2 || s === 'SERVER_ACK' || s === 'sent') deliveryStatus = 'sent';
      else if (s === 3 || s === 'DELIVERY_ACK' || s === 'delivered') deliveryStatus = 'delivered';
      else if (s === 4 || s === 5 || s === 'READ' || s === 'PLAYED' || s === 'read' || s === 'played') deliveryStatus = 'read';
      else deliveryStatus = 'sent';
    }

    // فحص إذا كانت هذه الرسالة تمتلك مسبقاً وصلاً مشبوكاً أو حالة مسجلة من حساب آخر
    const initialShared = WhatsAppManager.getSharedMeta()[id];

    // إضافة الرسالة فوراً دون انتظار تنزيل الوسائط لضمان ظهور الرسائل فوراً
    this.incomingMessages.unshift({
      id,
      sender: fromMe ? 'أنا' : (isGroup ? senderName : groupTitle),
      senderName: fromMe ? 'أنا' : (msg.pushName || senderName || groupTitle),
      text: decodedBody,
      timestamp,
      timestampMs,
      hasMedia,
      isViewOnce,
      mediaUrl: undefined,
      linkedReceiptUrl: initialShared?.linkedReceiptUrl,
      linkedMsgId: initialShared?.linkedMsgId,
      mediaType,
      mediaDuration,
      isForwarded: Boolean(content?.extendedTextMessage?.contextInfo?.isForwarded),
      chatJid: senderJid,
      chatName: groupTitle,
      isFromMe: fromMe,
      deliveryStatus,
      status: initialShared?.status ? { ...initialShared.status } : {},
      rawBaileysMessage: msg,
      quotedMessage,
      reactions: this.extractReactions(msg),
      isDeleted: Boolean(this.getRevokedIds().has(id)),
      deletedAt: this.getRevokedIds().has(id) ? Date.now() : undefined,
    });

    this.applyPendingReactions(id);
    this.persistData();
    this.events.emit('message', this.incomingMessages[0]);

    // الوسائط القديمة تُجلب عند فتح المحادثة؛ تنزيل تاريخ كامل هنا يزاحم الصور الظاهرة.
    if (hasMedia && this.sock && timestampMs >= Date.now() - 2 * 60 * 60 * 1000) {
      void this.downloadMediaInBackground(id, msg, content);
    }
  }

  public async downloadMediaInBackground(id: string, msg: any, content?: any): Promise<string | undefined> {
    if (this.incomingMessages.some((message) => message.id === id && message.isViewOnce) ||
        isViewOnceMessage(msg?.message)) return undefined;
    // The chat prefetch, manual retry and /media route can request the same item together.
    // Reuse one WhatsApp download instead of making competing network requests.
    this.mediaDownloadsInFlight ??= new Map();
    const existing = this.mediaDownloadsInFlight.get(id);
    if (existing) return existing;
    const download = this.downloadMediaOnce(id, msg, content);
    this.mediaDownloadsInFlight.set(id, download);
    const clear = () => {
      if (this.mediaDownloadsInFlight.get(id) === download) this.mediaDownloadsInFlight.delete(id);
    };
    void download.then(clear, clear);
    return download;
  }

  private async downloadMediaOnce(id: string, msg: any, content?: any): Promise<string | undefined> {
    // 1. فحص فوري: إذا كان الملف محملاً مسبقاً على القرص، إرجاعه مباشرة وتحديث الرسالة
    const publicMediaDir = path.join(process.cwd(), 'public', 'media');
    const existingExts = ['webp', 'jpg', 'png', 'mp4', 'ogg', 'm4a', 'mp3', 'pdf'];
    for (const e of existingExts) {
      const p = path.join(this.mediaDir, `${id}.${e}`);
      const legacyP = path.join(publicMediaDir, `${id}.${e}`);
      if (fs.existsSync(p) || fs.existsSync(legacyP)) {
        const url = `/media/${id}.${e}`;
        const found = this.incomingMessages.find((m) => m.id === id);
        if (found) {
          found.mediaUrl = url;
          found.mediaType = e === 'webp' ? 'sticker' : e === 'mp4' ? 'video' : ['ogg', 'm4a', 'mp3'].includes(e) ? 'audio' : e === 'pdf' ? 'document' : 'image';
          this.persistData();
        }
        return url;
      }
    }

    if (!this.sock) return undefined;
    try {
      const { downloadMediaMessage, downloadContentFromMessage } = await import('@whiskeysockets/baileys');
      const pino = (await import('pino')).default;

      let buffer: Buffer | null = null;
      try {
        // Keep the URL field: Baileys requires it even when directPath is present.
        // The host override avoids DNS failures from old a.whatsapp.net URLs.
        buffer = await Promise.race([
          downloadMediaMessage(
            msg,
            'buffer',
            { host: 'mmg.whatsapp.net' },
            {
              logger: pino({ level: 'silent' }),
              reuploadRequest: async (m: any) => {
                try {
                  if (this.sock && typeof this.sock.updateMediaMessage === 'function') {
                    return await this.sock.updateMediaMessage(m);
                  }
                } catch (err) {}
                return null;
              },
            }
          ),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
        ]);
      } catch {
        // A failed primary request must still try the directPath fallback below.
      }

      // محاولة بديلة متقدمة لكافة أنواع الوسائط باستخدام downloadContentFromMessage مباشرة مع mmg.whatsapp.net
      const activeContent = unwrapMessageContent(content || msg?.message);
      if (!buffer || buffer.length === 0) {
        let mediaObj: any = null;
        let baileysMediaType: any = null;

        if (activeContent?.imageMessage) {
          mediaObj = { ...activeContent.imageMessage, url: undefined };
          baileysMediaType = 'image';
        } else if (activeContent?.stickerMessage) {
          mediaObj = { ...activeContent.stickerMessage, url: undefined };
          baileysMediaType = 'sticker';
        } else if (activeContent?.videoMessage) {
          mediaObj = { ...activeContent.videoMessage, url: undefined };
          baileysMediaType = 'video';
        } else if (activeContent?.audioMessage) {
          mediaObj = { ...activeContent.audioMessage, url: undefined };
          baileysMediaType = 'audio';
        } else if (activeContent?.documentMessage) {
          mediaObj = { ...activeContent.documentMessage, url: undefined };
          baileysMediaType = 'document';
        }

        if (mediaObj && baileysMediaType) {
          try {
            const stream = await downloadContentFromMessage(mediaObj, baileysMediaType, { host: 'mmg.whatsapp.net' });
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
              chunks.push(Buffer.from(chunk));
            }
            if (chunks.length > 0) {
              buffer = Buffer.concat(chunks);
            }
          } catch (e) {}
        }
      }

      if (buffer && buffer.length > 0) {
        if (!fs.existsSync(this.mediaDir)) {
          fs.mkdirSync(this.mediaDir, { recursive: true });
        }
        let ext = 'jpg';
        let mediaType: 'image' | 'video' | 'audio' | 'voice' | 'sticker' | 'document' = 'image';
        let mediaDuration: number | undefined;

        if (activeContent?.stickerMessage) {
          ext = 'webp';
          mediaType = 'sticker';
        } else if (activeContent?.videoMessage) {
          ext = 'mp4';
          mediaType = 'video';
          mediaDuration = Number(activeContent.videoMessage.seconds) || undefined;
        } else if (activeContent?.audioMessage) {
          const mime = String(activeContent.audioMessage.mimetype || '');
          if (mime.includes('mp4') || mime.includes('m4a')) ext = 'm4a';
          else if (mime.includes('mp3')) ext = 'mp3';
          else ext = 'ogg';
          mediaType = activeContent.audioMessage.ptt ? 'voice' : 'audio';
          mediaDuration = Number(activeContent.audioMessage.seconds) || undefined;
        } else if (activeContent?.documentMessage) {
          const fn = activeContent.documentMessage.fileName || '';
          const match = fn.match(/\.([a-zA-Z0-9]+)$/);
          ext = match ? match[1].toLowerCase() : (activeContent.documentMessage.mimetype?.includes('pdf') ? 'pdf' : 'bin');
          mediaType = 'document';
        } else {
          ext = activeContent?.imageMessage?.mimetype?.includes('png') ? 'png' : 'jpg';
          mediaType = 'image';
        }

        const filename = `${id}.${ext}`;
        fs.writeFileSync(path.join(this.mediaDir, filename), buffer);
        // /media/* is served by app/media/[...path]/route.ts from this directory.
        // Keeping a second copy under public/media doubled disk usage for every download.
        const mediaUrl = `/media/${filename}`;

        const found = this.incomingMessages.find((m) => m.id === id);
        if (found) {
          found.mediaUrl = mediaUrl;
          found.mediaType = mediaType;
          if (mediaDuration) found.mediaDuration = mediaDuration;
          this.persistData();
          this.events.emit('media', { id, mediaUrl, mediaType, mediaDuration });
        }
        return mediaUrl;
      }
    } catch (e: any) {
      if (e?.output?.statusCode !== 403 && e?.output?.statusCode !== 404) {
        console.warn(`تعذر تنزيل وسائط الرسالة ${id}:`, e?.message || e);
      }
    }
    return undefined;
  }

  public markChatAsRead(chatNameOrJid: string): void {
    const grp = this.userGroups.find(
      (g) => g.name === chatNameOrJid || g.id === chatNameOrJid
    );
    if (grp) {
      grp.unreadCount = 0;
    }
    const matchedJid = grp?.id;
    const matchedName = grp?.name;

    for (const msg of this.incomingMessages) {
      if (
        msg.chatName === chatNameOrJid ||
        msg.chatJid === chatNameOrJid ||
        (matchedJid && msg.chatJid === matchedJid) ||
        (matchedName && msg.chatName === matchedName) ||
        msg.senderName === chatNameOrJid
      ) {
        msg.read = true;
        if (!msg.status) msg.status = {};
        (msg.status as any).read = true;
      }
    }
    this.persistDataImmediate();

    // إرسال تأكيد قراءة الرسائل في واتساب الحقيقي عبر Baileys إن كان متصلاً
    if (this.sock && this.connectionStatus === 'CONNECTED') {
      try {
        const unreadKeys = this.incomingMessages
          .filter(
            (m) =>
              (m.chatName === chatNameOrJid ||
                m.chatJid === chatNameOrJid ||
                (matchedJid && m.chatJid === matchedJid)) &&
              !m.isFromMe &&
              m.rawBaileysMessage?.key
          )
          .slice(-15)
          .map((m) => m.rawBaileysMessage.key);

        if (unreadKeys.length > 0 && typeof (this.sock as any).readMessages === 'function') {
          (this.sock as any).readMessages(unreadKeys).catch(() => {});
        }
      } catch (e) {}
    }
  }

  public getStatus() {
    const hasCreds = fs.existsSync(path.join(this.authDir, 'creds.json'));
    return {
      status: this.connectionStatus,
      qrCode: this.qrCodeDataUrl,
      hasCreds,
      user: this.connectedUser,
      groupsCount: this.userGroups.length,
      messagesCount: this.incomingMessages.length,
      hasRealData: this.incomingMessages.length > 0,
      hasDemoData: false,
    };
  }

  public getUserGroups(): WhatsAppGroupItem[] {
    const groups = new Map<string, WhatsAppGroupItem>();
    for (const group of this.userGroups) {
      if (!isConversationJid(group.id)) continue;
      const id = this.getCanonicalChatJid(group.id);
      const existing = groups.get(id);
      if (!existing) {
        groups.set(id, { ...group, id });
      } else {
        existing.unreadCount = Math.max(existing.unreadCount || 0, group.unreadCount || 0);
        existing.phone ||= group.phone;
        existing.avatarUrl ||= group.avatarUrl;
        if ((!existing.name || existing.name.startsWith('+')) && group.name) existing.name = group.name;
      }
    }
    return [...groups.values()];
  }

  public getCanonicalChatJid(jid: string): string {
    const normalized = jid.replace(/:\d+@(?=(?:s\.whatsapp\.net|lid)$)/, '@');
    if (!normalized.endsWith('@lid')) return normalized;
    const lid = normalized.split('@')[0];
    const phone = this.lidToPhoneMap[lid];
    return phone ? `${phone}@s.whatsapp.net` : normalized;
  }

  public getMessages(): ChatMessage[] {
    return this.incomingMessages;
  }

  public getPresence(jid: string): WhatsAppPresence[] {
    return Array.from(this.presences.get(jid)?.values() || []);
  }

  private getPresenceJids(jid: string): string[] {
    const normalized = jid.replace(/:\d+@(?=(?:s\.whatsapp\.net|lid)$)/, '@');
    const id = normalized.split('@')[0];
    const alternate = normalized.endsWith('@lid')
      ? this.lidToPhoneMap[id] && `${this.lidToPhoneMap[id]}@s.whatsapp.net`
      : normalized.endsWith('@s.whatsapp.net')
        ? this.phoneToLidMap[id] && `${this.phoneToLidMap[id]}@lid`
        : undefined;
    return alternate && alternate !== normalized ? [normalized, alternate] : [normalized];
  }

  public async subscribePresence(jid: string): Promise<WhatsAppPresence[]> {
    if (!/^[0-9A-Za-z._:-]{1,128}@(s\.whatsapp\.net|g\.us|lid)$/.test(jid)) return [];
    if (this.connectionStatus !== 'CONNECTED' || !this.sock) return [];
    const now = Date.now();
    for (const presenceJid of this.getPresenceJids(jid)) {
      if (now - (this.presenceSubscriptions.get(presenceJid) || 0) > 30_000) {
        this.presenceSubscriptions.set(presenceJid, now);
        try {
          await this.sock.presenceSubscribe(presenceJid);
        } catch (error) {
          this.presenceSubscriptions.delete(presenceJid);
          console.warn('[WhatsApp] تعذر الاشتراك في حالة جهة الاتصال:', error);
        }
      }
    }
    return this.getPresence(jid);
  }

  public canAccessAvatar(digits: string): boolean {
    if (!/^\d{7,25}$/.test(digits)) return false;
    if (this.avatarsMap[digits]) return true;
    if (this.userGroups.some((group) =>
      group.id.split('@')[0] === digits || String(group.phone || '').replace(/\D/g, '') === digits
    )) return true;
    return this.incomingMessages.some((message) =>
      message.senderJid?.split('@')[0] === digits || message.chatJid?.split('@')[0] === digits
    );
  }

  /**
   * نسخة خفيفة من الرسالة للواجهة: الواجهة تحتاج فقط (key, messageTimestamp, status) من رسالة Baileys الخام
   * الرسالة الخام الكاملة كانت تمثل ~66% من حجم البيانات المرسلة للمتصفح
   */
  public toClientMessage(
    m: ChatMessage,
    sharedMetaSnapshot?: ReturnType<typeof WhatsAppManager.getSharedMeta>
  ): ChatMessage {
    const raw = m.rawBaileysMessage;
    const { receiptsBy: _receipts, ...rest } = m;
    void _receipts;

    // صورة ومعرّف مرسل الرسالة في القروبات (لعرض صورته بجانب رسالته كما في واتساب)
    let senderJid: string | undefined;
    let senderAvatarUrl: string | undefined;
    // رسائل سجل المحادثات المسحوبة من الجوال تحفظ المرسل في raw.participant بدلاً من raw.key.participant
    const participant: string | undefined = raw?.key?.participant || raw?.key?.participantAlt || raw?.participant;
    if ((m.chatJid || '').endsWith('@g.us') && participant && !raw?.key?.fromMe) {
      senderJid = participant;
      const digits = participant.split('@')[0].split(':')[0];
      const phone = this.lidToPhoneMap[digits];
      const lid = this.phoneToLidMap[digits];
      senderAvatarUrl = this.avatarsMap[digits] || (phone ? this.avatarsMap[phone] : undefined) || (lid ? this.avatarsMap[lid] : undefined);
    }

    const sharedMeta = (sharedMetaSnapshot || WhatsAppManager.getSharedMeta())[m.id];
    const linkedReceiptUrl = m.linkedReceiptUrl || sharedMeta?.linkedReceiptUrl;
    const linkedMsgId = m.linkedMsgId || sharedMeta?.linkedMsgId;
    const status = sharedMeta?.status ? { ...(m.status || {}), ...sharedMeta.status } : m.status;

    // إذا كانت الرسالة وسائط ولم يتوفر لها رابط محلي بعد، نفحص إن كان الملف موجوداً فعلياً على القرص فقط لتفادي الروابط الوهمية
    let effectiveMediaUrl = m.mediaUrl;
    if (!m.isViewOnce && !effectiveMediaUrl && m.hasMedia) {
      const ext = m.mediaType === 'sticker' ? 'webp' : m.mediaType === 'video' ? 'mp4' : ['audio', 'voice'].includes(m.mediaType || '') ? 'm4a' : m.mediaType === 'document' ? 'pdf' : 'jpg';
      const storageFile = path.join(this.mediaDir, `${m.id}.${ext}`);
      const publicMediaDir = path.join(process.cwd(), 'public', 'media');
      const publicFile = path.join(publicMediaDir, `${m.id}.${ext}`);
      if (fs.existsSync(storageFile) || fs.existsSync(publicFile)) {
        effectiveMediaUrl = `/media/${m.id}.${ext}`;
        m.mediaUrl = effectiveMediaUrl;
      }
    }

    return {
      ...rest,
      chatJid: m.chatJid ? this.getCanonicalChatJid(m.chatJid) : m.chatJid,
      mediaUrl: m.isViewOnce ? undefined : effectiveMediaUrl,
      linkedReceiptUrl,
      linkedMsgId,
      status,
      senderJid,
      senderAvatarUrl,
      rawBaileysMessage: raw
        ? { key: raw.key, messageTimestamp: raw.messageTimestamp, status: raw.status, pushName: raw.pushName }
        : undefined,
    };
  }

  public async syncMissingMedia(): Promise<number> {
    if (!this.sock || this.connectionStatus !== 'CONNECTED') return 0;
    const now = Date.now();
    // جلب الوسائط المفقودة للرسائل الحديثة فقط (آخر 12 ساعة) لتجنب الروابط المنتهية الصلاحية وخنق سيرفر واتساب
    const missing = this.incomingMessages.filter(
      (m) =>
        m.hasMedia &&
        !m.isViewOnce &&
        !m.mediaUrl &&
        m.rawBaileysMessage &&
        now - (m.timestampMs || 0) < 12 * 3600 * 1000
    );
    if (missing.length === 0) return 0;
    let count = 0;
    for (const m of missing.slice(0, 5)) {
      try {
        const url = await this.downloadMediaInBackground(
          m.id,
          m.rawBaileysMessage,
          m.rawBaileysMessage.message
        );
        if (url) count++;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    return count;
  }

  public async archiveChat(chatIdOrName: string, archive: boolean): Promise<boolean> {
    const grp = this.userGroups.find((g) => g.id === chatIdOrName || g.name === chatIdOrName);
    const jid = grp?.id || (chatIdOrName.includes('@') ? chatIdOrName : `${chatIdOrName}@s.whatsapp.net`);
    if (this.sock && this.connectionStatus === 'CONNECTED') {
      try {
        const lastMsg = this.incomingMessages.find(
          (m) => (m.chatJid === jid || m.chatName === grp?.name) && m.rawBaileysMessage?.key?.id
        );
        let lastMessages: any[] = [];
        if (lastMsg?.rawBaileysMessage?.key) {
          const rawKey = lastMsg.rawBaileysMessage.key;
          const msgTimestamp = Math.floor((lastMsg.timestampMs || Date.now()) / 1000);
          lastMessages = [{
            key: {
              remoteJid: rawKey.remoteJid || jid,
              id: rawKey.id,
              fromMe: Boolean(rawKey.fromMe),
              participant: rawKey.participant,
            },
            messageTimestamp: msgTimestamp,
          }];
        }

        await this.sock.chatModify({ archive, lastMessages }, jid);
        if (grp) {
          grp.archived = archive;
          this.persistDataImmediate();
          this.events.emit('groups', this.getUserGroups());
        }
        return true;
      } catch (err: any) {
        console.warn(`[WhatsApp] تعذر تطبيق الأرشفة عبر واتساب للمحادثة ${jid}:`, err?.message || err);
      }
    }
    return false;
  }

  public toClientMessages(messages: ChatMessage[]): ChatMessage[] {
    const sharedMeta = WhatsAppManager.getSharedMeta();
    return messages.filter((message) => isConversationJid(message.chatJid)).map((message) => this.toClientMessage(message, sharedMeta));
  }

  public getClientMessages(): ChatMessage[] {
    return this.toClientMessages(this.incomingMessages);
  }

  public mergeRestoredHistory(messages: ChatMessage[], groups: WhatsAppGroupItem[]): { addedMessages: number; addedChats: number } {
    const knownMessages = new Set(this.incomingMessages.map((message) => message.id));
    let addedMessages = 0;
    for (const message of messages) {
      if (!message?.id || knownMessages.has(message.id)) continue;
      knownMessages.add(message.id);
      this.incomingMessages.push(message);
      addedMessages++;
    }
    this.incomingMessages.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));

    const knownChats = new Set(this.userGroups.map((group) => group.id));
    let addedChats = 0;
    for (const group of groups) {
      if (!group?.id || knownChats.has(group.id)) continue;
      knownChats.add(group.id);
      this.userGroups.push(group);
      addedChats++;
    }
    this.persistDataImmediate();
    this.events.emit('groups', this.getUserGroups());
    return { addedMessages, addedChats };
  }

  public addMessage(msg: ChatMessage): void {
    if (!(msg as any).timestampMs) {
      (msg as any).timestampMs = Date.now();
    }
    this.incomingMessages.unshift(msg);
    this.persistData();
  }

  private isFlushingQueue = false;

  /**
   * تحويل أي معرّف محادثة أو اسم أو LID إلى JID صالح للإرسال عبر Baileys
   */
  public resolveTargetJidForSending(target: string): { sendJid: string; groupName: string; chatJid: string } {
    this.loadLidMappings();
    let sendJid = target;
    let groupName = target;
    let chatJid = target;

    // 1. فحص المجموعات والمحادثات المخزنة
    const foundGroup = this.userGroups.find(
      (g) =>
        g.id === target ||
        g.name === target ||
        (g.phone && g.phone.replace(/\D/g, '') === target.replace(/\D/g, ''))
    );
    if (foundGroup) {
      groupName = foundGroup.name || target;
      chatJid = foundGroup.id;
      sendJid = foundGroup.id;
      if (foundGroup.phone) {
        const p = foundGroup.phone.replace(/\D/g, '');
        if (p) {
          sendJid = `${p}@s.whatsapp.net`;
        }
      }
    }

    // 2. إذا كان ينتهي بـ @lid
    if (sendJid.includes('@lid')) {
      const lid = sendJid.split('@')[0].replace(/\D/g, '');
      const mappedPhone = this.lidToPhoneMap[lid];
      if (mappedPhone) {
        sendJid = `${mappedPhone}@s.whatsapp.net`;
      }
    }

    // 3. إذا لم يكن يحتوي على @
    if (!sendJid.includes('@')) {
      const digits = sendJid.replace(/\D/g, '');
      if (digits.length >= 8) {
        sendJid = `${digits}@s.whatsapp.net`;
      }
    }

    return { sendJid, groupName, chatJid };
  }

  /**
   * إعادة إرسال الرسائل المعلقة في طابور الانتظار (Offline Queue) تلقائياً بمجرد عودة الاتصال
   */
  public async flushPendingMessages(): Promise<void> {
    if (!this.sock || this.connectionStatus !== 'CONNECTED' || this.isFlushingQueue) return;
    this.isFlushingQueue = true;

    try {
      const pending = this.incomingMessages.filter(
        (m) =>
          (m.isFromMe || m.sender === 'أنا' || m.senderName === 'أنا') &&
          (m.deliveryStatus === 'pending' || (typeof m.id === 'string' && (m.id.startsWith('msg_real_') || m.id.startsWith('temp_'))))
      );

      if (pending.length === 0) return;
      console.log(`[WhatsApp] جاري إرسال وتفريغ (${pending.length}) رسائل معلقة في طابور الانتظار...`);

      for (const msg of pending) {
        try {
          const targetChat = msg.chatJid || msg.chatName;
          if (!targetChat) continue;

          const res = await this.forwardMessage(
            targetChat,
            msg.text || '',
            msg.mediaUrl,
            msg.quotedMessage?.id,
            msg.quotedMessage,
            msg.id
          );
          if (res.success) {
            console.log(`[WhatsApp] تم إرسال الرسالة المعلقة بنجاح: ${msg.id} -> ${res.messageId}`);
          }
        } catch (err) {
          console.error('فشل إرسال رسالة معلقة في الطابور:', err);
        }
      }
    } finally {
      this.isFlushingQueue = false;
    }
  }

  /**
   * إعادة محاولة إرسال رسالة معلقة محددة فوراً
   */
  public async retryPendingMessage(msgId: string): Promise<{ success: boolean; message: string; messageId?: string }> {
    if (!this.sock || this.connectionStatus !== 'CONNECTED') {
      return { success: false, message: 'واتساب غير متصل حالياً بالسيرفر' };
    }
    const msg = this.incomingMessages.find((m) => m.id === msgId);
    if (!msg) {
      return { success: false, message: 'الرسالة غير موجودة في السجل' };
    }
    const targetChat = msg.chatJid || msg.chatName;
    if (!targetChat) {
      return { success: false, message: 'تعذر تحديد المحادثة المستهدفة للرسالة' };
    }
    return await this.forwardMessage(
      targetChat,
      msg.text || '',
      msg.mediaUrl,
      msg.quotedMessage?.id,
      msg.quotedMessage,
      msg.id
    );
  }

  public updateMessageStatus(id: string, updates: Partial<ChatMessage['status']> & { linkedReceiptUrl?: string | null; linkedMsgId?: string | null }) {
    // 1. حفظ الميتا المشترك بين كافة حسابات النظام
    WhatsAppManager.updateSharedMessageMeta(id, updates);

    // 2. تحديث الرسالة في كافة الجلسات النشطة لجميع المستخدمين الذين يملكون هذه الرسالة
    for (const inst of WhatsAppManager.getAllInstances()) {
      const msg = inst.incomingMessages.find((m) => m.id === id || m.rawBaileysMessage?.key?.id === id);
      if (msg) {
        if ('linkedReceiptUrl' in updates) {
          msg.linkedReceiptUrl = updates.linkedReceiptUrl ? updates.linkedReceiptUrl : undefined;
        }
        if ('linkedMsgId' in updates) {
          msg.linkedMsgId = updates.linkedMsgId ? updates.linkedMsgId : undefined;
        }
        msg.status = { ...msg.status, ...updates };
        inst.persistData();
      }
      try {
        inst.events.emit('message_update', {
          messageId: id,
          id,
          updates,
          linkedReceiptUrl: updates.linkedReceiptUrl ?? undefined,
          linkedMsgId: updates.linkedMsgId ?? undefined,
          status: updates,
        });
      } catch (e) {}
    }
  }

  public deleteMessage(id: string): boolean {
    const initialLen = this.incomingMessages.length;
    this.incomingMessages = this.incomingMessages.filter((m) => m.id !== id);
    this.persistData();
    return this.incomingMessages.length < initialLen;
  }

  public deleteMessages(ids: string[]): number {
    const idSet = new Set(ids);
    const initialLen = this.incomingMessages.length;
    this.incomingMessages = this.incomingMessages.filter((m) => !idSet.has(m.id));
    this.persistData();
    return initialLen - this.incomingMessages.length;
  }

  public renameChat(chatIdOrName: string, newName: string): boolean {
    const cleanName = newName.trim();
    if (!cleanName) return false;
    const chat = this.userGroups.find((g) => g.id === chatIdOrName || g.name === chatIdOrName);
    if (chat) {
      const oldName = chat.name;
      chat.name = cleanName;
      if (chat.id) {
        this.contactsMap[chat.id] = cleanName;
        if (chat.id.includes('@lid')) {
          const lid = chat.id.split('@')[0];
          const phone = this.lidToPhoneMap[lid];
          if (phone) {
            this.contactsMap[`${phone}@s.whatsapp.net`] = cleanName;
            this.contactsMap[phone] = cleanName;
          }
        } else if (chat.id.includes('@s.whatsapp.net')) {
          const phone = chat.id.split('@')[0];
          const lid = this.phoneToLidMap[phone];
          if (lid) {
            this.contactsMap[`${lid}@lid`] = cleanName;
          }
        }
        this.persistContacts();
      }
      // تحديث أسماء الرسائل التابعة لهذه المحادثة
      for (const m of this.incomingMessages) {
        if (m.chatJid === chat.id || m.chatName === oldName || m.chatName === chatIdOrName) {
          m.chatName = cleanName;
          if (m.sender === oldName || m.sender === chatIdOrName) {
            m.sender = cleanName;
          }
        }
      }
      this.persistData();
      return true;
    }
    return false;
  }

  public startDirectChat(phoneNumberOrJid: string, customName?: string): WhatsAppGroupItem {
    let cleanNumber = this.toEnglishDigits(phoneNumberOrJid || '').trim().replace(/[^\d]/g, '');
    if (!cleanNumber) {
      throw new Error('رقم الهاتف المدخل غير صالح');
    }
    if (cleanNumber.startsWith('05') && cleanNumber.length === 10) {
      cleanNumber = '970' + cleanNumber.slice(1);
    }
    const jid = `${cleanNumber}@s.whatsapp.net`;
    const resolved = this.resolveRealContact(jid, customName);
    const name = customName?.trim() || resolved.contactName;

    let existing = this.userGroups.find(
      (g) => g.id === jid || g.id.startsWith(cleanNumber) || (resolved.realPhone && (g.phone === resolved.formattedPhone || g.id === `${resolved.realPhone}@s.whatsapp.net`))
    );
    if (existing) {
      if (customName && existing.name !== customName) {
        existing.name = customName;
      }
      if (resolved.formattedPhone) existing.phone = resolved.formattedPhone;
      this.persistData();
      return existing;
    }

    const newChat: WhatsAppGroupItem = {
      id: jid,
      name,
      unreadCount: 0,
      isGroup: false,
      phone: resolved.formattedPhone,
      avatarUrl: this.avatarsMap[cleanNumber],
    };
    this.userGroups.unshift(newChat);
    this.persistData();
    this.getProfilePicture(jid).then((url) => {
      if (url) {
        newChat.avatarUrl = url;
        this.persistData();
      }
    }).catch(() => {});
    return newChat;
  }

  public async fetchChatHistory(chatJid: string, count: number = 50): Promise<{ success: boolean; message: string }> {
    if (!this.sock || this.connectionStatus !== 'CONNECTED') {
      return { success: false, message: 'واتساب غير متصل حالياً بالسيرفر.' };
    }
    try {
      const chatMsgs = this.incomingMessages.filter(
        (m) => m.chatJid === chatJid || (m.chatName && m.chatName === chatJid)
      );

      if (chatMsgs.length === 0) {
        return {
          success: false,
          message: 'هذه المحادثة لا تحتوي على رسائل سابقة كنقطة بداية لطلب السجل القديم منها. يمكنك إرسال أو انتظار رسالة للبدء.',
        };
      }

      if (typeof (this.sock as any).fetchMessageHistory !== 'function') {
        return { success: false, message: 'خاصية جلب السجل غير مدعومة في جلسة واتساب الحالية.' };
      }

      // فرز الرسائل لتحديد أقدم رسالة حقيقية بدقة
      const sorted = [...chatMsgs].sort((a, b) => {
        const tsA = Number(a.rawBaileysMessage?.messageTimestamp || 0);
        const tsB = Number(b.rawBaileysMessage?.messageTimestamp || 0);
        return tsA - tsB;
      });

      const oldestMsg = sorted[0];
      const rawKey = oldestMsg.rawBaileysMessage?.key;
      const oldestKey = {
        remoteJid: rawKey?.remoteJid || chatJid,
        id: rawKey?.id || oldestMsg.id,
        fromMe: rawKey?.fromMe ?? (oldestMsg.sender === 'أنا'),
        ...(rawKey?.participant ? { participant: rawKey.participant } : {}),
      };

      const rawTsSeconds = Number(oldestMsg.rawBaileysMessage?.messageTimestamp);
      const oldestTimestampMs = rawTsSeconds ? rawTsSeconds * 1000 : Date.now() - 3600000;

      await (this.sock as any).fetchMessageHistory(count, oldestKey, oldestTimestampMs);
      return {
        success: true,
        message: 'تم إرسال طلب جلب الرسائل السابقة لهاتفك بنجاح. ستظهر تلقائياً في المحادثة فور قيام الهاتف بإرسالها.',
      };
    } catch (e: any) {
      console.error('خطأ في طلب السجل عند الطلب:', e);
      return { success: false, message: `تعذر إرسال الطلب للهاتف: ${e?.message || e}` };
    }
  }

  /**
   * مزامنة التفاعلات والرسائل الحديثة لمحادثة محددة من واتساب بالاستناد لأحدث رسالة
   */
  public async syncChatReactions(chatJidOrName: string, count: number = 50): Promise<{ success: boolean; message: string }> {
    if (!this.sock || this.connectionStatus !== 'CONNECTED') {
      return { success: false, message: 'واتساب غير متصل حالياً بالسيرفر.' };
    }
    try {
      const chatMsgs = this.incomingMessages.filter(
        (m) =>
          m.chatJid === chatJidOrName ||
          m.chatName === chatJidOrName ||
          (m.sender === chatJidOrName && !m.chatJid?.endsWith('@g.us'))
      );

      if (chatMsgs.length === 0) {
        return {
          success: false,
          message: 'لا توجد رسائل سابقة لهذه المحادثة لطلب مزامنة تفاعلاتها.',
        };
      }

      if (typeof (this.sock as any).fetchMessageHistory !== 'function') {
        return { success: false, message: 'خاصية جلب التحديثات من الهاتف غير مدعومة في الجلسة الحالية.' };
      }

      // فرز الرسائل تنازلياً لتحديد أحدث رسالة في المحادثة كنقطة ارتكاز
      const sorted = [...chatMsgs].sort((a, b) => {
        const tsA = Number(a.rawBaileysMessage?.messageTimestamp || a.timestampMs || 0);
        const tsB = Number(b.rawBaileysMessage?.messageTimestamp || b.timestampMs || 0);
        return tsB - tsA;
      });

      const anchorMsg = sorted[0];
      const rawKey = anchorMsg.rawBaileysMessage?.key;
      const targetJid = rawKey?.remoteJid || anchorMsg.chatJid || chatJidOrName;

      const anchorKey = {
        remoteJid: targetJid,
        id: rawKey?.id || anchorMsg.id,
        fromMe: rawKey?.fromMe ?? (anchorMsg.sender === 'أنا'),
        ...(rawKey?.participant ? { participant: rawKey.participant } : {}),
      };

      const rawTs = Number(anchorMsg.rawBaileysMessage?.messageTimestamp);
      const anchorTimestampMs = rawTs ? (rawTs > 1e11 ? rawTs : rawTs * 1000) : (anchorMsg.timestampMs || Date.now());

      await (this.sock as any).fetchMessageHistory(Math.max(1, Math.min(200, Math.floor(count))), anchorKey, anchorTimestampMs);

      return {
        success: true,
        message: 'تم إرسال طلب مزامنة التفاعلات لهاتفك بنجاح. ستتحدث التفاعلات فور استلامها من الهاتف.',
      };
    } catch (e: any) {
      console.error('خطأ في مزامنة تفاعلات المحادثة:', e);
      return { success: false, message: `تعذر إرسال طلب المزامنة: ${e?.message || e}` };
    }
  }

  /**
   * إرسال رسالة نصية أو وسائط عبر جلسة واتساب الفعلية المتصلة (Baileys)
   */
  public async forwardMessage(
    targetGroupNameOrJid: string,
    messageText: string,
    mediaBase64?: string,
    quotedMsgId?: string,
    quotedPayload?: {
      id?: string;
      sender?: string;
      senderName?: string;
      text?: string;
      hasMedia?: boolean;
      mediaUrl?: string;
    },
    existingMessageId?: string,
    // المنشن: معرفات الأعضاء المذكورين (النص يحتوي @رقم لكل منهم كما يشترط واتساب)
    mentions?: string[]
  ): Promise<{ success: boolean; message: string; messageId?: string }> {
    if (!this.sock || this.connectionStatus !== 'CONNECTED') {
      return {
        success: false,
        message: 'واتساب غير متصل حالياً. يرجى مسح رمز QR أولاً.',
      };
    }
    const mentionOpts = mentions && mentions.length > 0 ? { mentions } : {};

    try {
      // 1. تحديد المعرّف الفعلي للمحادثة المستهدفة وترجمته بدقة لـ Baileys JID
      const { sendJid, groupName, chatJid } = this.resolveTargetJidForSending(targetGroupNameOrJid);
      const targetJid = sendJid;

      console.log(`[WhatsApp] جاري إرسال رسالة إلى ${targetJid} (${groupName})...`);

      let sentMsg: any = null;

      // البحث عن الرسالة المقتبس منها إن وجدت لإرسال ريبلاي رسمي متكامل عبر واتساب
      const { sendOptions, quotedPreview } = this.prepareQuotedOptions(
        targetJid,
        quotedMsgId,
        quotedPayload
      );

      // 2. إذا كان هناك صورة أو ملف وسائط مرفق
      if (
        mediaBase64 &&
        (mediaBase64.startsWith('data:image') ||
          mediaBase64.startsWith('/media/') ||
          mediaBase64.startsWith('public/media/'))
      ) {
        let imageBuf: Buffer | null = null;
        if (mediaBase64.startsWith('/media/') || mediaBase64.startsWith('public/media/')) {
          const rel = mediaBase64.replace(/^\/?(public\/)?/, '');
          const p = path.join(process.cwd(), 'public', rel);
          if (fs.existsSync(p)) {
            imageBuf = fs.readFileSync(p);
          } else {
            const stored = path.join(this.mediaDir, path.basename(rel));
            if (fs.existsSync(stored)) imageBuf = fs.readFileSync(stored);
          }
        } else if (mediaBase64.startsWith('data:image')) {
          const cleanB64 = mediaBase64.replace(/^data:image\/[a-z]+;base64,/, '');
          imageBuf = Buffer.from(cleanB64, 'base64');
        }

        if (imageBuf) {
          sentMsg = await this.sock.sendMessage(
            targetJid,
            {
              image: imageBuf,
              caption: messageText || '',
              ...mentionOpts,
            },
            sendOptions
          );
        } else {
          sentMsg = await this.sock.sendMessage(
            targetJid,
            {
              text: messageText,
              ...mentionOpts,
            },
            sendOptions
          );
        }
      } else {
        // رسالة نصية بحتة
        sentMsg = await this.sock.sendMessage(
          targetJid,
          {
            text: messageText,
            ...mentionOpts,
          },
          sendOptions
        );
      }

      const msgId = sentMsg?.key?.id || `sent_${Date.now()}`;
      console.log(`[WhatsApp] تم إرسال الرسالة بنجاح إلى ${groupName} (${targetJid})، معرّف الرسالة: ${msgId}`);

      // إذا كانت الرسالة موجودة مسبقاً في طابور الانتظار (offline queue)، نحدّثها في مكانها دون تكرار
      if (existingMessageId) {
        const existingIdx = this.incomingMessages.findIndex((m) => m.id === existingMessageId);
        if (existingIdx !== -1) {
          this.incomingMessages[existingIdx] = {
            ...this.incomingMessages[existingIdx],
            id: msgId,
            chatName: groupName,
            chatJid: chatJid,
            deliveryStatus: 'sent',
            rawBaileysMessage: sentMsg,
            timestampMs: Date.now(),
            isFromMe: true,
            sender: 'أنا',
            senderName: 'أنا',
          };
          this.persistData();
          return {
            success: true,
            message: `تم إرسال الرسالة إلى (${groupName}) بنجاح عبر واتساب.`,
            messageId: msgId,
          };
        }
      }

      // 3. إضافة الرسالة المرسلة لسجل الرسائل الداخلي فوراً لتظهر في الواجهة
      const resolvedMediaUrl = mediaBase64
        ? (mediaBase64.startsWith('/') ? mediaBase64 : (mediaBase64.startsWith('public/') ? '/' + mediaBase64.replace(/^public\//, '') : mediaBase64))
        : undefined;

      const newSentMessage: ChatMessage = {
        id: msgId,
        sender: 'أنا',
        senderName: 'أنا',
        // عرض المنشن بالاسم بدل الرقم داخل البرنامج
        text: this.decodeMentions(messageText),
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        timestampMs: Date.now(),
        chatName: groupName,
        chatJid: chatJid,
        isFromMe: true,
        deliveryStatus: 'sent',
        hasMedia: Boolean(resolvedMediaUrl),
        mediaUrl: resolvedMediaUrl,
        mediaType: resolvedMediaUrl ? 'image' : undefined,
        linkedReceiptUrl: resolvedMediaUrl,
        status: {
          forwardedTo: groupName,
          linkedImageUrl: resolvedMediaUrl,
        },
        quotedMessage: quotedPreview,
        rawBaileysMessage: sentMsg,
      };

      const existingIdx = this.incomingMessages.findIndex((m) => m.id === msgId);
      if (existingIdx !== -1) {
        this.incomingMessages[existingIdx] = {
          ...this.incomingMessages[existingIdx],
          hasMedia: Boolean(resolvedMediaUrl) || this.incomingMessages[existingIdx].hasMedia,
          mediaUrl: resolvedMediaUrl || this.incomingMessages[existingIdx].mediaUrl,
          mediaType: resolvedMediaUrl ? 'image' : this.incomingMessages[existingIdx].mediaType,
          linkedReceiptUrl: resolvedMediaUrl || this.incomingMessages[existingIdx].linkedReceiptUrl,
          deliveryStatus: 'sent',
          chatName: groupName,
          chatJid: chatJid,
          status: {
            ...this.incomingMessages[existingIdx].status,
            forwardedTo: groupName,
            ...(resolvedMediaUrl ? { linkedImageUrl: resolvedMediaUrl } : {}),
          },
          quotedMessage: quotedPreview || this.incomingMessages[existingIdx].quotedMessage,
          rawBaileysMessage: sentMsg || this.incomingMessages[existingIdx].rawBaileysMessage,
          timestampMs: this.incomingMessages[existingIdx].timestampMs || Date.now(),
          isFromMe: true,
          sender: 'أنا',
          senderName: 'أنا',
        };
      } else {
        this.incomingMessages.unshift(newSentMessage);
      }
      this.persistData();
      this.events.emit('message', this.incomingMessages.find((m) => m.id === msgId) || newSentMessage);

      return {
        success: true,
        message: `تم إرسال الرسالة إلى مجموعة (${groupName}) بنجاح عبر واتساب.`,
        messageId: msgId,
      };
    } catch (e: any) {
      console.error(`[WhatsApp] خطأ أثناء إرسال الرسالة إلى ${targetGroupNameOrJid}:`, e);
      return {
        success: false,
        message: `فشل إرسال الرسالة عبر واتساب: ${e.message}`,
      };
    }
  }

  /**
   * تحويل رسالة كما هي تماماً (Forward) بدون أي تعديل على نصها
   * - إذا كانت الحوالة مشبوكة بصورة وصل: تُرسل الصورة ومعها نص الرسالة الأصلي كتعليق
   * - غير ذلك: تحويل واتساب الأصلي (مع وسائطها إن وجدت) ويظهر عليها "محوّلة"
   */
  public async forwardOriginalMessage(
    targetGroupNameOrJid: string,
    sourceMsgId: string,
    linkedImageUrl?: string,
    reuseReceiptMsgId?: string,
    skipMediaSend?: boolean
  ): Promise<{
    success: boolean;
    message: string;
    messageId?: string;
    receiptMessageId?: string;
    linkedImageUrl?: string;
  }> {
    if (!this.sock || this.connectionStatus !== 'CONNECTED') {
      return { success: false, message: 'واتساب غير متصل حالياً. يرجى مسح رمز QR أولاً.' };
    }

    const source = this.incomingMessages.find(
      (m) => m.id === sourceMsgId || m.rawBaileysMessage?.key?.id === sourceMsgId
    );
    if (!source) {
      return { success: false, message: 'لم يتم العثور على الرسالة الأصلية لتحويلها.' };
    }

    const { sendJid, groupName, chatJid } = this.resolveTargetJidForSending(targetGroupNameOrJid);

    // 1. حوالة نصية مشبوكة بصورة وصل: نرسل نص الحوالة وصورة الوصل معاً إلى المحادثة الهدف مع بقاء الربط
    const effectiveLinkedImage = linkedImageUrl || source.linkedReceiptUrl || source.status?.linkedImageUrl;
    const localImage = this.toLocalMediaPath(effectiveLinkedImage);

    if ((localImage || reuseReceiptMsgId) && !source.hasMedia) {
      // أولاً: تحويل رسالة الحوالة النصية إلى المحادثة الهدف
      let textSentMsg: any = null;
      const raw = source.rawBaileysMessage;
      if (raw?.key && raw?.message) {
        try {
          textSentMsg = await this.sock.sendMessage(sendJid, { forward: raw });
        } catch (e) {
          textSentMsg = await this.sock.sendMessage(sendJid, { text: source.text || '' });
        }
      } else {
        textSentMsg = await this.sock.sendMessage(sendJid, { text: source.text || '' });
      }
      const textMsgId = textSentMsg?.key?.id || `sent_${Date.now()}`;

      // ثانياً: معالجة صورة الوصل المشبوكة:
      // إذا كان الوصل قد أُرسل مسبقاً في هذه الدفعة نربط النص به مباشرة دون إعادة إرسال الصورة ثانية
      let receiptMessageId: string | undefined = reuseReceiptMsgId;
      if (!receiptMessageId && !skipMediaSend && localImage) {
        try {
          const receiptRes = await this.forwardMessage(targetGroupNameOrJid, '', localImage);
          if (receiptRes?.messageId) {
            receiptMessageId = receiptRes.messageId;
          }
        } catch (errReceipt) {
          console.warn('[WhatsApp] تعذر تحويل صورة الوصل المشبوكة مع الحوالة:', errReceipt);
        }
      }

      // ثالثاً: تسجيل رسالة الحوالة في المحادثة الهدف مع حفظ ارتباط صورة الوصل بها دائماً
      const finalReceiptUrl = localImage || effectiveLinkedImage;
      const forwardedText: ChatMessage = {
        id: textMsgId,
        sender: 'أنا',
        senderName: 'أنا',
        text: source.text || '',
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        timestampMs: Date.now(),
        isForwarded: true,
        chatName: groupName,
        chatJid,
        isFromMe: true,
        deliveryStatus: 'sent',
        linkedReceiptUrl: finalReceiptUrl,
        linkedMsgId: receiptMessageId,
        status: {
          forwardedTo: groupName,
          linkedImageUrl: finalReceiptUrl,
        },
        rawBaileysMessage: textSentMsg,
      };

      const existingTextIdx = this.incomingMessages.findIndex((m) => m.id === textMsgId);
      if (existingTextIdx !== -1) {
        this.incomingMessages[existingTextIdx] = {
          ...this.incomingMessages[existingTextIdx],
          ...forwardedText,
          linkedReceiptUrl: finalReceiptUrl,
          linkedMsgId: receiptMessageId,
          status: {
            ...this.incomingMessages[existingTextIdx].status,
            forwardedTo: groupName,
            linkedImageUrl: finalReceiptUrl,
          },
        };
      } else {
        this.incomingMessages.unshift(forwardedText);
      }

      // إذا كانت رسالة صورة الوصل موجودة أيضاً، نربطها بهذا النص
      if (receiptMessageId) {
        const rIdx = this.incomingMessages.findIndex((m) => m.id === receiptMessageId);
        if (rIdx !== -1) {
          this.incomingMessages[rIdx].linkedMsgId = textMsgId;
          if (finalReceiptUrl) {
            this.incomingMessages[rIdx].linkedReceiptUrl = finalReceiptUrl;
            if (this.incomingMessages[rIdx].status) {
              this.incomingMessages[rIdx].status.linkedImageUrl = finalReceiptUrl;
            }
          }
        }
      }

      this.persistData();
      this.events.emit('message', this.incomingMessages.find((m) => m.id === textMsgId) || forwardedText);

      return {
        success: true,
        message: `تم تحويل الحوالة والوصل المشبوك إلى (${groupName}) بنجاح.`,
        messageId: textMsgId,
        receiptMessageId,
        linkedImageUrl: finalReceiptUrl,
      };
    }

    // 2. التحويل الأصلي من واتساب (رسالة وسائط أو نص عادي بدون وسائط مشبوكة)
    const raw = source.rawBaileysMessage;
    if (raw?.key && raw?.message) {
      try {
        const sentMsg: any = await this.sock.sendMessage(sendJid, { forward: raw });
        const msgId = sentMsg?.key?.id || `sent_${Date.now()}`;

        // إذا كانت الرسالة المحولة هي نفسها صورة/وسائط، فإن sentMsg قام بإرسالها بالفعل
        // لا نقوم بإعادة إرسالها إطلاقاً حتى لا تتكرر الصورة مرتين
        const receiptMessageId = source.hasMedia ? msgId : undefined;
        const finalMediaUrl = source.mediaUrl || localImage || effectiveLinkedImage;

        const forwarded: ChatMessage = {
          id: msgId,
          sender: 'أنا',
          senderName: 'أنا',
          text: source.text || '',
          timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          timestampMs: Date.now(),
          isForwarded: true,
          hasMedia: source.hasMedia,
          mediaUrl: source.mediaUrl,
          mediaType: source.mediaType,
          mediaDuration: source.mediaDuration,
          fileName: source.fileName,
          fileSize: source.fileSize,
          chatName: groupName,
          chatJid,
          isFromMe: true,
          deliveryStatus: 'sent',
          linkedReceiptUrl: finalMediaUrl || undefined,
          linkedMsgId: receiptMessageId || undefined,
          status: { forwardedTo: groupName, linkedImageUrl: finalMediaUrl || undefined },
          rawBaileysMessage: sentMsg,
        };
        const existingIdx = this.incomingMessages.findIndex((m) => m.id === msgId);
        if (existingIdx !== -1) {
          this.incomingMessages[existingIdx] = {
            ...this.incomingMessages[existingIdx],
            ...forwarded,
            hasMedia: source.hasMedia || this.incomingMessages[existingIdx].hasMedia,
            mediaUrl: source.mediaUrl || this.incomingMessages[existingIdx].mediaUrl,
            linkedReceiptUrl: finalMediaUrl || undefined,
            linkedMsgId: receiptMessageId || undefined,
            status: {
              ...this.incomingMessages[existingIdx].status,
              forwardedTo: groupName,
              linkedImageUrl: finalMediaUrl || undefined,
            },
          };
        } else {
          this.incomingMessages.unshift(forwarded);
        }
        this.persistData();
        this.events.emit('message', this.incomingMessages.find((m) => m.id === msgId) || forwarded);

        return {
          success: true,
          message: `تم تحويل الرسالة إلى (${groupName}) كما هي.`,
          messageId: msgId,
          receiptMessageId,
          linkedImageUrl: finalMediaUrl || undefined,
        };
      } catch (e: any) {
        console.warn('[WhatsApp] فشل التحويل الأصلي، سيتم الإرسال بالنسخة المحلية:', e?.message);
      }
    }

    // 3. بديل: نفس النص + نفس الصورة من النسخة المحفوظة على الجهاز
    const sourceImage = source.mediaType === 'image' ? this.toLocalMediaPath(source.mediaUrl) : undefined;
    const sentRes = await this.forwardMessage(targetGroupNameOrJid, source.text || '', sourceImage || localImage);
    const sentIdx = this.incomingMessages.findIndex((m) => m.id === sentRes.messageId);
    if (sentIdx !== -1 && localImage) {
      this.incomingMessages[sentIdx].linkedReceiptUrl = localImage;
      this.incomingMessages[sentIdx].status = {
        ...this.incomingMessages[sentIdx].status,
        linkedImageUrl: localImage,
      };
      this.persistData();
    }
    return {
      ...sentRes,
      receiptMessageId: sentRes.messageId,
      linkedImageUrl: localImage || undefined,
    };
  }

  // تحويل رابط الصورة (محلي أو http://localhost:3000/media/...) إلى مسار /media/ صالح لـ forwardMessage
  private toLocalMediaPath(url?: string): string | undefined {
    if (!url) return undefined;
    if (url.startsWith('data:image')) return url;
    const cleanUrl = url.split('?')[0].split('#')[0];
    const rel = cleanUrl.replace(/^https?:\/\/[^/]+/, '');
    const clean = '/' + rel.replace(/^\/?(public\/)?/, '');
    const fullDiskPath = path.join(process.cwd(), 'public', clean.replace(/^\//, ''));
    if (fs.existsSync(fullDiskPath)) return clean;

    const filename = path.basename(cleanUrl);
    if (filename) {
      const storageMedia = path.join(this.mediaDir, filename);
      if (fs.existsSync(storageMedia)) return `/media/${filename}`;
      const storageAvatar = path.join(this.avatarsDir, filename);
      if (fs.existsSync(storageAvatar)) return `/avatars/${filename}`;
      const mediaDiskPath = path.join(process.cwd(), 'public', 'media', filename);
      if (fs.existsSync(mediaDiskPath)) return `/media/${filename}`;
    }
    if (clean.startsWith('/media/') || clean.startsWith('/avatars/')) return clean;
    return clean || url;
  }

  // تحويل الأرقام المكتوبة بالأرقام العربية (٠-٩) والفارسية (۰-۹) إلى أرقام إنجليزية (0-9)
  public toEnglishDigits(str: string): string {
    if (!str) return '';
    return str
      .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1632 + 48))
      .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1776 + 48));
  }

  /**
   * تجهيز خيارات الاقتباس والرد لـ Baileys ومعلومات المعاينة للواجهة
   */
  public prepareQuotedOptions(
    targetJid: string,
    quotedMsgId?: string,
    quotedPayload?: {
      id?: string;
      sender?: string;
      senderName?: string;
      text?: string;
      hasMedia?: boolean;
      mediaUrl?: string;
    }
  ): { sendOptions: any; quotedPreview: any } {
    let sendOptions: any = undefined;
    let quotedPreview: any = undefined;

    let targetQuotedId: string | undefined = undefined;
    if (quotedPayload?.id) {
      targetQuotedId = quotedPayload.id;
    } else if (quotedMsgId && !quotedMsgId.includes('/') && !quotedMsgId.includes('\\')) {
      const isFile = /\.(png|jpg|jpeg|gif|webp|pdf|docx?)$/i.test(quotedMsgId);
      if (!isFile) {
        targetQuotedId = quotedMsgId;
      }
    }

    if (targetQuotedId) {
      const found = this.incomingMessages.find((m) => m.id === targetQuotedId);

      const isFromMeQuote = Boolean(
        found?.isFromMe ||
        found?.sender === 'أنا' ||
        found?.senderName === 'أنا' ||
        quotedPayload?.sender === 'أنا' ||
        quotedPayload?.senderName === 'أنا' ||
        found?.rawBaileysMessage?.key?.fromMe
      );

      const qSender = isFromMeQuote
        ? 'أنا'
        : (found?.sender || quotedPayload?.sender || 'مشترك');
      const qSenderName = isFromMeQuote
        ? 'أنا'
        : (found?.senderName || quotedPayload?.senderName || qSender);
      const qText = (found?.text || quotedPayload?.text || '').slice(0, 200);
      const qMediaUrl = found?.mediaUrl || quotedPayload?.mediaUrl;
      const qHasMedia = Boolean(found?.hasMedia || qMediaUrl || quotedPayload?.hasMedia);

      quotedPreview = {
        id: targetQuotedId,
        sender: qSender,
        senderName: qSenderName,
        text: qText,
        hasMedia: qHasMedia,
        mediaUrl: qMediaUrl,
      };

      const isGroup = targetJid.endsWith('@g.us');
      const myJid = this.connectedUser?.jid || '';

      let participantJid: string | undefined = undefined;
      if (isGroup) {
        if (isFromMeQuote) {
          participantJid = myJid;
        } else {
          participantJid =
            found?.rawBaileysMessage?.key?.participant ||
            found?.rawBaileysMessage?.participant ||
            (found as any)?.senderJid;

          if (!participantJid && found?.chatJid && !found.chatJid.endsWith('@g.us')) {
            participantJid = found.chatJid;
          }

          if (!participantJid && found?.sender) {
            const cleanDigits = String(found.sender).replace(/\D/g, '');
            if (cleanDigits.length >= 8) {
              participantJid = `${cleanDigits}@s.whatsapp.net`;
            }
          }
        }
      }

      let innerQuotedMsg: any = undefined;
      if (found?.rawBaileysMessage?.message) {
        innerQuotedMsg = unwrapMessageContent(found.rawBaileysMessage.message);
      }

      if (!innerQuotedMsg) {
        innerQuotedMsg = {
          conversation: qText || (qHasMedia ? '[وسائط]' : 'رسالة'),
        };
      }

      sendOptions = {
        quoted: {
          key: {
            remoteJid: targetJid,
            fromMe: isFromMeQuote,
            id: targetQuotedId,
            ...(isGroup && participantJid ? { participant: participantJid } : {}),
          },
          message: innerQuotedMsg,
          ...(participantJid ? { participant: participantJid } : {}),
        },
      };
    }

    return { sendOptions, quotedPreview };
  }

  /**
   * إرسال وسائط وملفات متعددة (فيديو، مستند، ملصق، صورة، صوت) عبر واتساب (Baileys)
   */
  public async sendMediaMessage(
    targetGroupNameOrJid: string,
    mediaData: {
      fileBase64?: string;
      mediaUrl?: string;
      mediaType: 'image' | 'video' | 'document' | 'sticker' | 'audio' | 'voice';
      fileName?: string;
      mimetype?: string;
      caption?: string;
      quotedMsgId?: string;
      quotedPayload?: any;
      ptt?: boolean;
      clientRequestId?: string;
    }
  ): Promise<{ success: boolean; message: string; messageId?: string }> {
    if (!this.sock || this.connectionStatus !== 'CONNECTED') {
      return {
        success: false,
        message: 'واتساب غير متصل حالياً. يرجى مسح رمز QR أولاً.',
      };
    }

    try {
      // 1. تحديد المعرّف الفعلي للمحادثة المستهدفة وترجمته بدقة
      const { sendJid, groupName, chatJid } = this.resolveTargetJidForSending(targetGroupNameOrJid);
      let targetJid = sendJid;

      // 2. فك تشفير الملف أو جلبه من المسار أو الرابط
      let fileBuf: Buffer | null = null;
      let existingRelativeUrl: string | null = null;

      if (mediaData.fileBase64) {
        let rawB64 = mediaData.fileBase64;
        if (rawB64.includes(';base64,')) {
          rawB64 = rawB64.split(';base64,')[1];
        }
        fileBuf = Buffer.from(rawB64, 'base64');
      } else if (mediaData.mediaUrl) {
        const u = mediaData.mediaUrl.trim();
        const cleanU = u.split('?')[0].split('#')[0];

        if (u.startsWith('data:')) {
          const cleanB64 = u.replace(/^data:[^;]+;base64,/, '');
          fileBuf = Buffer.from(cleanB64, 'base64');
        } else if (cleanU.startsWith('/') || cleanU.startsWith('public/')) {
          const rel = cleanU.replace(/^\/?(public\/)?/, '');
          const p = path.join(process.cwd(), 'public', rel);
          if (fs.existsSync(p)) {
            fileBuf = fs.readFileSync(p);
            existingRelativeUrl = `/${rel.replace(/\\/g, '/')}`;
          } else {
            console.error('[WhatsApp] لم يتم العثور على ملف الوسائط في المسار:', p);
          }
        } else if (u.startsWith('http://') || u.startsWith('https://')) {
          // فحص إن كان رابطاً محلياً لنفس خادم التطبيق
          try {
            const parsedUrl = new URL(u);
            if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
              const rel = parsedUrl.pathname.replace(/^\/?(public\/)?/, '');
              const p = path.join(process.cwd(), 'public', rel);
              if (fs.existsSync(p)) {
                fileBuf = fs.readFileSync(p);
                existingRelativeUrl = `/${rel.replace(/\\/g, '/')}`;
              }
            }
          } catch (e) {}

          // إذا لم يكن محلياً، جلبه عبر fetch
          if (!fileBuf) {
            try {
              const resp = await fetch(u);
              if (resp.ok) {
                const ab = await resp.arrayBuffer();
                fileBuf = Buffer.from(ab);
              }
            } catch (e) {
              console.error('[WhatsApp] فشل جلب الملصق/الوسائط من الرابط:', e);
            }
          }
        } else {
          // مسار نسبي غير مبدوء بـ /
          const p = path.join(process.cwd(), 'public', cleanU);
          if (fs.existsSync(p)) {
            fileBuf = fs.readFileSync(p);
            existingRelativeUrl = `/${cleanU.replace(/\\/g, '/')}`;
          }
        }
      }

      if (!fileBuf || fileBuf.length === 0) {
        return { success: false, message: 'ملف الوسائط فارغ أو غير صالح' };
      }

      // 3. تحديد الامتداد وحفظ الملف محلياً في whatsapp_media/
      if (!fs.existsSync(this.mediaDir)) {
        fs.mkdirSync(this.mediaDir, { recursive: true });
      }

      let ext = 'bin';
      if (mediaData.mediaType === 'image') {
        ext = mediaData.mimetype?.includes('png') ? 'png' : mediaData.mimetype?.includes('webp') ? 'webp' : 'jpg';
      } else if (mediaData.mediaType === 'video') {
        ext = 'mp4';
      } else if (mediaData.mediaType === 'sticker') {
        ext = 'webp';
      } else if (mediaData.mediaType === 'audio' || mediaData.mediaType === 'voice') {
        ext = mediaData.mimetype?.includes('ogg')
          ? 'ogg'
          : mediaData.mimetype?.includes('webm')
          ? 'webm'
          : mediaData.mimetype?.includes('m4a')
          ? 'm4a'
          : 'mp3';
      } else if (mediaData.mediaType === 'document') {
        if (mediaData.fileName && mediaData.fileName.includes('.')) {
          ext = mediaData.fileName.split('.').pop()?.toLowerCase() || 'bin';
        } else if (mediaData.mimetype?.includes('pdf')) {
          ext = 'pdf';
        }
      }

      let mediaUrl = existingRelativeUrl;
      const tempId = `sent_media_${Date.now()}`;
      let savedFilePath = '';
      if (!mediaUrl) {
        const savedFileName = `${tempId}.${ext}`;
        savedFilePath = path.join(this.mediaDir, savedFileName);
        fs.writeFileSync(savedFilePath, fileBuf);
        mediaUrl = `/media/${savedFileName}`;
      }

      // 4. تجهيز خيارات الاقتباس
      const { sendOptions, quotedPreview } = this.prepareQuotedOptions(
        targetJid,
        mediaData.quotedMsgId,
        mediaData.quotedPayload
      );

      // 5. إرسال الرسالة عبر بروتوكول Baileys حسب نوع الوسائط
      let sentMsg: any = null;
      if (mediaData.mediaType === 'image') {
        sentMsg = await this.sock.sendMessage(
          targetJid,
          {
            image: fileBuf,
            caption: mediaData.caption || '',
            mimetype: mediaData.mimetype || 'image/jpeg',
          },
          sendOptions
        );
      } else if (mediaData.mediaType === 'video') {
        sentMsg = await this.sock.sendMessage(
          targetJid,
          {
            video: fileBuf,
            caption: mediaData.caption || '',
            mimetype: mediaData.mimetype || 'video/mp4',
          },
          sendOptions
        );
      } else if (mediaData.mediaType === 'sticker') {
        sentMsg = await this.sock.sendMessage(
          targetJid,
          {
            sticker: fileBuf,
          },
          sendOptions
        );
      } else if (mediaData.mediaType === 'document') {
        sentMsg = await this.sock.sendMessage(
          targetJid,
          {
            document: fileBuf,
            fileName: mediaData.fileName || `document.${ext}`,
            mimetype: mediaData.mimetype || 'application/octet-stream',
            caption: mediaData.caption || '',
          },
          sendOptions
        );
      } else if (mediaData.mediaType === 'audio' || mediaData.mediaType === 'voice') {
        const isPtt = mediaData.mediaType === 'voice' || mediaData.ptt === true;
        sentMsg = await this.sock.sendMessage(
          targetJid,
          {
            audio: fileBuf,
            mimetype: mediaData.mimetype || (isPtt ? 'audio/ogg; codecs=opus' : 'audio/mp4'),
            ptt: isPtt,
          },
          sendOptions
        );
      }

      const msgId = sentMsg?.key?.id || tempId;

      // إعادة تسمية الملف المحفوظ ليطابق ID رسالة واتساب
      if (savedFilePath && msgId !== tempId) {
        try {
          const finalFileName = `${msgId}.${ext}`;
          const finalFilePath = path.join(this.mediaDir, finalFileName);
          fs.renameSync(savedFilePath, finalFilePath);
          mediaUrl = `/media/${finalFileName}`;
        } catch (e) {}
      }

      // 6. إضافة الرسالة المرسلة لسجل الرسائل الداخلي فوراً لتظهر في الواجهة

      const fallbackText =
        mediaData.caption ||
        (mediaData.mediaType === 'sticker'
          ? 'ملصق'
          : mediaData.mediaType === 'document'
          ? mediaData.fileName || 'مستند'
          : mediaData.mediaType === 'video'
          ? 'مقطع فيديو'
          : mediaData.mediaType === 'audio'
          ? 'مقطع صوتي'
          : mediaData.mediaType === 'voice'
          ? 'تسجيل صوتي'
          : '');

      const newSentMessage: ChatMessage = {
        id: msgId,
        clientRequestId: mediaData.clientRequestId,
        sender: 'أنا',
        senderName: 'أنا',
        text: fallbackText,
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        timestampMs: Date.now(),
        chatName: groupName,
        chatJid: chatJid,
        isFromMe: true,
        deliveryStatus: 'sent',
        hasMedia: true,
        mediaUrl,
        mediaType: mediaData.mediaType,
        fileName: mediaData.fileName,
        fileSize: fileBuf.length,
        status: {
          forwardedTo: groupName,
        },
        quotedMessage: quotedPreview,
        rawBaileysMessage: sentMsg,
      };

      const existingIdx = this.incomingMessages.findIndex((m) => m.id === msgId);
      if (existingIdx !== -1) {
        this.incomingMessages[existingIdx] = {
          ...this.incomingMessages[existingIdx],
          ...newSentMessage,
        };
      } else {
        this.incomingMessages.unshift(newSentMessage);
      }
      this.persistData();
      this.events.emit('message', this.incomingMessages.find((m) => m.id === msgId) || newSentMessage);

      return {
        success: true,
        message: `تم إرسال ${
          mediaData.mediaType === 'sticker'
            ? 'الملصق'
            : mediaData.mediaType === 'document'
            ? 'المستند'
            : mediaData.mediaType === 'video'
            ? 'الفيديو'
            : 'الوسائط'
        } بنجاح إلى (${groupName}).`,
        messageId: msgId,
      };
    } catch (e: any) {
      console.error(`[WhatsApp] خطأ أثناء إرسال الوسائط إلى ${targetGroupNameOrJid}:`, e);
      return {
        success: false,
        message: `فشل إرسال الوسائط عبر واتساب: ${e.message}`,
      };
    }
  }

  /**
   * إرسال رسالة نصية مباشرة إلى محادثة أو رقم مع دعم الرد المقتبس
   */
  public async sendWhatsAppMessage(
    targetJidOrName: string,
    text: string,
    quotedMsgId?: string,
    quotedPayload?: any
  ): Promise<boolean> {
    const res = await this.forwardMessage(targetJidOrName, text, undefined, quotedMsgId, quotedPayload);
    return res.success;
  }

  /**
   * إرسال تفاعل إيموجي (Reaction) على رسالة في واتساب أو إلغاء التفاعل
   */
  public async reactToMessage(
    targetGroupNameOrJid: string,
    messageId: string,
    emoji: string
  ): Promise<{ success: boolean; message: string; reactions?: ChatMessage['reactions'] }> {
    if (!this.sock || this.connectionStatus !== 'CONNECTED') {
      return { success: false, message: 'واتساب غير متصل حالياً' };
    }

    try {
      const msg = this.incomingMessages.find((m) => m.id === messageId);
      let targetJid = targetGroupNameOrJid || msg?.chatJid || msg?.chatName;
      if (!targetJid) {
        return { success: false, message: 'تعذر تحديد المحادثة المستهدفة للتفاعل' };
      }

      if (!targetJid.includes('@')) {
        const foundGroup = this.userGroups.find((g) => g.name === targetJid || g.id === targetJid);
        if (foundGroup) targetJid = foundGroup.id;
      }

      const isGroup = targetJid.endsWith('@g.us');
      const isFromMe = Boolean(msg?.isFromMe || msg?.sender === 'أنا' || msg?.rawBaileysMessage?.key?.fromMe);
      const participant = isGroup
        ? (msg?.rawBaileysMessage?.key?.participant || msg?.rawBaileysMessage?.participant || (msg as any)?.senderJid)
        : undefined;

      const reactionKey = {
        remoteJid: targetJid,
        fromMe: isFromMe,
        id: messageId,
        ...(isGroup && participant ? { participant } : {}),
      };

      // إرسال التفاعل رسمياً إلى خوادم واتساب عبر بروتوكول Baileys
      await this.sock.sendMessage(targetJid, {
        react: {
          text: emoji || '', // إرسال نص فارغ لإلغاء التفاعل كما في واتساب الرسمي
          key: reactionKey,
        },
      });

      // تحديث مصفوفة التفاعلات المحلية للرسالة فوراً
      if (msg) {
        if (!Array.isArray(msg.reactions)) msg.reactions = [];
        const myReactionIdx = msg.reactions.findIndex((r) => r.isFromMe || r.sender === 'أنا');

        if (!emoji) {
          // إزالة التفاعل
          if (myReactionIdx !== -1) {
            msg.reactions.splice(myReactionIdx, 1);
          }
        } else {
          const myReactionObj = {
            text: emoji,
            sender: 'أنا',
            senderName: 'أنا',
            isFromMe: true,
            timestampMs: Date.now(),
          };
          if (myReactionIdx !== -1) {
            msg.reactions[myReactionIdx] = myReactionObj;
          } else {
            msg.reactions.push(myReactionObj);
          }
        }
        this.persistDataImmediate();
      }

      return {
        success: true,
        message: emoji ? 'تم إرسال التفاعل بنجاح' : 'تمت إزالة التفاعل بنجاح',
        reactions: msg?.reactions || [],
      };
    } catch (e: any) {
      console.error('[WhatsApp] خطأ أثناء إرسال التفاعل إلى واتساب:', e);
      return { success: false, message: `فشل إرسال التفاعل: ${e.message}` };
    }
  }

  /**
   * تعديل رسالة في التطبيق وعلى واتساب الفعلي
   */
  public async editMessage(
    messageId: string,
    newText: string,
    mentions?: string[]
  ): Promise<{ success: boolean; message: string; messageId?: string }> {
    const trimmed = (newText || '').trim();
    if (!trimmed) {
      return { success: false, message: 'نص الرسالة المعدل لا يمكن أن يكون فارغاً.' };
    }

    const msg = this.incomingMessages.find(
      (m) => m.id === messageId || m.rawBaileysMessage?.key?.id === messageId
    );
    if (!msg) {
      return { success: false, message: 'الرسالة غير موجودة في السجل.' };
    }

    // حفظ النص الأصلي إذا لم يسبق حفظه
    if (!msg.originalText) {
      msg.originalText = msg.text;
    }
    msg.text = this.decodeMentions(trimmed);
    msg.isEdited = true;
    msg.editedAt = Date.now();

    let waSuccess = false;
    let waError: string | null = null;

    // محاولة إرسال التعديل رسمياً إلى خوادم واتساب عبر بروتوكول Baileys
    if (this.sock && this.connectionStatus === 'CONNECTED' && msg.rawBaileysMessage?.key) {
      try {
        const rawKey = msg.rawBaileysMessage.key;
        let targetJid = rawKey.remoteJid || msg.chatJid;
        if (!targetJid && msg.chatName) {
          const found = this.userGroups.find((g) => g.name === msg.chatName);
          if (found) targetJid = found.id;
        }

        if (targetJid) {
          const isGroup = targetJid.endsWith('@g.us');
          const isFromMe = Boolean(rawKey.fromMe || msg.isFromMe || msg.sender === 'أنا');
          const participant = isGroup
            ? (rawKey.participant || msg.rawBaileysMessage?.participant || (msg as any)?.senderJid)
            : undefined;

          const editKey = {
            remoteJid: targetJid,
            fromMe: isFromMe,
            id: rawKey.id || msg.id,
            ...(isGroup && participant ? { participant } : {}),
          };

          const mentionOpts = mentions && mentions.length > 0 ? { mentions } : {};

          await this.sock.sendMessage(targetJid, {
            text: trimmed,
            edit: editKey,
            ...mentionOpts,
          });
          waSuccess = true;
          console.log(`[WhatsApp] تم تعديل الرسالة ${messageId} بنجاح على واتساب.`);
        }
      } catch (err: any) {
        waError = err?.message || String(err);
        console.warn(`[WhatsApp] تعذر تعديل الرسالة ${messageId} على واتساب:`, waError);
      }
    }

    this.persistDataImmediate();
    this.events.emit('message_update', {
      messageId: msg.id,
      text: msg.text,
      originalText: msg.originalText,
      isEdited: true,
      editedAt: msg.editedAt,
    });

    return {
      success: true,
      message: waSuccess
        ? 'تم تعديل الرسالة بنجاح في التطبيق وعلى واتساب.'
        : waError
        ? `تم تعديل الرسالة محلياً (ملاحظة من واتساب: ${waError})`
        : 'تم تعديل الرسالة بنجاح.',
      messageId: msg.id,
    };
  }

  /**
   * حذف الرسالة لدى الجميع في واتساب (Revoke) مع إبقائها في مكانها بالتطبيق ووسمها كمحذوفة
   */
  public async deleteWhatsAppMessage(
    messageId: string,
    forEveryone: boolean = true
  ): Promise<{ success: boolean; message: string }> {
    const msg = this.incomingMessages.find(
      (m) => m.id === messageId || m.rawBaileysMessage?.key?.id === messageId
    );
    if (!msg) {
      return { success: false, message: 'الرسالة غير موجودة في السجل.' };
    }

    let waSuccess = false;
    let waError: string | null = null;

    if (forEveryone && this.sock && this.connectionStatus === 'CONNECTED' && msg.rawBaileysMessage?.key) {
      try {
        const rawKey = msg.rawBaileysMessage.key;
        let targetJid = rawKey.remoteJid || msg.chatJid;
        if (!targetJid && msg.chatName) {
          const found = this.userGroups.find((g) => g.name === msg.chatName);
          if (found) targetJid = found.id;
        }

        if (targetJid) {
          const isGroup = targetJid.endsWith('@g.us');
          const isFromMe = Boolean(rawKey.fromMe || msg.isFromMe || msg.sender === 'أنا');
          const participant = isGroup
            ? (rawKey.participant || msg.rawBaileysMessage?.participant || (msg as any)?.senderJid)
            : undefined;

          const deleteKey = {
            remoteJid: targetJid,
            fromMe: isFromMe,
            id: rawKey.id || msg.id,
            ...(isGroup && participant ? { participant } : {}),
          };

          await this.sock.sendMessage(targetJid, {
            delete: deleteKey,
          });
          waSuccess = true;
          console.log(`[WhatsApp] تم إرسال أمر الحذف لدى الجميع للرسالة ${messageId} على واتساب.`);
        }
      } catch (err: any) {
        waError = err?.message || String(err);
        console.warn(`[WhatsApp] تعذر حذف الرسالة ${messageId} على واتساب:`, waError);
      }
    }

    // وسم الرسالة كمحذوفة مع إبقاء مكانها ونصها الأصلي
    msg.isDeleted = true;
    msg.deletedAt = Date.now();
    this.getRevokedIds().add(msg.id);
    this.persistDataImmediate();

    this.events.emit('message_update', {
      messageId: msg.id,
      isDeleted: true,
      deletedAt: msg.deletedAt,
      text: msg.text,
      originalText: msg.originalText,
    });

    return {
      success: true,
      message: waSuccess
        ? 'تم حذف الرسالة لدى الجميع في واتساب بنجاح، وستبقى معلّمة كمحذوفة لديك.'
        : waError
        ? `تم وسم الرسالة كمحذوفة (تعذر حذفها على واتساب: ${waError})`
        : 'تم وسم الرسالة كمحذوفة بنجاح.',
    };
  }

  public async getChatInfo(chatJidOrName: string): Promise<ChatInfoResult> {
    let jid = chatJidOrName || '';
    let grp = this.userGroups.find((g) => g.id === jid || g.name === jid);
    if (!grp) {
      const m = this.incomingMessages.find(
        (msg) => msg.chatJid === jid || msg.chatName === jid || msg.senderName === jid
      );
      if (m) {
        grp = {
          id: m.chatJid || jid,
          name: m.chatName || m.senderName || jid,
          isGroup: Boolean(m.chatJid?.endsWith('@g.us')),
        };
      }
    }
    const finalJid = grp?.id || jid;
    const isGroup = Boolean(finalJid.endsWith('@g.us') || grp?.isGroup);
    const chatName = grp?.name || chatJidOrName;
    const digits = finalJid.split('@')[0].split(':')[0].replace(/\D/g, '');
    let avatarUrl = grp?.avatarUrl || this.avatarsMap[digits] || undefined;
    if (!avatarUrl && this.sock && this.connectionStatus === 'CONNECTED') {
      try {
        const fetchedUrl = await this.getProfilePicture(finalJid);
        if (fetchedUrl) {
          avatarUrl = fetchedUrl;
          if (grp) grp.avatarUrl = fetchedUrl;
        }
      } catch {}
    }

    // الوسائط والمستندات المشتركة
    const chatMessages = this.incomingMessages.filter((m) => {
      const mJid = m.chatJid || m.rawBaileysMessage?.key?.remoteJid;
      const mName = m.chatName || m.senderName;
      return (
        mJid === finalJid ||
        mName === chatName ||
        (mJid && jid && mJid === jid) ||
        (mName && jid && mName === jid)
      );
    });

    const mediaMessages = chatMessages.filter((m) => m.hasMedia && m.mediaUrl);
    let imagesCount = 0;
    let videosCount = 0;
    let docsCount = 0;
    let audioCount = 0;
    for (const m of mediaMessages) {
      if (m.mediaType === 'image') imagesCount++;
      else if (m.mediaType === 'video') videosCount++;
      else if (m.mediaType === 'document') docsCount++;
      else if (m.mediaType === 'audio' || m.mediaType === 'voice') audioCount++;
      else imagesCount++;
    }

    const recentMedia = mediaMessages
      .slice(-30)
      .reverse()
      .map((m) => ({
        id: m.id,
        mediaUrl: m.mediaUrl || '',
        mediaType: m.mediaType || 'image',
        fileName: m.fileName,
        timestamp: m.timestamp,
        timestampMs: m.timestampMs,
      }));

    let description = '';
    let creationDate: number | undefined;
    let createdBy: { jid: string; name: string } | undefined;
    let participants: GroupParticipantInfo[] = [];

    if (isGroup) {
      try {
        if (this.sock && this.connectionStatus === 'CONNECTED') {
          const meta = await this.sock.groupMetadata(finalJid);
          description = meta?.desc ? meta.desc.toString() : '';
          if (meta?.creation) creationDate = meta.creation * 1000;
          if (meta?.owner) {
            const p = this.describePerson(meta.owner);
            createdBy = { jid: meta.owner, name: p.name || meta.owner.split('@')[0] };
          }
          const bareUser = (j?: string) => (j || '').split('@')[0].split(':')[0];
          participants = (meta?.participants || []).map((p: any) => {
            const person = this.describePerson(p.phoneNumber || p.id);
            const phoneDigits = bareUser(p.phoneNumber) || (p.id.endsWith('@s.whatsapp.net') ? bareUser(p.id) : '');
            let name = person.name;
            if (!name || /^[+\d\s]+$/.test(name)) {
              const ids = [bareUser(p.id), phoneDigits].filter(Boolean);
              const fromMsg = this.incomingMessages.find((m) => {
                const k = m.rawBaileysMessage?.key;
                return m.rawBaileysMessage?.pushName && ids.includes(bareUser(k?.participant || k?.participantAlt || m.rawBaileysMessage?.participant || ''));
              });
              if (fromMsg?.rawBaileysMessage?.pushName) name = fromMsg.rawBaileysMessage.pushName;
            }
            return {
              jid: p.id,
              name: name || (phoneDigits ? `+${phoneDigits}` : p.id.split('@')[0]),
              avatarUrl: person.avatarUrl,
              phone: phoneDigits ? `+${phoneDigits}` : undefined,
              isAdmin: Boolean(p.admin),
            };
          }).sort((a: GroupParticipantInfo, b: GroupParticipantInfo) => {
            if (a.isAdmin && !b.isAdmin) return -1;
            if (!a.isAdmin && b.isAdmin) return 1;
            return a.name.localeCompare(b.name, 'ar');
          });
        }
      } catch (e) {
        console.warn('[WhatsApp] فشل جلب تفاصيل المجموعة من السيرفر:', e);
      }

      if (participants.length === 0) {
        participants = await this.getGroupParticipants(finalJid);
      }
    }

    const contact = this.resolveRealContact(finalJid);
    const phone = grp?.phone || contact.formattedPhone || (finalJid.endsWith('@s.whatsapp.net') ? `+${digits}` : undefined);

    return {
      id: finalJid,
      name: chatName,
      isGroup,
      avatarUrl,
      phone,
      description,
      creationDate,
      createdBy,
      participantsCount: isGroup ? participants.length : 2,
      participants,
      mediaSummary: {
        totalMedia: mediaMessages.length,
        imagesCount,
        videosCount,
        docsCount,
        audioCount,
        recentMedia,
      },
    };
  }

  public async clearChatMessages(chatJidOrName: string): Promise<{ success: boolean; clearedCount: number; message: string }> {
    let jid = chatJidOrName || '';
    const grp = this.userGroups.find((g) => g.id === jid || g.name === jid);
    const name = grp ? grp.name : jid;
    if (grp) jid = grp.id;

    const beforeCount = this.incomingMessages.length;
    this.incomingMessages = this.incomingMessages.filter((m) => {
      const mJid = m.chatJid || m.rawBaileysMessage?.key?.remoteJid;
      const mName = m.chatName || m.senderName;
      return mJid !== jid && mName !== name && mJid !== chatJidOrName && mName !== chatJidOrName;
    });
    const clearedCount = beforeCount - this.incomingMessages.length;
    this.persistDataImmediate();
    this.events.emit('chat_cleared', { jid, name, clearedCount });
    return { success: true, clearedCount, message: `تم مسح محتوى المحادثة بنجاح (${clearedCount} رسالة).` };
  }

  public async exitGroup(groupJidOrName: string): Promise<{ success: boolean; message: string }> {
    let jid = groupJidOrName || '';
    const grp = this.userGroups.find((g) => g.id === jid || g.name === jid);
    if (grp) jid = grp.id;

    let waSuccess = false;
    if (jid.endsWith('@g.us') && this.sock && this.connectionStatus === 'CONNECTED') {
      try {
        await this.sock.groupLeave(jid);
        waSuccess = true;
      } catch (e) {
        console.warn('[WhatsApp] فشل تنفيذ أمر groupLeave على واتساب:', e);
      }
    }

    this.userGroups = this.userGroups.filter((g) => g.id !== jid && g.name !== groupJidOrName);
    this.persistDataImmediate();
    this.events.emit('group_left', { jid, groupName: grp?.name || groupJidOrName });
    return {
      success: true,
      message: waSuccess ? 'تمت مغادرة المجموعة على واتساب بنجاح.' : 'تمت إزالة المحادثة من قائمتك بنجاح.',
    };
  }

  public async updateGroupDescription(groupJidOrName: string, description: string): Promise<{ success: boolean; message: string }> {
    let jid = groupJidOrName || '';
    const grp = this.userGroups.find((g) => g.id === jid || g.name === jid);
    if (grp) jid = grp.id;

    if (jid.endsWith('@g.us') && this.sock && this.connectionStatus === 'CONNECTED') {
      try {
        await this.sock.groupUpdateDescription(jid, description || '');
        return { success: true, message: 'تم تحديث وصف المجموعة في واتساب بنجاح.' };
      } catch (e: any) {
        return { success: false, message: e?.message || 'تعذر تحديث الوصف على واتساب.' };
      }
    }
    return { success: true, message: 'تم حفظ الوصف.' };
  }

  public async logout(): Promise<{ success: boolean; message: string }> {
    try {
      if (this.sock) {
        const oldSocket = this.sock;
        this.sock = null;
        oldSocket.ev.removeAllListeners('connection.update');
        try {
          await oldSocket.logout();
        } catch (e) {}
        oldSocket.end(undefined);
      }
    } catch (e) {}

    // حذف مفاتيح الربط فقط؛ إبقاء سجل الرسائل وجهات الاتصال والقوائم المحلية.
    try {
      if (fs.existsSync(this.authDir)) {
        const files = fs.readdirSync(this.authDir);
        for (const file of files) {
          if (file.startsWith('stored_') || file === 'custom_lists.json') continue;
          try {
            fs.unlinkSync(path.join(this.authDir, file));
          } catch (e) {}
        }
      }
    } catch (e) {}

    this.connectionStatus = 'DISCONNECTED';
    this.isConnecting = false;
    this.connectedUser = null;
    this.qrCodeDataUrl = null;
    this.releaseLock();

    // إعادة الاتصال لتوليد رمز QR جديد فوراً
    this.connect().catch((e) => console.error('خطأ توليد الرمز بعد تسجيل الخروج:', e));

    return { success: true, message: 'تم تسجيل الخروج بنجاح وتوليد رمز QR جديد للربط.' };
  }
}

export const whatsappManager = new Proxy({} as WhatsAppManager, {
  get(_target, prop) {
    const inst = WhatsAppManager.getInstance();
    const val = (inst as any)[prop];
    if (typeof val === 'function') {
      return val.bind(inst);
    }
    return val;
  },
  set(_target, prop, value) {
    const inst = WhatsAppManager.getInstance();
    (inst as any)[prop] = value;
    return true;
  },
});

export function getWhatsAppManager(req?: any): WhatsAppManager {
  if (typeof req === 'string') {
    return WhatsAppManager.getInstance(req);
  }
  const user = getAuthUserFromRequest(req);
  if (user?.id) {
    return WhatsAppManager.getInstance(user.id);
  }
  if (req) throw new Error('WhatsApp session requires authentication');
  return WhatsAppManager.getInstance('recmrgqBhC2YImlC0');
}

// بدء تهيئة الجلسات المحفوظة لكافة المستخدمين تلقائياً عند تشغيل الخادم
const isGlobalBuildPhase =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.argv.some((arg) => arg.includes('build') || arg.includes('next-build'));
if (!isGlobalBuildPhase) {
  setTimeout(() => {
    WhatsAppManager.initAllSessions();
    import('@/lib/desktop-drive-backup').then(({ startDesktopBackupScheduler }) => {
      startDesktopBackupScheduler();
    }).catch((error) => console.warn('تعذر بدء النسخ الدوري إلى Drive:', error));
  }, 1000);
}
